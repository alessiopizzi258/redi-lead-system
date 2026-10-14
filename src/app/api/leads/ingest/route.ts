import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@prisma/client";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const dynamic = "force-dynamic";

// ----------------------------------------------------------------------
// 1. INIZIALIZZAZIONE CODE (BULLMQ + REDIS)
// ----------------------------------------------------------------------
// Il riutilizzo della connessione evita memory leak su istanze serverless
const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  tls: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});
const leadQueue = new Queue('lead-processing', { connection });

// ----------------------------------------------------------------------
// 2. SCHEMA DI VALIDAZIONE BLINDATO (ZOD)
// ----------------------------------------------------------------------
const ingestSchema = z.object({
  firstName: z.string().min(2, "Nome troppo corto").optional(),
  lastName: z.string().min(2, "Cognome troppo corto").optional(),
  email: z.string().email("Email non valida"),
  phone: z.string().optional(),
  urgency: z.enum(["HIGH", "MEDIUM", "LOW"]),
  role: z.enum(["OWNER", "MANAGER", "DIRECTOR", "C_LEVEL", "EMPLOYEE", "OTHER"]),
  budget: z.number().nullable().optional(),
  problemDescription: z.string().optional(),
});

type IngestData = z.infer<typeof ingestSchema>;

// ----------------------------------------------------------------------
// 3. SETACCIO MATEMATICO (ICP SCORING ENGINE)
// ----------------------------------------------------------------------
function calculateICPScore(data: IngestData): number {
  let score = 0;

  // Modulatore Urgenza (Max 40)
  if (data.urgency === "HIGH") score += 40;
  else if (data.urgency === "MEDIUM") score += 20;

  // Modulatore Potere Decisionale (Max 30)
  if (["OWNER", "C_LEVEL", "DIRECTOR"].includes(data.role)) score += 30;
  else if (data.role === "MANAGER") score += 15;

  // Modulatore Capacità di Spesa (Max 30)
  if (data.budget && data.budget > 0) score += 30;

  // Cap massimo per sicurezza costrutto
  return Math.min(score, 100);
}

// ----------------------------------------------------------------------
// 4. ROUTE HANDLER POST
// ----------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    // A. Autenticazione Server-Side (Nessun tenantId nel body, blindato tramite API Key)
    const apiKey = req.headers.get("x-rls-api-key");
    if (!apiKey) return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });

    const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
    if (!tenant) return NextResponse.json({ success: false, message: "Credenziali Tenant non valide" }, { status: 403 });

    // B. Parsing e Validazione Strict
    const body = await req.json();
    const parsed = ingestSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Payload non conforme ai requisiti RLS", errors: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // C. Calcolo Algoritmico
    const icpScore = calculateICPScore(data);
    
    // Condizionale di stato: scartiamo (NURTURING) chi non supera la soglia logica minima
    const targetStatus = icpScore >= 50 ? LeadStatus.PENDING_OTP : LeadStatus.NURTURING;

    // D. Persistenza Dati (Upsert per evitare duplicati logici)
    const profile = await prisma.profile.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: data.email } },
      update: {
        contactCount: { increment: 1 },
        lastActivityAt: new Date(),
        urgency: data.urgency,
        role: data.role,
        budget: data.budget,
        problemDescription: data.problemDescription,
        icpScore: icpScore,
      },
      create: {
        tenantId: tenant.id,
        email: data.email,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        phone: data.phone || "",
        source: "RLS_Algorithmic_Ingestion",
        segment: "Freddo",
        status: targetStatus,
        urgency: data.urgency,
        role: data.role,
        budget: data.budget,
        problemDescription: data.problemDescription,
        icpScore: icpScore,
        isVerified: false,
        lastActivityAt: new Date(),
      }
    });

    // E. Esecuzione Asincrona (Offload su BullMQ)
    // Selezioniamo solo i "Power Leads" per l'elaborazione prioritaria
    if (icpScore > 70) {
      await leadQueue.add(
        "process-power-lead", 
        { profileId: profile.id, tenantId: tenant.id, icpScore },
        { 
          attempts: 3, 
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: true 
        }
      );
      console.log(`🚀 [RLS] Power Lead accodato su BullMQ. (Score: ${icpScore}, Email: ${data.email})`);
    } else {
      console.log(`⚖️ [RLS] Lead standard intercettato. (Score: ${icpScore}, Status: ${targetStatus})`);
    }

    // F. Risposta istantanea (Latenza ottimizzata)
    return NextResponse.json({ 
      success: true, 
      profileId: profile.id,
      status: targetStatus,
      score: icpScore,
      message: "Lead intercettato e sottoposto a setaccio matematico."
    }, { status: 200 });

  } catch (error: unknown) {
    // Gestione errori controllata per evitare il collasso del processo
    if (error instanceof Error) {
      console.error("❌ [RLS Ingestion FATAL ERROR]:", error.message);
    } else {
      console.error("❌ [RLS Ingestion FATAL ERROR]: Unknown exception");
    }
    return NextResponse.json({ success: false, message: "Errore interno del server" }, { status: 500 });
  }
}
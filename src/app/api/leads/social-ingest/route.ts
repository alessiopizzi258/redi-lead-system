import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

// 1. SCHEMA DI VALIDAZIONE ELASTICO PER WEBHOOK SOCIAL
// Sui social i dati sono spesso incompleti. Usiamo .optional() e .default() 
// per non rifiutare il payload, ma declassarlo in fase di scoring.
const socialIngestSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email("Email non valida"), // L'email resta l'unico dato tassativo
  phone: z.string().optional(),
  urgency: z.enum(["HIGH", "MEDIUM", "LOW"]).default("LOW"),
  role: z.enum(["OWNER", "MANAGER", "DIRECTOR", "C_LEVEL", "EMPLOYEE", "OTHER"]).default("OTHER"),
  budget: z.number().nullable().optional(),
  problemDescription: z.string().optional(),
  
  // Parametri di tracciamento UTM essenziali per calcolare il ROI delle Ads
  utmSource: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmMedium: z.string().optional(),
});

// 2. MOTORE DI SCORING ASIMMETRICO
function calculateSocialICPScore(data: z.infer<typeof socialIngestSchema>): number {
  let score = 0;
  
  // Assegnazione pesi standard basata sulle risposte del modulo
  if (data.urgency === "HIGH") score += 40;
  else if (data.urgency === "MEDIUM") score += 20;

  if (["OWNER", "C_LEVEL", "DIRECTOR"].includes(data.role)) score += 30;
  else if (data.role === "MANAGER") score += 15;

  if (data.budget && data.budget > 0) score += 30;

  // IL MALUS SOCIALE: Sottraiamo 15 punti di default per compensare 
  // l'impulsività del click sui social network.
  score -= 15;

  // Mantiene il punteggio strettamente nel range 0-100
  return Math.max(0, Math.min(score, 100));
}

// 3. ENDPOINT DI RICEZIONE (POST)
export async function POST(req: NextRequest) {
  try {
    // Autenticazione Server-to-Server. Il webhook da Zapier/Make DEVE 
    // avere questo header, altrimenti la richiesta viene respinta istantaneamente.
    const apiKey = req.headers.get("x-rls-api-key");
    if (!apiKey) return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });

    // Verifica che l'API Key appartenga a un Tenant reale nel nostro database
    const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
    if (!tenant) return NextResponse.json({ success: false, message: "Credenziali Tenant non valide" }, { status: 403 });

    // Estrazione e validazione del payload JSON
    const body = await req.json();
    const parsed = socialIngestSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Payload non conforme", errors: parsed.error.format() }, 
        { status: 400 }
      );
    }

    const data = parsed.data;
    
    // Calcolo del punteggio penalizzato
    const icpScore = calculateSocialICPScore(data);
    
    // ROUTING STRATEGICO: 
    // Nessun lead social diventa "QUALIFIED" subito.
    // Se ha un punteggio alto (>60) va in "PENDING_VERIFICATION" (in attesa che interagisca con un'email).
    // Se è basso, va dritto nel cimitero attivo del "NURTURING".
    const targetStatus = icpScore >= 60 ? "PENDING_VERIFICATION" : LeadStatus.NURTURING;

    // Inserimento o Aggiornamento nel database (Upsert previene duplicati se lo stesso lead clicca due volte)
    const profile = await prisma.profile.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: data.email } },
      update: {
        contactCount: { increment: 1 },
        lastActivityAt: new Date(),
        utmSource: data.utmSource,
        utmCampaign: data.utmCampaign,
        utmMedium: data.utmMedium,
      },
      create: {
        tenantId: tenant.id,
        email: data.email,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        phone: data.phone || "",
        source: "Social_Ingestion",
        segment: "Freddo",
        status: targetStatus as any, 
        urgency: data.urgency,
        role: data.role,
        budget: data.budget,
        problemDescription: data.problemDescription,
        icpScore: icpScore,
        isVerified: false,
        lastActivityAt: new Date(),
        utmSource: data.utmSource,
        utmCampaign: data.utmCampaign,
        utmMedium: data.utmMedium,
      }
    });

    // Risposta di successo al sistema mittente (es. Zapier riceve 200 OK)
    return NextResponse.json({ 
      success: true, 
      profileId: profile.id,
      status: targetStatus,
      score: icpScore 
    }, { status: 200 });

  } catch (error: any) {
    // Log dell'errore per monitoraggio backend senza esporre dati sensibili al client
    console.error("❌ [Social Ingest Error]:", error.message);
    return NextResponse.json({ success: false, message: "Errore interno del server" }, { status: 500 });
  }
}
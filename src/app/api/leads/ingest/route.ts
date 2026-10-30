import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role } from "@prisma/client";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { ValidationAndFeederService } from "@/lib/services/validationAndFeederService";

export const dynamic = "force-dynamic";

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  family: 4,
  tls: process.env.REDIS_URL?.startsWith("rediss://") || process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined
});
const leadQueue = new Queue("lead-processing", { connection });

// Schema Ibrido B2B + B2C (Non blocca le utenze private di Scintilla Hub)
const ingestSchema = z.object({
  firstName: z.string().min(2, "Nome troppo corto").optional(),
  lastName: z.string().min(2, "Cognome troppo corto").optional(),
  email: z.string().email("Email non valida"),
  phone: z.string().optional(),
  vatNumber: z.string().optional(),
  leadType: z.enum(["B2B", "B2C"]).optional(),
  urgency: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  role: z.enum([
    "OWNER", "MANAGER", "DIRECTOR", "C_LEVEL", "EMPLOYEE", "OTHER",
    "PRIVATE_HOMEOWNER", "PRIVATE_TENANT", "FAMILY_DECISION_MAKER"
  ]).optional().default("FAMILY_DECISION_MAKER"),
  budget: z.number().nullable().optional(), // In B2C rappresenta la spesa bolletta mensile/annua
  problemDescription: z.string().optional(),
  honeypot: z.string().optional(), // Campo trappola anti-bot (Fase 3 documento)
});

type IngestData = z.infer<typeof ingestSchema>;

function calculateHybridICPScore(data: IngestData, isB2C: boolean): number {
  let score = 0;

  // 1. Modulatore Urgenza (Max 40)
  if (data.urgency === "HIGH") score += 40;
  else if (data.urgency === "MEDIUM") score += 25;
  else score += 10;

  if (isB2C) {
    // --- LOGICA B2C (Scintilla Hub: Famiglie / Utenze Luce & Gas) ---
    if (["PRIVATE_HOMEOWNER", "FAMILY_DECISION_MAKER", "OWNER"].includes(data.role)) {
      score += 30; // Titolare di bolletta / decisore familiare
    } else {
      score += 20;
    }
    // Se ha indicato una spesa bolletta o ha lasciato il telefono verificabile
    if ((data.budget && data.budget > 0) || (data.phone && data.phone.length >= 9)) {
      score += 30;
    }
  } else {
    // --- LOGICA B2B CLASSICA ---
    if (["OWNER", "C_LEVEL", "DIRECTOR"].includes(data.role)) score += 30;
    else if (data.role === "MANAGER") score += 15;

    if (data.budget && data.budget > 0) score += 30;
  }

  return Math.min(score, 100);
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-rls-api-key")?.trim();
    if (!apiKey) return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });

    const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
    if (!tenant) return NextResponse.json({ success: false, message: "Credenziali Tenant non valide" }, { status: 403 });

    const body = await req.json();
    const parsed = ingestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Payload non conforme ai requisiti RLS", errors: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // 1. CONTROLLO AFFIDABILITÀ ANTI-FAKE (Fase 3 Documento: Honeypot + DNS MX + Telefono)
    if (data.honeypot && data.honeypot.length > 0) {
      return NextResponse.json({ success: false, message: "Bot rilevato." }, { status: 403 });
    }

    const emailCheck = await ValidationAndFeederService.verifyRealEmail(data.email);
    const phoneCheck = ValidationAndFeederService.verifyPhone(data.phone);

    const isFakeOrAnomalous = !emailCheck.valid || !phoneCheck.valid;

    // Rilevamento automatico B2C (se il Tenant è Scintilla Hub o l'email è personale senza P.IVA)
    const isB2C =
      data.leadType === "B2C" ||
      tenant.companyName.toLowerCase().includes("scintilla") ||
      (emailCheck.isPersonal && !data.vatNumber);

    // 2. CALCOLO SCORING IBRIDO B2B/B2C
    const icpScore = isFakeOrAnomalous ? 0 : calculateHybridICPScore(data, isB2C);
    const threshold = tenant.qualificationThreshold || 50;

    let targetStatus: LeadStatus = LeadStatus.NURTURING;
    if (isFakeOrAnomalous) {
      targetStatus = LeadStatus.ANOMALO; // Isolato in quarantena come da specifica
    } else if (icpScore >= threshold) {
      targetStatus = LeadStatus.PENDING_OTP;
    }

    // 3. SALVATAGGIO PROFILO
    const profile = await prisma.profile.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: data.email.toLowerCase() } },
      update: {
        contactCount: { increment: 1 },
        lastActivityAt: new Date(),
        phone: phoneCheck.normalized || data.phone,
        vatNumber: data.vatNumber,
        leadType: isB2C ? "B2C" : "B2B",
        urgency: data.urgency,
        role: data.role as Role,
        budget: data.budget,
        problemDescription: data.problemDescription,
        icpScore,
        status: targetStatus,
      },
      create: {
        tenantId: tenant.id,
        email: data.email.toLowerCase(),
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        phone: phoneCheck.normalized || data.phone || "",
        vatNumber: data.vatNumber,
        leadType: isB2C ? "B2C" : "B2B",
        source: "RLS_Algorithmic_Ingestion",
        segment: icpScore >= 70 ? "Caldo" : icpScore >= threshold ? "Tiepido" : "Freddo",
        status: targetStatus,
        urgency: data.urgency,
        role: data.role as Role,
        budget: data.budget,
        problemDescription: data.problemDescription,
        icpScore,
        isVerified: false,
        lastActivityAt: new Date(),
      }
    });

    // 4. GENERAZIONE E INVIO AUTOMATICO OTP A 6 CIFRE (Se il lead merita qualificazione)
    if (targetStatus === LeadStatus.PENDING_OTP) {
      await ValidationAndFeederService.generateAndSendOtp(
        profile.id,
        profile.email,
        profile.phone || undefined,
        tenant.companyName
      );
    }

    // 5. OFFLOAD SU CODA PER POWER LEADS
    if (icpScore >= 70 && !isFakeOrAnomalous) {
      await leadQueue.add(
        "process-power-lead",
        { profileId: profile.id, tenantId: tenant.id, icpScore },
        { attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: true }
      );
    }

    return NextResponse.json({
      success: !isFakeOrAnomalous,
      profileId: profile.id,
      leadType: isB2C ? "B2C" : "B2B",
      status: targetStatus,
      score: icpScore,
      otpSent: targetStatus === LeadStatus.PENDING_OTP,
      message: isFakeOrAnomalous
        ? `Contatto isolato in quarantena: ${emailCheck.reason || "Telefono non valido"}`
        : "Lead intercettato, qualificato e codice OTP inviato."
    }, { status: 200 });

  } catch (error: any) {
    console.error("❌ [RLS Ingestion FATAL ERROR]:", error.message);
    return NextResponse.json({ success: false, message: "Errore interno del server" }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@prisma/client";
import { ValidationAndFeederService } from "@/lib/services/validationAndFeederService";

export const dynamic = "force-dynamic";

const crmFeedbackSchema = z.object({
  email: z.string().email(),
  dealStatus: z.enum(["CONTACTED", "APPOINTMENT", "WON", "LOST", "INVALID_CONTACT"]),
  dealValue: z.number().optional().default(0),
  notes: z.string().optional()
});

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-rls-api-key")?.trim();
    if (!apiKey) return NextResponse.json({ success: false, message: "API Key mancante" }, { status: 401 });

    const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
    if (!tenant) return NextResponse.json({ success: false, message: "Tenant non autorizzato" }, { status: 403 });

    const body = await req.json();
    const parsed = crmFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, errors: parsed.error.format() }, { status: 400 });
    }

    const { email, dealStatus, dealValue } = parsed.data;

    const profile = await prisma.profile.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: email.toLowerCase() } }
    });

    if (!profile) {
      return NextResponse.json({ success: false, message: "Lead non trovato per questo Tenant" }, { status: 404 });
    }

    // Ricalibrazione automatica dello Scoring in base all'esito commerciale reale (Ciclo di Taratura)
    let newScore = profile.icpScore;
    let newStatus = profile.status;
    let newSegment = profile.segment;

    if (dealStatus === "WON") {
      newScore = 100;
      newStatus = LeadStatus.QUALIFIED;
      newSegment = "Cliente Acquisito";
    } else if (dealStatus === "APPOINTMENT") {
      newScore = Math.min(100, profile.icpScore + 20);
      newStatus = LeadStatus.QUALIFIED;
      newSegment = "Caldo";
    } else if (dealStatus === "LOST") {
      newScore = Math.max(20, profile.icpScore - 30);
      newStatus = LeadStatus.NURTURING; // Torna in Nurturing per riattivazione futura
      newSegment = "Tiepido";
    } else if (dealStatus === "INVALID_CONTACT") {
      newScore = 0;
      newStatus = LeadStatus.REJECTED;
      newSegment = "Scartato";
    }

    const updatedProfile = await prisma.profile.update({
      where: { id: profile.id },
      data: {
        dealStatus,
        dealValue,
        totalRevenue: dealStatus === "WON" ? { increment: dealValue } : undefined,
        icpScore: newScore,
        status: newStatus,
        segment: newSegment,
        lastContactedAt: new Date()
      }
    });

    // Se il contatto ha fissato un appuntamento o firmato il contratto, invia il segnale di alto valore a Meta/Google
    if (dealStatus === "WON" || dealStatus === "APPOINTMENT") {
      ValidationAndFeederService.fireAlgorithmFeeder(profile.id).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      message: `Esito CRM (${dealStatus}) registrato e scoring ricalibrato a ${newScore}/100.`,
      profile: {
        id: updatedProfile.id,
        icpScore: updatedProfile.icpScore,
        status: updatedProfile.status,
        totalRevenue: updatedProfile.totalRevenue
      }
    });

  } catch (error: any) {
    console.error("❌ [CRM Webhook Error]:", error.message);
    return NextResponse.json({ success: false, message: "Errore interno" }, { status: 500 });
  }
}
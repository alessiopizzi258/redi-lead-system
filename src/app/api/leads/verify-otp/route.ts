import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { RfmService } from "@/lib/services/rfmService";
import { LeadStatus } from "@prisma/client";
import { DeliveryService } from "@/lib/services/deliveryService";

export const dynamic = "force-dynamic";

// 1. SCHEMA DI VALIDAZIONE STRICT (ZOD)
const verifySchema = z.object({
  profileId: z.string().min(1, "Profile ID obbligatorio"),
  token: z.string().length(6, "Il token deve essere di 6 cifre").regex(/^\d+$/, "Solo numeri"),
});

export async function POST(req: NextRequest) {
  try {
    // A. Parsing e Validazione
    const body = await req.json();
    const parsed = verifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Parametri mancanti o non validi." }, 
        { status: 400 }
      );
    }

    const { profileId, token } = parsed.data;

    // B. Ricerca e validazione temporale del Token
    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        profileId: profileId,
        token: token,
        expiresAt: { gt: new Date() } // Accetta solo token nel futuro
      },
      include: {
        profile : true
      }
    });

    if (!otpRecord) {
      return NextResponse.json({ success: false, message: "Codice OTP non valido o scaduto." }, { status: 401 });
    }

    // C. Sblocco del Profilo in transazione atomica
    await prisma.$transaction([
      prisma.profile.update({
        where: { id: profileId },
        data: { 
          isVerified: true, 
          status: LeadStatus.QUALIFIED // <-- Allineato all'infrastruttura RLS
        } 
      }),
      prisma.otpToken.deleteMany({
        where: { profileId: profileId } // Epurazione totale dei token per questo lead
      })
    ]);

    // D. Ricalcolo Scoring e Iniezione nel CRM (La tua logica originale)
    const syncResult = await RfmService.syncProfileScore(profileId);
    DeliveryService.sendLeadToTenant(profileId, otpRecord.profile.tenantId).catch(console.error);
    console.log(`✅ [Livello 2] OTP confermato. Profilo ${profileId} armato e inserito nel segmento: ${syncResult?.newSegment}`);

    // E. Risposta al client
    return NextResponse.json({ 
      success: true, 
      message: "Verifica completata. Accesso al sistema sbloccato.",
      segment: syncResult?.newSegment
    }, { status: 200 });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";
    console.error("❌ [OTP Fatal Error]:", errorMessage);
    return NextResponse.json({ success: false, message: "Errore interno del server." }, { status: 500 });
  }
}
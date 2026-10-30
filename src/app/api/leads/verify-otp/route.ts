import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { RfmService } from "@/lib/services/rfmService";
import { LeadStatus } from "@prisma/client";
import { DeliveryService } from "@/lib/services/deliveryService";
import { ValidationAndFeederService } from "@/lib/services/validationAndFeederService";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  profileId: z.string().min(1, "Profile ID obbligatorio"),
  token: z.string().length(6, "Il token deve essere di 6 cifre").regex(/^\d+$/, "Solo numeri"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = verifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Parametri mancanti o non validi." }, { status: 400 });
    }

    const { profileId, token } = parsed.data;

    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        profileId,
        token,
        expiresAt: { gt: new Date() }
      },
      include: {
        profile: { include: { tenant: true } }
      }
    });

    if (!otpRecord) {
      return NextResponse.json({ success: false, message: "Codice OTP non valido o scaduto." }, { status: 401 });
    }

    const tenant = otpRecord.profile.tenant;
    const canUnlockWithCredits = tenant.autoUnlockLeads && tenant.credits > 0;

    // Transazione atomica: Qualifica il Lead + Scala 1 RLS Credit (se disponibile) + Pulisce OTP
    await prisma.$transaction([
      prisma.profile.update({
        where: { id: profileId },
        data: {
          isVerified: true,
          status: LeadStatus.QUALIFIED,
          isUnlocked: canUnlockWithCredits,
          unlockedAt: canUnlockWithCredits ? new Date() : null
        }
      }),
      ...(canUnlockWithCredits
        ? [
            prisma.tenant.update({
              where: { id: tenant.id },
              data: { credits: { decrement: 1 } }
            })
          ]
        : []),
      prisma.otpToken.deleteMany({
        where: { profileId }
      })
    ]);

    // Ricalcolo RFM Score
    const syncResult = await RfmService.syncProfileScore(profileId);

    // Consegna al Commerciale + Innesco Algorithm Feeder (Meta CAPI / Google Ads)
    DeliveryService.sendLeadToTenant(profileId, tenant.id).catch(console.error);
    ValidationAndFeederService.fireAlgorithmFeeder(profileId).catch(console.error);

    return NextResponse.json({
      success: true,
      message: "Verifica completata. Contatto qualificato e consegnato.",
      segment: syncResult?.newSegment,
      unlockedWithCredit: canUnlockWithCredits
    }, { status: 200 });

  } catch (error: any) {
    console.error("❌ [OTP Fatal Error]:", error.message);
    return NextResponse.json({ success: false, message: "Errore interno del server." }, { status: 500 });
  }
}
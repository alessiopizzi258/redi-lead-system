import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RfmService } from "@/lib/services/rfmService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  const uid = searchParams.get("uid");
  const tid = searchParams.get("tid");
  const cid = searchParams.get("cid");
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.redirect(process.env.NEXT_PUBLIC_APP_URL || "https://designlabstudio.it", 302);
  }

  if (!uid || !tid) {
    console.warn(`⚠️ [Tracking] Click anonimo o parametri mancanti verso: ${targetUrl}`);
    return NextResponse.redirect(targetUrl, 302);
  }

  try {
    const [profile] = await Promise.all([
      prisma.profile.update({
        where: { id: uid },
        data: { 
          totalClicks: { increment: 1 },
          lastActivityAt: new Date() 
        },
        select: { totalClicks: true, email: true }
      }),
      prisma.trackingEvent.create({
        data: {
          type: "CLICK",
          url: targetUrl,
          profileId: uid,
          tenantId: tid,
          campaignId: cid || null,
        }
      })
    ]);

    // 👉 TRIGGER RICALCOLO GLOBALE
    const syncResult = await RfmService.syncProfileScore(uid);

    // TRIGGER COMPORTAMENTALE BASATO SUL SEGMENTO DINAMICO
    if (syncResult?.newSegment === "Caldo" || syncResult?.newSegment === "Urgente") {
      console.log(`🔥 [Trigger] Il lead ${profile.email} ha raggiunto il segmento ${syncResult.newSegment}.`);
      
      await prisma.$transaction([
        prisma.automationLog.create({
          data: {
            tenantId: tid,
            profileId: uid,
            emailAddress: profile.email,
            status: "SYSTEM_ALERT",
            subject: `🔥 TRIGGER: Target ${syncResult.newSegment}`,
            errorMessage: `Il lead ha accumulato ${syncResult.integratedScore} punti integrati. Massimo interesse rilevato. Contattare per chiusura.`,
            timestamp: new Date()
          }
        })
      ]);
    }

  } catch (error: any) {
    console.error(`❌ [Tracking CRITICAL] Errore logica DB:`, error.message);
  }

  return NextResponse.redirect(targetUrl, 302);
}
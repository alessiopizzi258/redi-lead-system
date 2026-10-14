import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RfmService } from "@/lib/services/rfmService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");
  const tid = searchParams.get("tid");

  if (uid && tid) {
    try {
      // 1. Aggiorna l'attività del lead senza sovrascrivere il segmento hardcoded
      await prisma.profile.update({
        where: { id: uid },
        data: { 
          contactCount: { increment: 1 },
          lastActivityAt: new Date() 
        }
      });
      
      // 2. Registra l'evento di tracking per la cronologia
      await prisma.trackingEvent.create({
        data: { type: "OPEN", url: "Email View", profileId: uid, tenantId: tid }
      });

      // 👉 TRIGGER RICALCOLO GLOBALE
      await RfmService.syncProfileScore(uid);

      console.log(`👁️ [Tracker] Email aperta dal lead: ${uid}`);
    } catch (error) {
      console.error("❌ [Tracker Error] Impossibile registrare apertura:", error);
    }
  }

  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  
  return new NextResponse(pixel, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RfmService } from "@/lib/services/rfmService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");
  const tid = searchParams.get("tid");
  const destinationUrl = searchParams.get("url");

  // Se manca l'URL di destinazione, rimandiamo alla home per non dare pagina bianca
  if (!destinationUrl) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (uid && tid) {
    try {
      // 1. Registra un boost termico enorme perché ha cliccato un link
      await prisma.profile.update({
        where: { id: uid },
        data: { 
          contactCount: { increment: 1 },
          lastActivityAt: new Date() 
        }
      });
      
      // 2. Registra l'evento
      await prisma.trackingEvent.create({
        data: { type: "CLICK", url: destinationUrl, profileId: uid, tenantId: tid }
      });

      // 3. Trigger RFM (potrebbe farlo passare direttamente a "Caldo" o "Urgente")
      await RfmService.syncProfileScore(uid);

      console.log(`🔗 [Tracker] Clic registrato per lead ${uid} verso ${destinationUrl}`);
    } catch (error) {
      console.error("❌ [Tracker Error] Impossibile registrare clic:", error);
    }
  }

  // 4. Redirect 302 immediato verso la destinazione reale (l'utente non nota nulla)
  return NextResponse.redirect(destinationUrl);
}
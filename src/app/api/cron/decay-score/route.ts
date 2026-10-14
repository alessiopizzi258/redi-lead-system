import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || "Al3s6i024@"}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });
  }

  console.log("⚙️ [Decay Engine] Avvio ciclo di decadimento punteggi passivi...");

  try {
    const DECAY_RATE = 10;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Seleziona profili inattivi da > 7 giorni e che NON hanno subito decadimento negli ultimi 7 giorni
    const targets = await prisma.profile.findMany({
      where: {
        lastActivityAt: { lt: sevenDaysAgo },
        passiveScore: { gt: 0 },
        OR: [
          { lastDecayedAt: null },
          { lastDecayedAt: { lt: sevenDaysAgo } }
        ]
      },
      select: { id: true, passiveScore: true }
    });

    if (targets.length === 0) {
      return NextResponse.json({ success: true, message: "Nessun decadimento necessario oggi." });
    }

    let decayedCount = 0;

    // Iniezione del tipo esplicito per bypassare il blocco di TypeScript
    const operations = targets.map((profile: { id: string; passiveScore: number }) => {
      const newScore = Math.max(0, profile.passiveScore - DECAY_RATE);
      
      return prisma.profile.update({
        where: { id: profile.id },
        data: {
          passiveScore: newScore,
          lastDecayedAt: new Date()
        }
      });
    });

    await prisma.$transaction(operations);
    decayedCount = operations.length;

    console.log(`✅ [Decay Engine] Penalizzati ${decayedCount} profili per inattività.`);

    return NextResponse.json({ success: true, decayedCount, message: "Decadimento completato." });

  } catch (error: any) {
    console.error("❌ Errore Decay Engine:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
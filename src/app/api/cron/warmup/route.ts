import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 🛡️ BLINDA LA BUILD: Impedisce a Next.js di eseguire il cron durante la compilazione
export const dynamic = 'force-dynamic';

export async function GET() {
  console.log("🔄 [CRON] Inizio Warmup Protocol V2 (10 -> 100)...");

  try {
    const senders = await prisma.gmailSender.findMany({ where: { isActive: true } });

    for (const sender of senders) {
      let newLimit = sender.dailyLimit;

      // Se ieri ha lavorato (ha inviato più del 50% del suo limite), premiamolo con +10
      if (sender.sentToday >= Math.floor(sender.dailyLimit / 2)) {
        newLimit = Math.min(sender.dailyLimit + 10, 100); // Mai oltre i 100
      }

      await prisma.gmailSender.update({
        where: { id: sender.id },
        data: {
          sentToday: 0, // Azzera il contatore giornaliero
          dailyLimit: newLimit,
          quarantineUntil: null // Se era in quarantena, liberalo
        }
      });
      console.log(`📈 [Warmup] ${sender.email}: Limite portato a ${newLimit}/giorno.`);
    }

    return NextResponse.json({ message: "Warmup completato con successo." }, { status: 200 });
  } catch (error) {
    console.error("Errore Cron Warmup:", error);
    return NextResponse.json({ error: "Fallimento CRON" }, { status: 500 });
  }
}
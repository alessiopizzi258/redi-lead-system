import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
// Importa il tuo servizio di invio email, es:
// import { DeliveryService } from "@/lib/services/deliveryService"; 

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Vercel Hobby taglia i processi dopo 10-15s

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET || "Al3s6i024@"}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });
  }

  try {
    // 1. Pesca 5 email in attesa di essere spedite (Batch piccolo per evitare timeout Vercel)
    const pendingLogs = await prisma.automationLog.findMany({
      where: { status: "APPROVED" },
      take: 5,
      orderBy: { id: 'asc' } // <- Sostituito con l'ID
    });

    if (pendingLogs.length === 0) {
      return NextResponse.json({ success: true, message: "Coda vuota. Nessuna email da spedire." });
    }

    let sentCount = 0;

    // 2. Ciclo di spedizione
    for (const log of pendingLogs) {
      // QUI INSERISCI LA LOGICA DI INVIO REALE (es. tramite Resend o GmailSender)
      // await DeliveryService.sendEmail({ to: log.emailAddress, subject: log.subject, html: log.errorMessage });

      // 3. Aggiorna lo stato nel DB
      await prisma.automationLog.update({
        where: { id: log.id },
        data: { status: "SENT" } // Pulito e allineato allo schema
      });
      sentCount++;
    }

    return NextResponse.json({ success: true, message: `Spedite ${sentCount} email con successo.` });

  } catch (error: any) {
    console.error("❌ Errore Process Queue:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
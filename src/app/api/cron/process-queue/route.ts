import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DeliveryService } from "@/lib/services/deliveryService";

export const dynamic = 'force-dynamic';
export const maxDuration = 10; 

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET || "Al3s6i024@"}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });
  }

  try {
    const pendingLogs = await prisma.automationLog.findMany({
      where: { status: "APPROVED" },
      take: 5,
      orderBy: { id: 'asc' } 
    });

    if (pendingLogs.length === 0) {
      return NextResponse.json({ success: true, message: "Coda vuota. Nessuna email da spedire." });
    }

    let sentCount = 0;

    for (const log of pendingLogs) {
        // Disinnesco anti-null: Garantisce che subject ed errorMessage siano sempre stringhe
        const safeSubject = log.subject || "Check rapido"; 
        const safeHtml = log.errorMessage || "<p>Email vuota per errore sistema.</p>";

        const success = await DeliveryService.sendColdEmailToProspect(
            log.tenantId, 
            log.emailAddress, 
            safeSubject, 
            safeHtml 
        );

        if (success) {
            await prisma.automationLog.update({
              where: { id: log.id },
              data: { status: "SENT" } 
            });
            sentCount++; // Incremento corretto
        }
    }

    return NextResponse.json({ success: true, message: `Spedite ${sentCount} email con successo.` });

  } catch (error: any) {
    console.error("❌ Errore Process Queue:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
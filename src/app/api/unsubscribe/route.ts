import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // 1. Estrazione chirurgica dell'ID dalla query string dell'URL
  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get('id');

  if (!profileId) {
    return new NextResponse('Identificativo mancante o corrotto.', { status: 400 });
  }

  try {
    // 2. Isolamento del Target: Spostamento nel segmento "Bounced_Inattivo"
    // Usiamo un update in isolamento per evitare di alterare altre metriche
    await prisma.profile.update({
      where: { id: profileId },
      data: { 
        segment: "Bounced_Inattivo",
        // Opzionale: azzeriamo le metriche future
        arch_angle: "UNSUBSCRIBED"
      }
    });

    // 3. (Opzionale ma letale) Logghiamo l'azione per le tue statistiche interne
    await prisma.automationLog.create({
      data: {
        tenantId: (await prisma.profile.findUnique({ where: { id: profileId } }))?.tenantId || "UNKNOWN",
        profileId: profileId,
        emailAddress: "HIDDEN_FOR_COMPLIANCE", // Nascondiamo per compliance
        subject: "USER_OPT_OUT",
        status: "BLOCKED" 
      }
    });

    // 4. Conferma visiva all'utente (Fredda e istituzionale)
    const htmlResponse = `
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f9f9f9;">
          <h2 style="color: #333;">Aggiornamento Registri</h2>
          <p style="color: #666;">Il tuo indirizzo email è stato rimosso con successo dai nostri sistemi.</p>
          <p style="color: #666;">Non riceverai ulteriori comunicazioni da Paolucci Advisory.</p>
        </body>
      </html>
    `;

    return new NextResponse(htmlResponse, { 
      status: 200, 
      headers: { 'Content-Type': 'text/html' } 
    });

  } catch (error: any) {
    console.error("❌ [UNSUBSCRIBE_ERROR] Fallimento aggiornamento database:", error);
    return new NextResponse('Errore durante l\'elaborazione della richiesta.', { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { logId } = await req.json();

    // 1. Recuperiamo la bozza dal database
    const draft = await prisma.automationLog.findUnique({
      where: { id: logId }
    });

    if (!draft || draft.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ success: false, message: "Bozza non trovata o già processata." }, { status: 400 });
    }

    // 2. Invio fulmineo con Resend
    const { data, error } = await resend.emails.send({
      from: `Design Lab Studio <alessio@designlabstudio.it>`, 
      to: [draft.emailAddress],
      subject: draft.subject || "Aggiornamento",
      html: draft.errorMessage || "", 
    });

    if (error) throw new Error(`Resend Error: ${error.message}`);

    // 3. Aggiorniamo il DB: Email inviata
    await prisma.$transaction([
      prisma.automationLog.update({
        where: { id: logId },
        data: { status: "SENT", errorMessage: null } // Puliamo l'errorMessage e mettiamo SENT
      }),
      prisma.profile.update({
        where: { id: draft.profileId },
        data: { lastContactedAt: new Date() }
      })
    ]);

    return NextResponse.json({ success: true, message: "Email approvata e spedita.", emailId: data?.id });

  } catch (error: any) {
    console.error("❌ Errore Approvazione:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
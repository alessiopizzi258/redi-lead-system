import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';

// Delay random tra 90 e 180 secondi (Anti-Spam)
const randomDelay = () => Math.floor(Math.random() * (180000 - 90000 + 1) + 90000);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function sendViaGmailRotator(to: string, subject: string, htmlContent: string) {
  // 1. Cerca il mittente migliore: attivo, sotto limite e non in quarantena
  const sender = await prisma.gmailSender.findFirst({
    where: {
      isActive: true,
      sentToday: { lt: prisma.gmailSender.fields.dailyLimit },
      OR: [
        { quarantineUntil: null },
        { quarantineUntil: { lt: new Date() } }
      ]
    },
    orderBy: { lastSentAt: 'asc' } // Prendi quello usato meno di recente
  });

  if (!sender) {
    throw new Error("Tutti gli account hanno superato il limite o sono in quarantena.");
  }

  console.log(`[Email Engine] Selezionato ${sender.email}. Limite attuale: ${sender.sentToday}/${sender.dailyLimit}`);

  // 2. Transporter Nodemailer (Motore Universale: Gmail + Custom SMTP)
  const transporter = nodemailer.createTransport(
    sender.provider === "GMAIL" 
      ? {
          service: 'gmail',
          auth: { user: sender.email, pass: sender.appPassword }
        }
      : {
          host: sender.smtpHost || "", // Fallback per sicurezza TypeScript
          port: sender.smtpPort || 465,
          secure: sender.smtpPort === 465, // true per 465, false per le altre porte
          auth: { user: sender.email, pass: sender.appPassword }
        }
  );

  try {
    // 3. Jitter: Aspetta come un umano prima di inviare
    const delay = randomDelay();
    console.log(`⏳ [Delay] Attesa di ${delay / 1000}s per simulare comportamento umano...`);
    await sleep(delay);

    // 4. Fuoco!
    await transporter.sendMail({
      from: `"Scintilla Hub" <${sender.email}>`,
      to,
      subject,
      html: htmlContent
    });

    // 5. Aggiorna DB
    await prisma.gmailSender.update({
      where: { id: sender.id },
      data: {
        sentToday: { increment: 1 },
        lastSentAt: new Date()
      }
    });

    console.log(`✅ [Successo] Email inviata da ${sender.email}`);
    return true;

  } catch (error: any) {
    const errStr = error.message || "Errore SMTP";
    console.error(`❌ [Errore SMTP] ${sender.email}:`, errStr);

    // Logica di Auto-Quarantena
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await prisma.gmailSender.update({
      where: { id: sender.id },
      data: {
        isActive: errStr.includes('535') ? false : true, // 535 = Password errata
        quarantineUntil: errStr.includes('421') || errStr.includes('limit') ? tomorrow : null, // 421 = Rate limit
        errorLog: errStr
      }
    });

    throw new Error(`Invio fallito tramite ${sender.email}. Riprova in coda.`);
  }
}
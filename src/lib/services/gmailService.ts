import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';

// Memorizza in RAM l'ultimo giorno in cui è stato fatto il reset
let lastResetDateString = "";

/**
 * Azzera automaticamente i contatori giornalieri quando scatta un nuovo giorno (fuso orario Roma)
 */
export async function resetDailyQuotasIfNeeded() {
  const todayRome = new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });

  if (lastResetDateString === todayRome) {
    return; // Già resettato oggi
  }

  try {
    // Azzera sentToday su tutte le caselle all'inizio di un nuovo giorno
    await prisma.gmailSender.updateMany({
      data: {
        sentToday: 0,
        isActive: true
      }
    });
    lastResetDateString = todayRome;
    console.log(`🌅 [Quota Reset] Contatori giornalieri SMTP azzerati per la data ${todayRome}.`);
  } catch (err: any) {
    console.warn(`⚠️ [Quota Reset Warning]:`, err.message);
  }
}

/**
 * Invia l'email ruotando le caselle disponibili e forzando il nome del Brand ("Scintilla Hub")
 */
export async function sendViaGmailRotator(
  to: string,
  subject: string,
  html: string,
  senderName: string = "Scintilla Hub"
) {
  const DAILY_MAX_LIMIT = 100;

  // 1. Cerca una casella attiva che non abbia superato il limite giornaliero
  const sender = await prisma.gmailSender.findFirst({
    where: {
      isActive: true,
      sentToday: { lt: DAILY_MAX_LIMIT }
    },
    orderBy: { sentToday: 'asc' }
  });

  if (!sender) {
    throw new Error("Tutti gli account hanno superato il limite o sono in quarantena.");
  }

  console.log(`[Email Engine] Selezionato ${sender.email}. Limite attuale: ${sender.sentToday}/${DAILY_MAX_LIMIT}`);

  // 2. Delay Umano Anti-Spam (tra 45 e 110 secondi)
  const delayMs = Math.floor(Math.random() * (110000 - 45000 + 1)) + 45000;
  console.log(`⏳ [Delay] Attesa di ${(delayMs / 1000).toFixed(3)}s per simulare comportamento umano...`);
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  // 3. Configura il trasporto SMTP
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: sender.email,
      pass: sender.appPassword || ""
    }
  });

  // 4. Invio con forzatura esplicita del Display Name e Reply-To (Sovrascrive "Massimiliano Paolucci" nelle intestazioni)
  await transporter.sendMail({
    from: `"${senderName}" <${sender.email}>`,
    replyTo: `"${senderName}" <${sender.email}>`,
    to,
    subject,
    html
  });

  // 5. Incrementa il contatore degli invii di oggi
  await prisma.gmailSender.update({
    where: { id: sender.id },
    data: { sentToday: { increment: 1 } }
  });
}
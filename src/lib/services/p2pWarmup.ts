import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';

export class P2PWarmupService {
  
  // Genera messaggi finti per ingannare i filtri
  private static getMockContent() {
    const messages = [
      { subject: "Aggiornamento meeting", body: "Ciao, confermiamo la call di domani alle 15? Ho letto il report, sembra tutto ok." },
      { subject: "Fattura Q3", body: "Potresti controllare l'allegato della fattura? Mi sembra ci sia un errore sull'imponibile." },
      { subject: "Revisione progetto", body: "Ti mando le modifiche richieste. Fammi sapere se procediamo o se serve un'altra revisione." },
      { subject: "Accesso piattaforma", body: "Non riesco a loggarmi sul CRM, mi rimandi le credenziali per favore?" }
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  public static async runPingPongCycle() {
    console.log("🔄 [Nexus P2P] Avvio ciclo di riscaldamento interattivo...");

    // 1. Peschiamo due account casuali e attivi dalla tua Farm
    const accounts = await prisma.gmailSender.findMany({ 
      where: { isActive: true },
      take: 2 // Ne bastano 2 per fare ping-pong
    });

    if (accounts.length < 2) {
      console.log("⚠️ [Nexus P2P] Servono almeno 2 account configurati per fare ping-pong.");
      return;
    }

    const sender = accounts[0];
    const receiver = accounts[1];
    const content = this.getMockContent();
    const tag = `[NX-${Math.floor(Math.random() * 1000)}]`; // Tag univoco per rintracciare la mail
    const subject = `${tag} ${content.subject}`;

    try {
      // ==========================================
      // FASE 1: L'INVIO (Sender -> Receiver)
      // ==========================================
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: sender.email, pass: sender.appPassword }
      });

      await transporter.sendMail({
        from: sender.email,
        to: receiver.email,
        subject: subject,
        text: content.body
      });
      console.log(`📤 [P2P] ${sender.email} ha scritto a ${receiver.email}`);

      // Pausa di 10 secondi per dare tempo a Google di consegnare la mail
      await new Promise(resolve => setTimeout(resolve, 10000));

      // ==========================================
      // FASE 2: LA LETTURA E IL RECUPERO DALLO SPAM
      // ==========================================
      const client = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user: receiver.email, pass: receiver.appPassword },
        logger: false 
      });

      await client.connect();
      
      // Prima cerchiamo nello SPAM
      try {
        let spamLock = await client.getMailboxLock('[Gmail]/Spam');
        const spamMessages = await client.search({ subject: tag });
        
        // 🛡️ CORREZIONE TYPESCRIPT QUI:
        if (Array.isArray(spamMessages) && spamMessages.length > 0) {
          console.log(`🛡️ [P2P] Email trovata nello SPAM. Spostamento in Inbox in corso...`);
          await client.messageMove(spamMessages, 'INBOX');
        }
        spamLock.release();
      } catch (e) { /* Ignora cartelle non trovate */ }

      // Ora andiamo in INBOX a leggerla
      let inboxLock = await client.getMailboxLock('INBOX');
      const inboxMessages = await client.search({ subject: tag });
      
      // 🛡️ CORREZIONE TYPESCRIPT QUI:
      if (Array.isArray(inboxMessages) && inboxMessages.length > 0) {
        await client.messageFlagsAdd(inboxMessages, ['\\Seen']);
        console.log(`👀 [P2P] ${receiver.email} ha APERTO e LETTO l'email.`);
      }
      inboxLock.release();
      await client.logout();

      // ==========================================
      // FASE 3: LA RISPOSTA (Receiver -> Sender)
      // ==========================================
      const replyTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: receiver.email, pass: receiver.appPassword }
      });

      await replyTransporter.sendMail({
        from: receiver.email,
        to: sender.email,
        subject: `Re: ${subject}`,
        text: "Ricevuto, ci guardo subito e ti aggiorno. Grazie!"
      });
      console.log(`✅ [P2P] ${receiver.email} ha RISPOSTO a ${sender.email}`);

    } catch (error) {
      console.error("❌ [P2P Error] Fallimento nel ciclo Ping-Pong:", error);
    }
  }
}
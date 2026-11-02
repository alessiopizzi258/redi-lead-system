import 'dotenv/config';
import dns from 'dns/promises';
import tls from 'tls';
import { Worker, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import { buildScintillaTemplate } from '@/lib/utils/emailWrapper';
import { prisma } from '@/lib/prisma';
import { sendViaGmailRotator, resetDailyQuotasIfNeeded } from '@/lib/services/gmailService';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  connectTimeout: 8000,
  family: 4, // Forza IPv4
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  },
  tls: process.env.REDIS_URL?.startsWith('rediss://')
    ? { rejectUnauthorized: false }
    : undefined
});

// Coda interna per l'auto-innesco (Cron autonomo)
const nurturingQueue = new Queue('nurturing-queue', { connection });

// Domini temporanei o finti da bloccare prima dell'invio
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'yopmail.com', 'trashmail.com', 'getnada.com', 'temp-mail.org'
]);

/**
 * SCUDO 1: Verifica rapida sintassi e record DNS MX prima di sprecare un invio SMTP
 */
async function preFlightEmailCheck(email: string): Promise<{ valid: boolean; reason?: string }> {
  const clean = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(clean)) {
    return { valid: false, reason: 'Sintassi email malformata' };
  }

  const domain = clean.split('@')[1];
  if (!domain || DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'Dominio email temporaneo o non valido' };
  }

  try {
    const mx = await dns.resolveMx(domain);
    if (!mx || mx.length === 0) {
      return { valid: false, reason: `Il dominio @${domain} non ha server di posta (MX)` };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: `Dominio @${domain} inesistente o scaduto (DNS NXDOMAIN)` };
  }
}

/**
 * Isola definitivamente un contatto che ha generato Hard Bounce o Message Blocked
 */
async function quarantineDeadLead(
  profileId: string,
  tenantId: string,
  email: string,
  subject: string,
  reason: string
) {
  await prisma.$transaction([
    prisma.profile.update({
      where: { id: profileId },
      data: {
        status: 'REJECTED',
        segment: 'Rimbalzato (Bounce)'
      }
    }),
    prisma.leadSequenceState.updateMany({
      where: { profileId },
      data: {
        isCompleted: true,
        isUnsubscribed: true
      }
    }),
    prisma.automationLog.create({
      data: {
        tenantId,
        profileId,
        emailAddress: email,
        subject,
        status: 'BOUNCED',
        bounceHard: true,
        errorMessage: reason
      }
    })
  ]);
  console.warn(`🛡️ [Bounce Shield] Contatto ${email} rimosso dalla sequenza e marcato REJECTED. Motivo: ${reason}`);
}

/**
 * SCUDO 2: Scanner IMAP leggero (Zero dipendenze esterne).
 * Controlla nella casella Gmail le notifiche di "Mail Delivery Subsystem" (Address not found / Message blocked)
 * e disattiva automaticamente i contatti rimbalzati prima che il worker invii gli step successivi.
 */
async function scanGmailBouncesViaImap() {
  const senders = await prisma.gmailSender.findMany({
    where: { isActive: true }
  });

  for (const sender of senders) {
    if (!sender.appPassword) continue;

    await new Promise<void>((resolve) => {
      const socket = tls.connect(993, sender.imapHost || 'imap.gmail.com', { rejectUnauthorized: false });
      let buffer = '';
      let step = 0;

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve();
      }, 12000);

      socket.on('data', async (chunk) => {
        buffer += chunk.toString('utf8');

        if (step === 0 && buffer.includes('* OK')) {
          step = 1;
          buffer = '';
          const cleanPass = sender.appPassword.replace(/\s+/g, '');
          socket.write(`A1 LOGIN "${sender.email}" "${cleanPass}"\r\n`);
        } else if (step === 1 && (buffer.includes('A1 OK') || buffer.includes('A1 NO'))) {
          if (buffer.includes('A1 NO')) {
            clearTimeout(timeout);
            socket.destroy();
            return resolve();
          }
          step = 2;
          buffer = '';
          socket.write(`A2 SELECT INBOX\r\n`);
        } else if (step === 2 && buffer.includes('A2 OK')) {
          step = 3;
          buffer = '';
          // Cerca le email di errore provenienti da Mail Delivery Subsystem
          socket.write(`A3 SEARCH FROM "mailer-daemon"\r\n`);
        } else if (step === 3 && buffer.includes('A3 OK')) {
          const match = buffer.match(/\* SEARCH ([0-9 ]+)/);
          if (!match || !match[1].trim()) {
            clearTimeout(timeout);
            socket.write(`A5 LOGOUT\r\n`);
            socket.destroy();
            return resolve();
          }
          const ids = match[1].trim().split(/\s+/).slice(-25); // Controlla gli ultimi 25 bounce
          step = 4;
          buffer = '';
          socket.write(`A4 FETCH ${ids.join(',')} (BODY.PEEK[TEXT])\r\n`);
        } else if (step === 4 && buffer.includes('A4 OK')) {
          const rawText = buffer;
          clearTimeout(timeout);
          socket.write(`A5 LOGOUT\r\n`);
          socket.destroy();

          // Estrae tutte le email citate nei messaggi di "Address not found" / "Message blocked"
          const foundEmails = new Set<string>();
          const regex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
          let m;
          while ((m = regex.exec(rawText)) !== null) {
            const candidate = m[1].toLowerCase();
            if (
              candidate !== sender.email.toLowerCase() &&
              !candidate.includes('google') &&
              !candidate.includes('mailer-daemon') &&
              !candidate.includes('scintillahub')
            ) {
              foundEmails.add(candidate);
            }
          }

          if (foundEmails.size > 0) {
            const bouncedProfiles = await prisma.profile.findMany({
              where: {
                email: { in: Array.from(foundEmails) },
                status: { notIn: ['REJECTED', 'ANOMALO'] }
              }
            });

            for (const prof of bouncedProfiles) {
              await quarantineDeadLead(
                prof.id,
                prof.tenantId,
                prof.email,
                'Mail Delivery Subsystem (Bounce Rilevato)',
                'Email rimbalzata (Address not found o Message blocked rilevato nella inbox mittente)'
              );
            }
          }
          resolve();
        }
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

/**
 * Funzione che aggancia automaticamente eventuali nuovi lead alle sequenze attive
 * escludendo i contatti già bruciati (REJECTED / ANOMALO).
 */
async function autoEnrollNewLeads() {
  const activeSequences = await prisma.sequence.findMany({
    where: { isActive: true },
    select: { id: true, tenantId: true, name: true }
  });

  for (const seq of activeSequences) {
    const unenrolledLeads = await prisma.profile.findMany({
      where: {
        tenantId: seq.tenantId,
        status: { notIn: ['REJECTED', 'ANOMALO', 'QUALIFIED'] },
        sequenceStates: { none: { sequenceId: seq.id } }
      },
      select: { id: true }
    });

    if (unenrolledLeads.length > 0) {
      await prisma.leadSequenceState.createMany({
        data: unenrolledLeads.map(lead => ({
          profileId: lead.id,
          sequenceId: seq.id,
          currentStep: 0,
          isCompleted: false,
          isUnsubscribed: false
        })),
        skipDuplicates: true
      });
      console.log(`🤖 [Auto-Enroll] Agganciati automaticamente ${unenrolledLeads.length} nuovi lead alla sequenza "${seq.name}".`);
    }
  }
}

const nurturingWorker = new Worker(
  'nurturing-queue',
  async (job: Job) => {
    console.log(`🔄 [Nurturing Engine] Avvio ciclo automatico (Job: ${job.name})...`);

    // 1. AUTO-RESET QUOTE GIORNALIERE
    await resetDailyQuotasIfNeeded();

    // 2. SCANSIONE AUTOMATICA BOUNCE RICEVUTI SU GMAIL (Ferma subito gli "Address not found" e "Message blocked")
    await scanGmailBouncesViaImap();

    // 3. AUTO-ISCRIZIONE NUOVI LEAD
    await autoEnrollNewLeads();

    // 4. Pesca le iscrizioni attive, non completate e non disiscritte
    const activeEnrollments = await prisma.leadSequenceState.findMany({
      where: {
        isCompleted: false,
        isUnsubscribed: false,
      },
      include: {
        profile: true,
        sequence: {
          include: {
            tenant: true,
            emails: { orderBy: { stepNumber: 'asc' } }
          }
        }
      }
    });

    let sentCount = 0;

    for (const enrollment of activeEnrollments) {
      // Se il profilo è QUALIFIED, REJECTED o ANOMALO, chiude subito la sequenza e non invia più nulla
      if (['QUALIFIED', 'REJECTED', 'ANOMALO'].includes(enrollment.profile.status)) {
        await prisma.leadSequenceState.update({
          where: { id: enrollment.id },
          data: { isCompleted: true }
        });
        continue;
      }

      // Identifica il prossimo Step
      const nextStepIndex = enrollment.sequence.emails.findIndex(
        e => e.stepNumber > enrollment.currentStep
      );

      if (nextStepIndex === -1) {
        await prisma.leadSequenceState.update({
          where: { id: enrollment.id },
          data: { isCompleted: true }
        });
        continue;
      }

      const nextEmail = enrollment.sequence.emails[nextStepIndex];

      // Calcolo Finestra Temporale (Delay in giorni tra uno step e l'altro)
      const now = new Date();
      if (enrollment.lastEmailedAt) {
        const targetDate = new Date(enrollment.lastEmailedAt);
        targetDate.setDate(targetDate.getDate() + nextEmail.delayDays);

        if (now < targetDate) continue;
      }

      const targetEmail = enrollment.profile.email.trim().toLowerCase();
      const tenantId = enrollment.profile.tenantId;

      // 5. CONTROLLO PREVENTIVO DNS MX (Evita di spedire a domini morti o inesistenti)
      const dnsCheck = await preFlightEmailCheck(targetEmail);
      if (!dnsCheck.valid) {
        await quarantineDeadLead(
          enrollment.profile.id,
          tenantId,
          targetEmail,
          nextEmail.subject,
          dnsCheck.reason || 'Dominio non valido'
        );
        continue;
      }

      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tuodominio.it";
        const tenantName = enrollment.sequence.tenant?.companyName || "Scintilla Hub";

        const senderDisplayName = tenantName.includes("Scintilla")
          ? "Scintilla Hub"
          : tenantName;

        let bodyHtml = "";

        if (tenantName.includes("Scintilla")) {
          bodyHtml = buildScintillaTemplate(nextEmail.plainText);
        } else {
          bodyHtml = `
            <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111;">
              ${nextEmail.plainText.replace(/\n/g, '<br/>')}
            </div>`;
        }

        // Pixel di apertura
        const trackingPixel = `<img src="${baseUrl}/api/tracking/open?uid=${enrollment.profile.id}&tid=${tenantId}" width="1" height="1" style="display:none;" />`;
        if (bodyHtml.includes("</body>")) {
          bodyHtml = bodyHtml.replace("</body>", `${trackingPixel}</body>`);
        } else {
          bodyHtml += trackingPixel;
        }

        // Tracciamento click
        bodyHtml = bodyHtml.replace(
          /href=["'](https?:\/\/[^"']+)["']/gi,
          `href="${baseUrl}/api/track/click?uid=${enrollment.profile.id}&tid=${tenantId}&url=$1"`
        );

        // 6. Sparo tramite rotatore
        await sendViaGmailRotator(
          targetEmail,
          nextEmail.subject,
          bodyHtml,
          senderDisplayName
        );

        // 7. Aggiorna lo stato della sequenza e registra il log di successo
        await prisma.$transaction([
          prisma.leadSequenceState.update({
            where: { id: enrollment.id },
            data: {
              currentStep: nextEmail.stepNumber,
              lastEmailedAt: now
            }
          }),
          prisma.automationLog.create({
            data: {
              tenantId,
              profileId: enrollment.profile.id,
              emailAddress: targetEmail,
              subject: nextEmail.subject,
              status: 'SENT'
            }
          })
        ]);

        sentCount++;
        console.log(`✅ [Nurturing] Inviato Step ${nextEmail.stepNumber} a ${targetEmail} (Mittente: ${senderDisplayName})`);

      } catch (error: any) {
        const msg = error.message || "";

        // 🛑 STOP INTELLIGENTE: Se gli account hanno esaurito i 100 invii giornalieri, metti in pausa
        if (msg.includes("superato il limite") || msg.includes("quarantena") || msg.includes("Nessuna casella")) {
          console.warn(`⏸️ [Auto-Throttling] Limite giornaliero raggiunto (${sentCount} inviate in questa sessione). Il motore va in pausa e riprenderà da solo al prossimo ciclo.`);
          break;
        }

        // 🛡️ QUARANTENA IMMEDIATA SE L'ERRORE SMTP È UN HARD BOUNCE (550, 553, 554, Address not found, Blocked)
        const isPermanentBounce =
          /550|551|552|553|554|no such user|user unknown|address not found|does not exist|invalid recipient|message blocked|rejected/i.test(msg);

        if (isPermanentBounce) {
          await quarantineDeadLead(
            enrollment.profile.id,
            tenantId,
            targetEmail,
            nextEmail.subject,
            `SMTP Hard Bounce: ${msg}`
          );
          continue;
        }

        console.error(`❌ [Nurturing Error] Impossibile inviare a ${targetEmail}:`, msg);
      }
    }

    console.log(`🏁 [Nurturing Engine] Ciclo completato. Email inviate in questo turno: ${sentCount}`);
    return { success: true, sent: sentCount };
  },
  { connection, concurrency: 1 }
);

nurturingWorker.on('ready', async () => {
  console.log('⚙️ [Nurturing Worker] ONLINE. Configurazione pilota automatico + Bounce Shield...');

  try {
    await nurturingQueue.add(
      'autonomous-heartbeat',
      { mode: 'auto' },
      {
        repeat: { every: 30 * 60 * 1000 },
        jobId: 'rls-autonomous-cron',
        removeOnComplete: true,
        removeOnFail: 10
      }
    );

    await nurturingQueue.add(
      'startup-run',
      { mode: 'startup' },
      {
        jobId: `startup-${Date.now()}`,
        removeOnComplete: true
      }
    );

    console.log('🚀 [Pilota Automatico] ATTIVO. Il worker controllerà bounce, quote e invierà le email da solo ogni 30 minuti.');
  } catch (err: any) {
    console.error('⚠️ Errore avvio pilota automatico:', err.message);
  }
});
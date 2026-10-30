import 'dotenv/config';
import { Worker, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import { buildScintillaTemplate } from '@/lib/utils/emailWrapper';
import { prisma } from '@/lib/prisma';
import { sendViaGmailRotator, resetDailyQuotasIfNeeded } from '@/lib/services/gmailService';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  connectTimeout: 8000,
  family: 4, // Forza IPv4 per evitare ENOTFOUND
  retryStrategy(times) {
    return Math.min(times * 500, 5000); // Su Render deve riconnettersi sempre
  },
  tls: process.env.REDIS_URL?.startsWith('rediss://') || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : undefined
});

// Coda interna per l'auto-innesco (Cron autonomo senza dipendere da Vercel)
const nurturingQueue = new Queue('nurturing-queue', { connection });

/**
 * Funzione che aggancia automaticamente eventuali nuovi lead alle sequenze attive
 * senza dover premere il bottone dalla Dashboard.
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

    // 1. AUTO-RESET QUOTE GIORNALIERE (Se è passata la mezzanotte, azzera i contatori)
    await resetDailyQuotasIfNeeded();

    // 2. AUTO-ISCRIZIONE NUOVI LEAD
    await autoEnrollNewLeads();

    // 3. Pesca le iscrizioni attive, non completate e non disiscritte
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
      // Un lead in QUALIFIED esce automaticamente dal Nurturing
      if (enrollment.profile.status === 'QUALIFIED') {
        await prisma.leadSequenceState.update({
          where: { id: enrollment.id },
          data: { isCompleted: true }
        });
        continue;
      }

      // Identifica il prossimo Step (Step 0 -> Step 1 -> Step 2...)
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

        // Se non è ancora maturato il tempo per questo contatto, passa al prossimo
        if (now < targetDate) continue;
      }

      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tuodominio.it";
        const tenantId = enrollment.profile.tenantId;
        const tenantName = enrollment.sequence.tenant?.companyName || "Scintilla Hub";

        // Determina il nome mittente pulito (Mai più "Massimiliano Paolucci")
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

        // 4. Sparo tramite rotatore passando esplicitamente il Brand ("Scintilla Hub")
        await sendViaGmailRotator(
          enrollment.profile.email,
          nextEmail.subject,
          bodyHtml,
          senderDisplayName
        );

        // 5. Aggiorna lo stato della sequenza per questo contatto
        await prisma.leadSequenceState.update({
          where: { id: enrollment.id },
          data: {
            currentStep: nextEmail.stepNumber,
            lastEmailedAt: now
          }
        });

        sentCount++;
        console.log(`✅ [Nurturing] Inviato Step ${nextEmail.stepNumber} a ${enrollment.profile.email} (Mittente: ${senderDisplayName})`);

      } catch (error: any) {
        const msg = error.message || "";

        // 🛑 STOP INTELLIGENTE: Se gli account hanno esaurito i 100 invii giornalieri,
        // NON ciclare sugli altri 50 contatti lanciando errori, ma metti in pausa fino al prossimo ciclo!
        if (msg.includes("superato il limite") || msg.includes("quarantena") || msg.includes("Nessuna casella")) {
          console.warn(`⏸️ [Auto-Throttling] Limite giornaliero raggiunto (${sentCount} inviate in questa sessione). Il motore va in pausa e riprenderà da solo al prossimo ciclo.`);
          break;
        }

        console.error(`❌ [Nurturing Error] Impossibile inviare a ${enrollment.profile.email}:`, msg);
      }
    }

    console.log(`🏁 [Nurturing Engine] Ciclo completato. Email inviate in questo turno: ${sentCount}`);
    return { success: true, sent: sentCount };
  },
  { connection, concurrency: 1 } // Concurrency 1 fondamentale per rispettare i delay anti-spam
);

nurturingWorker.on('ready', async () => {
  console.log('⚙️ [Nurturing Worker] ONLINE. Configurazione pilota automatico...');

  try {
    // 1. Crea un battito cardiaco automatico ogni 30 minuti
    await nurturingQueue.add(
      'autonomous-heartbeat',
      { mode: 'auto' },
      {
        repeat: { every: 30 * 60 * 1000 }, // Ogni 30 minuti controlla quote, nuovi lead e follow-up
        jobId: 'rls-autonomous-cron',
        removeOnComplete: true,
        removeOnFail: 10
      }
    );

    // 2. Fai partire un ciclo immediato appena il server Render va online (senza cliccare dalla Dashboard)
    await nurturingQueue.add(
      'startup-run',
      { mode: 'startup' },
      {
        jobId: `startup-${Date.now()}`,
        removeOnComplete: true
      }
    );

    console.log('🚀 [Pilota Automatico] ATTIVO. Il worker controllerà e invierà le email da solo ogni 30 minuti.');
  } catch (err: any) {
    console.error('⚠️ Errore avvio pilota automatico:', err.message);
  }
});
import 'dotenv/config';
import { Worker, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import dns from 'dns';
import { ImapFlow } from 'imapflow';
import { prisma } from '@/lib/prisma';
import { sendViaGmailRotator, resetDailyQuotasIfNeeded } from '@/lib/services/gmailService';
import { generateNativeStepEmail, evaluateLeadReplyNative } from '@/lib/services/aiAutonomousEngine';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  family: 4,
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
});

const nurturingQueue = new Queue('nurturing-queue', { connection });

async function hasValidMxRecord(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  if (!domain || domain === 'gmail.it') return false;
  try {
    const records = await dns.promises.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

async function scanImapRepliesAndBounces() {
  const activeSenders = await prisma.gmailSender.findMany({
    where: { isActive: true }
  });

  for (const sender of activeSenders) {
    const client = new ImapFlow({
      host: sender.imapHost || 'imap.gmail.com',
      port: sender.imapPort || 993,
      secure: true,
      auth: {
        user: sender.email,
        pass: sender.appPassword.replace(/\s+/g, '')
      },
      logger: false
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const unseenUids = await client.search({ seen: false });
        if (unseenUids && unseenUids.length > 0) {
          for (const uid of unseenUids.slice(-30)) {
            const msg = await client.fetchOne(uid, { envelope: true, source: true });
            if (!msg || !msg.envelope) continue;

            const fromAddress = msg.envelope.from?.[0]?.address?.toLowerCase() || '';
            const subject = (msg.envelope.subject || '').toLowerCase();
            const rawSource = msg.source ? msg.source.toString('utf8') : '';

            // 1. Intercettazione Hard Bounce (Mailer-Daemon)
            if (
              fromAddress.includes('mailer-daemon') ||
              fromAddress.includes('postmaster') ||
              subject.includes('delivery status notification') ||
              subject.includes('undeliverable') ||
              subject.includes('failure notice')
            ) {
              const emailMatch = rawSource.match(/Final-Recipient:\s*rfc822;\s*([^\s\r\n]+)/i) ||
                                 rawSource.match(/<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/);
              const bouncedEmail = emailMatch?.[1]?.trim().toLowerCase();

              if (bouncedEmail) {
                await prisma.profile.updateMany({
                  where: { email: bouncedEmail },
                  data: { status: 'ANOMALO', segment: 'Hard Bounce' }
                });
                await prisma.leadSequenceState.updateMany({
                  where: { profile: { email: bouncedEmail } },
                  data: { isCompleted: true, isUnsubscribed: true }
                });
              }
              await client.messageFlagsAdd(uid, ['\\Seen']);
              continue;
            }

            // 2. Valutazione nativa della risposta di un Lead
            if (fromAddress) {
              const profile = await prisma.profile.findFirst({
                where: { email: fromAddress },
                include: { tenant: { include: { aiAgentConfig: true } } }
              });

              if (profile) {
                const evaluation = evaluateLeadReplyNative(rawSource, {
                  companyName: profile.tenant?.companyName,
                  agentName: profile.tenant?.aiAgentConfig?.agentName,
                  qualificationCriteria: profile.tenant?.aiAgentConfig?.qualificationCriteria,
                  disqualifyingRules: profile.tenant?.aiAgentConfig?.disqualifyingRules
                });

                await prisma.profile.update({
                  where: { id: profile.id },
                  data: {
                    status: evaluation.status,
                    segment: evaluation.segment,
                    icpScore: Math.max(0, Math.min(100, (profile.icpScore || 35) + evaluation.icpScoreDelta)),
                    lastContactedAt: new Date()
                  }
                });

                if (evaluation.status === 'REJECTED' || evaluation.status === 'QUALIFIED') {
                  await prisma.leadSequenceState.updateMany({
                    where: { profileId: profile.id },
                    data: { isCompleted: true }
                  });
                }

                if (evaluation.status === 'QUALIFIED' && evaluation.autoReplyHtml) {
                  try {
                    await sendViaGmailRotator(
                      profile.email,
                      `Re: ${msg.envelope.subject || 'Richiesta'}`,
                      evaluation.autoReplyHtml,
                      profile.tenant?.aiAgentConfig?.agentName || profile.tenant?.companyName || 'Team Commerciale',
                      profile.tenantId
                    );
                  } catch {}
                }
              }
              await client.messageFlagsAdd(uid, ['\\Seen']);
            }
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (err: any) {
      console.error(`[IMAP] Errore scansione su ${sender.email}:`, err.message);
    }
  }
}

async function processAutonomousNurturingCycle() {
  await resetDailyQuotasIfNeeded();
  await scanImapRepliesAndBounces();

  const dueStates = await prisma.leadSequenceState.findMany({
    where: {
      isCompleted: false,
      isUnsubscribed: false,
      nextActionAt: { lte: new Date() }
    },
    include: {
      profile: {
        include: {
          tenant: {
            include: { aiAgentConfig: true }
          }
        }
      },
      sequence: true
    },
    take: 25
  });

  for (const state of dueStates) {
    const profile = state.profile;
    const tenant = profile.tenant;
    const config = tenant?.aiAgentConfig;

    if (!profile?.email || ['REJECTED', 'ANOMALO', 'QUALIFIED'].includes(profile.status)) {
      await prisma.leadSequenceState.update({
        where: { id: state.id },
        data: { isCompleted: true }
      });
      continue;
    }

    const mxValid = await hasValidMxRecord(profile.email);
    if (!mxValid) {
      await prisma.$transaction([
        prisma.profile.update({
          where: { id: profile.id },
          data: { status: 'REJECTED', segment: 'Dominio Inesistente (MX)' }
        }),
        prisma.leadSequenceState.update({
          where: { id: state.id },
          data: { isCompleted: true, isUnsubscribed: true }
        })
      ]);
      continue;
    }

    const emailPayload = generateNativeStepEmail(state.currentStep, profile, {
      companyName: tenant?.companyName,
      agentName: config?.agentName,
      industryContext: config?.industryContext,
      offerCatalog: config?.offerCatalog,
      qualificationCriteria: config?.qualificationCriteria
    });

    try {
      await sendViaGmailRotator(
        profile.email,
        emailPayload.subject,
        emailPayload.html,
        config?.agentName || tenant?.companyName || 'Reparto Commerciale',
        tenant.id
      );

      const nextStep = state.currentStep + 1;
      const maxSteps = state.sequence.maxSteps || tenant?.aiMaxAutonomousSteps || 4;
      const isCompleted = nextStep >= maxSteps;
      const delayDays = tenant?.aiDefaultDelayDays || 2;
      const nextActionAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000);

      await prisma.$transaction([
        prisma.profile.update({
          where: { id: profile.id },
          data: { lastContactedAt: new Date(), status: 'NURTURING' }
        }),
        prisma.leadSequenceState.update({
          where: { id: state.id },
          data: {
            currentStep: nextStep,
            isCompleted,
            nextActionAt
          }
        }),
        prisma.automationLog.create({
          data: {
            tenantId: tenant.id,
            profileId: profile.id,
            emailAddress: profile.email,
            subject: emailPayload.subject,
            actionType: `NATIVE_STEP_${state.currentStep + 1}`,
            status: 'SENT'
          }
        })
      ]);
    } catch (err: any) {
      console.error(`[Worker] Invio rimandato per ${profile.email}:`, err.message);
    }
  }
}

async function registerHeartbeatCron() {
  await nurturingQueue.add(
    'autonomous-heartbeat',
    {},
    {
      repeat: { every: 5 * 60 * 1000 }, // Ogni 5 minuti, zero carico CPU
      jobId: 'native-autonomous-heartbeat',
      removeOnComplete: true
    }
  );
}

const worker = new Worker(
  'nurturing-queue',
  async (job: Job) => {
    await processAutonomousNurturingCycle();
  },
  {
    connection,
    concurrency: 1
  }
);

worker.on('ready', async () => {
  console.log('🚀 Nurturing Worker Nativo (Zero IA Esterne) online.');
  await registerHeartbeatCron();
  await processAutonomousNurturingCycle();
});

worker.on('error', err => {
  console.error('❌ Errore Worker:', err.message);
});
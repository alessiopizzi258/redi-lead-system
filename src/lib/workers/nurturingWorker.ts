import 'dotenv/config';
import { Worker, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import dns from 'dns/promises';
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

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'yopmail.com', 'trashmail.com', 'getnada.com', 'temp-mail.org', 'gmail.it'
]);

async function hasValidMxRecord(email: string): Promise<boolean> {
  const clean = email.trim().toLowerCase();
  const domain = clean.split('@')[1];
  if (!domain || DISPOSABLE_DOMAINS.has(domain)) return false;
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

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
      data: { status: 'REJECTED', segment: 'Rimbalzato (Bounce)' }
    }),
    prisma.leadSequenceState.updateMany({
      where: { profileId },
      data: { isCompleted: true, isUnsubscribed: true }
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
}

async function scanImapRepliesAndBounces() {
  const activeSenders = await prisma.gmailSender.findMany({
    where: { isActive: true }
  });

  for (const sender of activeSenders) {
    if (!sender.appPassword) continue;

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

            if (
              fromAddress.includes('mailer-daemon') ||
              fromAddress.includes('postmaster') ||
              subject.includes('delivery status notification') ||
              subject.includes('undeliverable') ||
              subject.includes('failure notice')
            ) {
              const emailMatch =
                rawSource.match(/Final-Recipient:\s*rfc822;\s*([^\s\r\n]+)/i) ||
                rawSource.match(/<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/);
              const bouncedEmail = emailMatch?.[1]?.trim().toLowerCase();

              if (bouncedEmail) {
                const profile = await prisma.profile.findFirst({ where: { email: bouncedEmail } });
                if (profile) {
                  await quarantineDeadLead(profile.id, profile.tenantId, bouncedEmail, subject, 'Hard Bounce IMAP');
                }
              }
              await client.messageFlagsAdd(uid, ['\\Seen']);
              continue;
            }

            if (fromAddress) {
              const profile = (await prisma.profile.findFirst({
                where: {
                  email: fromAddress,
                  ...(sender.tenantId ? { tenantId: sender.tenantId } : {})
                },
                include: { tenant: { include: { aiAgentConfig: true } } }
              })) as any;

              if (profile && profile.email) {
                const evaluation = evaluateLeadReplyNative(rawSource, {
                  companyName: profile.tenant?.companyName,
                  agentName: profile.tenant?.aiAgentConfig?.agentName,
                  qualificationCriteria: profile.tenant?.aiAgentConfig?.qualificationCriteria,
                  disqualifyingRules: profile.tenant?.aiAgentConfig?.disqualifyingRules
                });

                await prisma.$transaction([
                  prisma.profile.update({
                    where: { id: profile.id },
                    data: {
                      status: evaluation.status,
                      segment: evaluation.segment,
                      icpScore: Math.max(0, Math.min(100, (profile.icpScore || 35) + evaluation.icpScoreDelta)),
                      lastContactedAt: new Date(),
                      aiSummary: evaluation.reason
                    }
                  }),
                  prisma.aIConversationMessage.create({
                    data: {
                      tenantId: profile.tenantId,
                      profileId: profile.id,
                      role: 'USER',
                      subject: msg.envelope.subject || 'Risposta Email',
                      content: rawSource.slice(0, 2000),
                      sentiment: evaluation.status
                    }
                  })
                ]);

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
      console.error(`[IMAP] Errore su ${sender.email}:`, err.message);
    }
  }
}

async function autoEnrollNewLeads() {
  const activeSequences = await prisma.sequence.findMany({
    where: { isActive: true },
    select: { id: true, tenantId: true }
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
          isUnsubscribed: false,
          nextActionAt: new Date()
        })),
        skipDuplicates: true
      });
    }
  }
}

async function processAutonomousCycle() {
  await resetDailyQuotasIfNeeded();
  await scanImapRepliesAndBounces();
  await autoEnrollNewLeads();

  const dueStates = await prisma.leadSequenceState.findMany({
    where: {
      isCompleted: false,
      isUnsubscribed: false,
      nextActionAt: { lte: new Date() }
    },
    include: {
      profile: {
        include: {
          tenant: { include: { aiAgentConfig: true } }
        }
      },
      sequence: true
    },
    take: 30
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
      await quarantineDeadLead(
        profile.id,
        tenant.id,
        profile.email,
        'Verifica MX Fallita',
        'Dominio email inesistente o privo di MX'
      );
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
            lastEmailedAt: new Date(),
            nextActionAt
          }
        }),
        prisma.automationLog.create({
          data: {
            tenantId: tenant.id,
            profileId: profile.id,
            emailAddress: profile.email,
            subject: `[Step ${state.currentStep + 1}] ${emailPayload.subject}`,
            status: 'SENT'
          }
        })
      ]);
    } catch (err: any) {
      console.error(`❌ [Worker] Invio rimandato per ${profile.email}:`, err.message);
    }
  }
}

const worker = new Worker(
  'nurturing-queue',
  async (job: Job) => {
    await processAutonomousCycle();
  },
  { connection, concurrency: 1 }
);

worker.on('ready', async () => {
  console.log('🚀 [Nurturing Worker Unificato] Online.');
  await nurturingQueue.add(
    'autonomous-heartbeat',
    {},
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: 'native-autonomous-heartbeat',
      removeOnComplete: true
    }
  );
  await processAutonomousCycle();
});

worker.on('error', err => {
  console.error('❌ Errore Worker:', err.message);
});
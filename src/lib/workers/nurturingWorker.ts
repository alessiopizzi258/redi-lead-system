import 'dotenv/config';
import dns from 'dns/promises';
import { ImapFlow } from 'imapflow';
import { Worker, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import { buildScintillaTemplate } from '@/lib/utils/emailWrapper';
import { prisma } from '@/lib/prisma';
import { sendViaGmailRotator, resetDailyQuotasIfNeeded } from '@/lib/services/gmailService';
import { generateAutonomousStepOrReply } from '@/lib/services/aiAutonomousEngine';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  connectTimeout: 8000,
  family: 4,
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  },
  tls: process.env.REDIS_URL?.startsWith('rediss://')
    ? { rejectUnauthorized: false }
    : undefined
});

const nurturingQueue = new Queue('nurturing-queue', { connection });

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'yopmail.com', 'trashmail.com', 'getnada.com', 'temp-mail.org', 'gmail.it'
]);

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
      return { valid: false, reason: `Il dominio @${domain} non ha record MX` };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: `Dominio @${domain} inesistente (NXDOMAIN)` };
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
      data: {
        status: 'REJECTED',
        segment: 'Squalificato',
        aiSummary: reason
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
}

async function processInboxBouncesAndReplies() {
  const senders = await prisma.gmailSender.findMany({
    where: { isActive: true }
  });

  for (const sender of senders) {
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
        const sinceDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const uids = await client.search({ since: sinceDate, seen: false });

        if (uids && uids.length > 0) {
          for await (const msg of client.fetch(uids.slice(-40), {
            envelope: true,
            source: true,
            uid: true
          })) {
            const fromAddress = msg.envelope?.from?.[0]?.address?.toLowerCase() || '';
            const subject = msg.envelope?.subject || '';
            const rawSource = msg.source?.toString('utf8') || '';
            const msgId = msg.envelope?.messageId || `imap-${sender.id}-${msg.uid}`;

            if (
              fromAddress.includes('mailer-daemon') ||
              fromAddress.includes('postmaster') ||
              /delivery status notification|undeliverable|address not found|message blocked|failure notice/i.test(subject)
            ) {
              const regex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
              const candidates = new Set<string>();
              let m;
              while ((m = regex.exec(rawSource)) !== null) {
                const emailFound = m[1].toLowerCase();
                if (
                  emailFound !== sender.email.toLowerCase() &&
                  !emailFound.includes('mailer-daemon') &&
                  !emailFound.includes('google')
                ) {
                  candidates.add(emailFound);
                }
              }

              if (candidates.size > 0) {
                const bouncedProfiles = await prisma.profile.findMany({
                  where: {
                    email: { in: Array.from(candidates) },
                    status: { notIn: ['REJECTED', 'ANOMALO'] }
                  }
                });

                for (const prof of bouncedProfiles) {
                  await quarantineDeadLead(
                    prof.id,
                    prof.tenantId,
                    prof.email,
                    'Bounce Rilevato via IMAP',
                    'Hard Bounce / Indirizzo inesistente o bloccato'
                  );
                }
              }

              await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
              continue;
            }

            const existingMsg = await prisma.aIConversationMessage.findUnique({
              where: { messageId: msgId }
            });
            if (existingMsg) {
              await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
              continue;
            }

            const profile = await prisma.profile.findFirst({
              where: { email: { equals: fromAddress, mode: 'insensitive' } },
              include: { tenant: true }
            });

            if (!profile) {
              await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
              continue;
            }

            const plainBodyMatch = rawSource.split(/\r?\n\r?\n/).slice(1).join('\n');
            const cleanReply = plainBodyMatch
              .replace(/<[^>]+>/g, ' ')
              .replace(/=\r?\n/g, '')
              .slice(0, 1800)
              .trim();

            await prisma.aIConversationMessage.create({
              data: {
                tenantId: profile.tenantId,
                profileId: profile.id,
                role: 'USER',
                subject,
                content: cleanReply,
                messageId: msgId
              }
            });

            const aiDecision = await generateAutonomousStepOrReply({
              tenantId: profile.tenantId,
              profileId: profile.id,
              stepNumber: (profile.contactCount || 1) + 1,
              incomingReplyText: cleanReply,
              fallbackSubject: `Re: ${subject}`
            });

            const updatedScore = Math.max(0, Math.min(200, profile.icpScore + aiDecision.icpScoreDelta));

            await prisma.profile.update({
              where: { id: profile.id },
              data: {
                status: aiDecision.newStatus,
                segment: aiDecision.newSegment,
                icpScore: updatedScore,
                aiSummary: aiDecision.qualificationSummary,
                financialClean: aiDecision.financialClean ?? profile.financialClean,
                employmentType: aiDecision.employmentType ?? profile.employmentType,
                lastActivityAt: new Date()
              }
            });

            if (aiDecision.stopSequence || ['QUALIFIED', 'REJECTED'].includes(aiDecision.newStatus)) {
              await prisma.leadSequenceState.updateMany({
                where: { profileId: profile.id },
                data: { isCompleted: true }
              });
            }

            if (aiDecision.bodyText && aiDecision.bodyText.trim().length > 5 && aiDecision.newStatus !== 'REJECTED') {
              const senderName = profile.tenant.companyName;
              const htmlReply = profile.tenant.companyName.toLowerCase().includes('scintilla')
                ? buildScintillaTemplate(aiDecision.bodyText)
                : `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;">${aiDecision.bodyText.replace(/\n/g, '<br/>')}</div>`;

              await sendViaGmailRotator(profile.email, aiDecision.subject, htmlReply, senderName);

              await prisma.aIConversationMessage.create({
                data: {
                  tenantId: profile.tenantId,
                  profileId: profile.id,
                  role: 'ASSISTANT',
                  subject: aiDecision.subject,
                  content: aiDecision.bodyText,
                  inReplyTo: msgId
                }
              });
            }

            await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
          }
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err: any) {
      console.error(`⚠️ [IMAP Listener Error] (${sender.email}):`, err.message);
    }
  }
}

async function autoEnrollNewLeads() {
  const activeSequences = await prisma.sequence.findMany({
    where: { isActive: true }
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
          nextActionAt: new Date(),
          isCompleted: false,
          isUnsubscribed: false
        })),
        skipDuplicates: true
      });
    }
  }
}

const nurturingWorker = new Worker(
  'nurturing-queue',
  async (job: Job) => {
    await resetDailyQuotasIfNeeded();
    await processInboxBouncesAndReplies();
    await autoEnrollNewLeads();

    const now = new Date();
    const activeEnrollments = await prisma.leadSequenceState.findMany({
      where: {
        isCompleted: false,
        isUnsubscribed: false,
        OR: [
          { nextActionAt: null },
          { nextActionAt: { lte: now } }
        ]
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
      const { profile, sequence } = enrollment;
      const tenant = sequence.tenant;

      if (['QUALIFIED', 'REJECTED', 'ANOMALO'].includes(profile.status)) {
        await prisma.leadSequenceState.update({
          where: { id: enrollment.id },
          data: { isCompleted: true }
        });
        continue;
      }

      const nextStepNumber = enrollment.currentStep + 1;
      const maxSteps = sequence.maxSteps || tenant.aiMaxAutonomousSteps || 7;

      if (nextStepNumber > maxSteps) {
        await prisma.leadSequenceState.update({
          where: { id: enrollment.id },
          data: { isCompleted: true }
        });
        continue;
      }

      const templateStep = sequence.emails.find(e => e.stepNumber === nextStepNumber);

      if (!enrollment.nextActionAt && enrollment.lastEmailedAt) {
        const delayDays = templateStep?.delayDays ?? tenant.aiDefaultDelayDays ?? 2;
        const targetDate = new Date(enrollment.lastEmailedAt);
        targetDate.setDate(targetDate.getDate() + delayDays);
        if (now < targetDate) continue;
      }

      const targetEmail = profile.email.trim().toLowerCase();
      const dnsCheck = await preFlightEmailCheck(targetEmail);
      if (!dnsCheck.valid) {
        await quarantineDeadLead(
          profile.id,
          profile.tenantId,
          targetEmail,
          'DNS Pre-Flight Check',
          dnsCheck.reason || 'Dominio non valido'
        );
        continue;
      }

      try {
        let subjectToSend = templateStep?.subject || `Aggiornamento da ${tenant.companyName}`;
        let plainTextToSend = templateStep?.plainText || '';
        let nextDelayDays = templateStep?.delayDays ?? tenant.aiDefaultDelayDays ?? 2;

        if (sequence.useAiEngine && tenant.aiEnabled) {
          const aiOutput = await generateAutonomousStepOrReply({
            tenantId: tenant.id,
            profileId: profile.id,
            stepNumber: nextStepNumber,
            fallbackSubject: subjectToSend,
            fallbackBody: plainTextToSend
          });

          subjectToSend = aiOutput.subject;
          plainTextToSend = aiOutput.bodyText;
          nextDelayDays = aiOutput.nextDelayDays;

          if (aiOutput.stopSequence || ['QUALIFIED', 'REJECTED'].includes(aiOutput.newStatus)) {
            await prisma.profile.update({
              where: { id: profile.id },
              data: {
                status: aiOutput.newStatus,
                segment: aiOutput.newSegment,
                aiSummary: aiOutput.qualificationSummary
              }
            });
            await prisma.leadSequenceState.update({
              where: { id: enrollment.id },
              data: { isCompleted: true }
            });
            continue;
          }
        }

        if (!plainTextToSend.trim()) continue;

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tuodominio.it';
        const senderDisplayName = tenant.companyName;

        let bodyHtml = tenant.companyName.toLowerCase().includes('scintilla')
          ? buildScintillaTemplate(plainTextToSend)
          : `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #111;">${plainTextToSend.replace(/\n/g, '<br/>')}</div>`;

        const trackingPixel = `<img src="${baseUrl}/api/tracking/open?uid=${profile.id}&tid=${tenant.id}" width="1" height="1" style="display:none;" />`;
        bodyHtml = bodyHtml.includes('</body>')
          ? bodyHtml.replace('</body>', `${trackingPixel}</body>`)
          : bodyHtml + trackingPixel;

        bodyHtml = bodyHtml.replace(
          /href=["'](https?:\/\/[^"']+)["']/gi,
          `href="${baseUrl}/api/track/click?uid=${profile.id}&tid=${tenant.id}&url=$1"`
        );

        await sendViaGmailRotator(targetEmail, subjectToSend, bodyHtml, senderDisplayName);

        const nextActionDate = new Date(now.getTime() + nextDelayDays * 24 * 60 * 60 * 1000);

        await prisma.$transaction([
          prisma.leadSequenceState.update({
            where: { id: enrollment.id },
            data: {
              currentStep: nextStepNumber,
              lastEmailedAt: now,
              nextActionAt: nextActionDate
            }
          }),
          prisma.profile.update({
            where: { id: profile.id },
            data: {
              contactCount: { increment: 1 },
              lastContactedAt: now
            }
          }),
          prisma.aIConversationMessage.create({
            data: {
              tenantId: tenant.id,
              profileId: profile.id,
              role: 'ASSISTANT',
              subject: subjectToSend,
              content: plainTextToSend
            }
          }),
          prisma.automationLog.create({
            data: {
              tenantId: tenant.id,
              profileId: profile.id,
              emailAddress: targetEmail,
              subject: subjectToSend,
              status: 'SENT'
            }
          })
        ]);

        sentCount++;
      } catch (error: any) {
        const msg = error.message || '';

        if (msg.includes('superato il limite') || msg.includes('quarantena') || msg.includes('Nessuna casella')) {
          break;
        }

        const isPermanentBounce =
          /550|551|552|553|554|no such user|user unknown|address not found|does not exist|invalid recipient|message blocked|rejected/i.test(msg);

        if (isPermanentBounce) {
          await quarantineDeadLead(
            profile.id,
            tenant.id,
            targetEmail,
            'SMTP Hard Bounce',
            msg
          );
          continue;
        }
      }
    }

    return { success: true, sent: sentCount };
  },
  { connection, concurrency: 1 }
);

nurturingWorker.on('ready', async () => {
  await nurturingQueue.add(
    'autonomous-heartbeat',
    { mode: 'auto' },
    {
      repeat: { every: 15 * 60 * 1000 },
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
});
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

function normalizeEmail(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

function normalizePhone(raw: unknown): string {
  return String(raw || '').replace(/[^\d+]/g, '').trim();
}

function extractLeadField(row: Record<string, any>, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const foundKey = keys.find(k => k.trim().toLowerCase() === candidate.toLowerCase());
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      return String(row[foundKey]).trim();
    }
  }
  return '';
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const tenantIdInput = String(formData.get('tenantId') || '').trim();
    const companyName = String(formData.get('companyName') || 'Nuovo Tenant').trim();
    const agentName = String(formData.get('agentName') || `Team ${companyName}`).trim();

    const aiProvider = (String(formData.get('aiProvider') || 'OPENAI').toUpperCase() as 'OPENAI' | 'ANTHROPIC');
    const aiModel = String(formData.get('aiModel') || 'gpt-4o-mini').trim();
    const aiApiKey = String(formData.get('aiApiKey') || '').trim();
    const aiMaxAutonomousSteps = Number(formData.get('aiMaxAutonomousSteps') || 7);
    const aiDefaultDelayDays = Number(formData.get('aiDefaultDelayDays') || 2);

    const industryContext = String(formData.get('industryContext') || '').trim();
    const offerCatalog = String(formData.get('offerCatalog') || '').trim();
    const qualificationCriteria = String(formData.get('qualificationCriteria') || '').trim();
    const disqualifyingRules = String(formData.get('disqualifyingRules') || '').trim();

    const senderEmail = normalizeEmail(formData.get('senderEmail'));
    const senderPassword = String(formData.get('senderPassword') || '').trim();
    const senderProvider = String(formData.get('senderProvider') || 'GMAIL').toUpperCase();
    const smtpHost = String(formData.get('smtpHost') || (senderProvider === 'GMAIL' ? 'smtp.gmail.com' : '')).trim();
    const smtpPort = Number(formData.get('smtpPort') || 465);
    const imapHost = String(formData.get('imapHost') || (senderProvider === 'GMAIL' ? 'imap.gmail.com' : '')).trim();
    const imapPort = Number(formData.get('imapPort') || 993);
    const dailyLimit = Number(formData.get('dailyLimit') || 90);

    const file = formData.get('databaseFile') as File | null;

    let tenant = tenantIdInput
      ? await prisma.tenant.findUnique({ where: { id: tenantIdInput } })
      : await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });

    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          companyName,
          apiKey: `rls_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
          aiEnabled: true,
          aiProvider,
          aiModel,
          ...(aiApiKey ? { aiApiKey } : {}),
          aiMaxAutonomousSteps,
          aiDefaultDelayDays
        }
      });
    } else {
      tenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          companyName: companyName || tenant.companyName,
          aiEnabled: true,
          aiProvider,
          aiModel,
          ...(aiApiKey ? { aiApiKey } : {}),
          aiMaxAutonomousSteps,
          aiDefaultDelayDays
        }
      });
    }

    await prisma.aIAgentConfig.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        agentName,
        industryContext,
        offerCatalog,
        qualificationCriteria,
        disqualifyingRules
      },
      update: {
        agentName,
        industryContext,
        offerCatalog,
        qualificationCriteria,
        disqualifyingRules
      }
    });

    if (senderEmail && senderPassword) {
      await prisma.gmailSender.upsert({
        where: { email: senderEmail },
        create: {
          tenantId: tenant.id,
          email: senderEmail,
          appPassword: senderPassword,
          provider: senderProvider,
          smtpHost: smtpHost || 'smtp.gmail.com',
          smtpPort,
          imapHost: imapHost || 'imap.gmail.com',
          imapPort,
          dailyLimit,
          isActive: true,
          quarantineUntil: null
        },
        update: {
          tenantId: tenant.id,
          appPassword: senderPassword,
          provider: senderProvider,
          smtpHost: smtpHost || 'smtp.gmail.com',
          smtpPort,
          imapHost: imapHost || 'imap.gmail.com',
          imapPort,
          dailyLimit,
          isActive: true,
          quarantineUntil: null,
          errorLog: null
        }
      });
    }

    let sequence = await prisma.sequence.findFirst({
      where: { tenantId: tenant.id, isActive: true }
    });

    if (!sequence) {
      sequence = await prisma.sequence.create({
        data: {
          tenantId: tenant.id,
          name: `AI Autopilot - ${tenant.companyName}`,
          description: 'Sequenza dinamica multi-step gestita integralmente da AI',
          isActive: true,
          useAiEngine: true,
          maxSteps: aiMaxAutonomousSteps
        }
      });
    } else {
      sequence = await prisma.sequence.update({
        where: { id: sequence.id },
        data: {
          isActive: true,
          useAiEngine: true,
          maxSteps: aiMaxAutonomousSteps
        }
      });
    }

    let importedLeadsCount = 0;
    letenrolledLeadsCount = 0;

    if (file && file.size > 0) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[firstSheetName], { defval: '' });

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const uniqueLeadsMap = new Map<string, {
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        problemDescription: string;
      }>();

      for (const row of rows) {
        const email = normalizeEmail(
          extractLeadField(row, ['email', 'e-mail', 'mail', 'indirizzo email', 'Email', 'E-mail'])
        );

        if (!email || !emailRegex.test(email) || email.endsWith('@gmail.it')) continue;

        let firstName = extractLeadField(row, ['firstName', 'first_name', 'nome', 'Nome', 'name', 'Name']);
        let lastName = extractLeadField(row, ['lastName', 'last_name', 'cognome', 'Cognome', 'surname']);
        const fullName = extractLeadField(row, ['fullName', 'full_name', 'nominativo', 'contatto', 'cliente']);

        if (!firstName && fullName) {
          const parts = fullName.split(/\s+/);
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ');
        }

        const phone = normalizePhone(
          extractLeadField(row, ['phone', 'telefono', 'cellulare', 'tel', 'Telefono', 'Mobile'])
        );

        const notes = extractLeadField(row, ['note', 'notes', 'messaggio', 'richiesta', 'problemDescription', 'auto']);

        uniqueLeadsMap.set(email, {
          email,
          firstName,
          lastName,
          phone,
          problemDescription: notes
        });
      }

      for (const item of uniqueLeadsMap.values()) {
        const profile = await prisma.profile.upsert({
          where: {
            tenantId_email: {
              tenantId: tenant.id,
              email: item.email
            }
          },
          create: {
            tenantId: tenant.id,
            email: item.email,
            firstName: item.firstName || null,
            lastName: item.lastName || null,
            phone: item.phone || null,
            problemDescription: item.problemDescription || null,
            status: 'NURTURING',
            segment: 'Tiepido',
            isVerified: true,
            icpScore: 35
          },
          update: {
            firstName: item.firstName || undefined,
            lastName: item.lastName || undefined,
            phone: item.phone || undefined,
            ...(item.problemDescription ? { problemDescription: item.problemDescription } : {})
          }
        });

        importedLeadsCount++;

        if (!['REJECTED', 'ANOMALO', 'QUALIFIED'].includes(profile.status)) {
          await prisma.leadSequenceState.upsert({
            where: {
              profileId_sequenceId: {
                profileId: profile.id,
                sequenceId: sequence.id
              }
            },
            create: {
              profileId: profile.id,
              sequenceId: sequence.id,
              currentStep: 0,
              nextActionAt: new Date(),
              isCompleted: false,
              isUnsubscribed: false
            },
            update: {
              isCompleted: false,
              isUnsubscribed: false,
              nextActionAt: new Date()
            }
          });
          enrolledLeadsCount++;
        }
      }
    }

    if (process.env.REDIS_URL) {
      const connection = new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        connectTimeout: 5000,
        family: 4,
        tls: process.env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
      });
      const nurturingQueue = new Queue('nurturing-queue', { connection });
      await nurturingQueue.add(
        'instant-one-click-launch',
        { tenantId: tenant.id, triggeredAt: new Date().toISOString() },
        { jobId: `instant-launch-${Date.now()}`, removeOnComplete: true }
      );
      await connection.quit();
    }

    return NextResponse.json({
      success: true,
      tenantId: tenant.id,
      sequenceId: sequence.id,
      importedLeadsCount,
      enrolledLeadsCount
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Errore durante l’avvio One-Click' },
      { status: 500 }
    );
  }
}
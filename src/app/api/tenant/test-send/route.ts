import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendViaGmailRotator } from '@/lib/services/gmailService';
import { generateNativeStepEmail, getDefaultStepTemplates } from '@/lib/services/aiAutonomousEngine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenantId = String(body.tenantId || '').trim();
    const testEmail = String(body.testEmail || '').trim().toLowerCase();
    const testFirstName = String(body.testFirstName || 'Alessio').trim();
    const stepIndex = Number(body.stepIndex || 0);
    const enrollInQueue = Boolean(body.enrollInQueue);

    if (!tenantId || !testEmail) {
      return NextResponse.json({ error: 'Inserisci un indirizzo email valido per il test.' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        aiAgentConfig: true,
        sequences: {
          where: { isActive: true },
          include: { emails: { orderBy: { stepNumber: 'asc' } } },
          take: 1
        }
      }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Azienda non trovata.' }, { status: 404 });
    }

    const seq = tenant.sequences[0];
    const savedTemplates =
      seq?.emails && seq.emails.length > 0
        ? seq.emails.map(e => ({
            stepNumber: e.stepNumber,
            delayDays: e.delayDays,
            subject: e.subject,
            bodyText: e.plainText
          }))
        : getDefaultStepTemplates();

    const payload = generateNativeStepEmail(
      stepIndex,
      { firstName: testFirstName, email: testEmail },
      {
        companyName: tenant.companyName,
        agentName: tenant.aiAgentConfig?.agentName,
        industryContext: tenant.aiAgentConfig?.industryContext,
        offerCatalog: tenant.aiAgentConfig?.offerCatalog,
        qualificationCriteria: tenant.aiAgentConfig?.qualificationCriteria,
        customTemplates: savedTemplates
      }
    );

    await sendViaGmailRotator(
      testEmail,
      payload.subject,
      payload.html,
      tenant.aiAgentConfig?.agentName || tenant.companyName,
      tenant.id
    );

    const profile = await prisma.profile.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: testEmail } },
      create: {
        tenantId: tenant.id,
        email: testEmail,
        firstName: testFirstName,
        status: 'NURTURING',
        segment: 'Test Personale',
        isVerified: true,
        icpScore: 50,
        lastContactedAt: new Date()
      },
      update: {
        firstName: testFirstName,
        status: 'NURTURING',
        lastContactedAt: new Date()
      }
    });

    if (enrollInQueue && seq) {
      await prisma.leadSequenceState.upsert({
        where: { profileId_sequenceId: { profileId: profile.id, sequenceId: seq.id } },
        create: {
          profileId: profile.id,
          sequenceId: seq.id,
          currentStep: 1,
          lastEmailedAt: new Date(),
          nextActionAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          isCompleted: false,
          isUnsubscribed: false
        },
        update: {
          currentStep: 1,
          lastEmailedAt: new Date(),
          isCompleted: false,
          isUnsubscribed: false
        }
      });
    }

    await prisma.automationLog.create({
      data: {
        tenantId: tenant.id,
        profileId: profile.id,
        emailAddress: testEmail,
        subject: `[TEST STEP ${stepIndex + 1}] ${payload.subject}`,
        status: 'SENT'
      }
    });

    return NextResponse.json({
      success: true,
      message: `Email di test (Step ${stepIndex + 1}) inviata con successo a ${testEmail}! Ora puoi anche rispondere direttamente dal tuo client di posta per testare la qualificazione automatica.`
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Errore durante l’invio di test' }, { status: 500 });
  }
}
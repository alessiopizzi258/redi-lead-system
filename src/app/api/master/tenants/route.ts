import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          aiAgentConfig: true,
          sequences: { where: { isActive: true }, take: 1 }
        }
      });

      if (!tenant) {
        return NextResponse.json({ error: 'Azienda non trovata' }, { status: 404 });
      }

      const [gmailSenders, totalLeads, qualifiedLeads, nurturingLeads, rejectedLeads] = await Promise.all([
        prisma.gmailSender.findMany({ where: { tenantId: tenant.id } }),
        prisma.profile.count({ where: { tenantId: tenant.id } }),
        prisma.profile.count({ where: { tenantId: tenant.id, status: 'QUALIFIED' } }),
        prisma.profile.count({ where: { tenantId: tenant.id, status: 'NURTURING' } }),
        prisma.profile.count({ where: { tenantId: tenant.id, status: { in: ['REJECTED', 'ANOMALO'] } } })
      ]);

      return NextResponse.json({
        tenant: {
          ...tenant,
          gmailSenders
        },
        stats: { totalLeads, qualifiedLeads, nurturingLeads, rejectedLeads }
      });
    }

    const [tenants, allSenders] = await Promise.all([
      prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          aiAgentConfig: true,
          _count: {
            select: { profiles: true, sequences: true }
          }
        }
      }),
      prisma.gmailSender.findMany()
    ]);

    const enrichedTenants = await Promise.all(
      tenants.map(async (t) => {
        const [qualifiedCount, nurturingCount, rejectedCount] = await Promise.all([
          prisma.profile.count({ where: { tenantId: t.id, status: 'QUALIFIED' } }),
          prisma.profile.count({ where: { tenantId: t.id, status: 'NURTURING' } }),
          prisma.profile.count({ where: { tenantId: t.id, status: { in: ['REJECTED', 'ANOMALO'] } } })
        ]);

        const tenantSenders = allSenders.filter((s) => s.tenantId === t.id);
        const primarySender = tenantSenders.length > 0 ? tenantSenders[0] : null;

        return {
          id: t.id,
          companyName: t.companyName,
          apiKey: t.apiKey,
          aiEnabled: t.aiEnabled,
          maxSteps: t.aiMaxAutonomousSteps,
          delayDays: t.aiDefaultDelayDays,
          createdAt: t.createdAt,
          agentName: t.aiAgentConfig?.agentName || `Team ${t.companyName}`,
          industryContext: t.aiAgentConfig?.industryContext || '',
          offerCatalog: t.aiAgentConfig?.offerCatalog || '',
          senderEmail: primarySender ? primarySender.email : 'Nessuna email configurata',
          senderProvider: primarySender ? primarySender.provider : 'GMAIL',
          senderActive: primarySender ? primarySender.isActive : false,
          sentToday: tenantSenders.reduce((acc, s) => acc + (s.sentToday || 0), 0),
          dailyLimit: tenantSenders.reduce((acc, s) => acc + (s.dailyLimit || 0), 0),
          stats: {
            total: t._count.profiles,
            qualified: qualifiedCount,
            nurturing: nurturingCount,
            rejected: rejectedCount
          }
        };
      })
    );

    return NextResponse.json({ tenants: enrichedTenants });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Errore lettura aziende' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const companyName = String(body.companyName || '').trim();
    const industryContext = String(body.industryContext || '').trim();
    const agentName = String(body.agentName || `Team ${companyName}`).trim();

    if (!companyName) {
      return NextResponse.json({ error: 'Il nome azienda è obbligatorio' }, { status: 400 });
    }

    const tenant = await prisma.tenant.create({
      data: {
        companyName,
        apiKey: `rls_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`,
        aiEnabled: true,
        aiMaxAutonomousSteps: 4,
        aiDefaultDelayDays: 2,
        aiAgentConfig: {
          create: {
            agentName,
            industryContext: industryContext || `Servizi e offerte ${companyName}`,
            offerCatalog: '',
            qualificationCriteria: 'Requisiti standard verificati e interesse confermato.',
            disqualifyingRules: 'crif, protestato, pignoramento, disoccupato, non interessa'
          }
        },
        sequences: {
          create: {
            name: `Autopilot Nativo - ${companyName}`,
            description: 'Sequenza automatica isolata per tenant',
            isActive: true,
            useAiEngine: true,
            maxSteps: 4
          }
        }
      }
    });

    return NextResponse.json({ success: true, tenant });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Errore creazione azienda' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId mancante' }, { status: 400 });
    }

    await prisma.gmailSender.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Errore eliminazione azienda' }, { status: 500 });
  }
}
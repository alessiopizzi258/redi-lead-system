import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDefaultStepTemplates } from '@/lib/services/aiAutonomousEngine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenantId = String(body.tenantId || '').trim();
    const templates = Array.isArray(body.templates) ? body.templates : getDefaultStepTemplates();

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId mancante' }, { status: 400 });
    }

    let sequence = await prisma.sequence.findFirst({
      where: { tenantId, isActive: true }
    });

    if (!sequence) {
      sequence = await prisma.sequence.create({
        data: {
          tenantId,
          name: 'Sequenza Principale',
          isActive: true,
          useAiEngine: true,
          maxSteps: templates.length
        }
      });
    } else {
      await prisma.sequence.update({
        where: { id: sequence.id },
        data: { maxSteps: templates.length }
      });
    }

    await prisma.emailTemplate.deleteMany({ where: { sequenceId: sequence.id } });

    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      await prisma.emailTemplate.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: i + 1,
          delayDays: Number(t.delayDays ?? 2),
          subject: String(t.subject || `Step ${i + 1}`),
          plainText: String(t.bodyText || '')
        }
      });
    }

    return NextResponse.json({ success: true, count: templates.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Errore salvataggio template' }, { status: 500 });
  }
}
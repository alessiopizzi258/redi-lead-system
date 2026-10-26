import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const dynamic = "force-dynamic";

const connection = new IORedis(process.env.REDIS_URL!, {
  tls: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-rls-api-key");
    if (!apiKey) return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });

    const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
    if (!tenant) return NextResponse.json({ success: false, message: "Credenziali Tenant non valide" }, { status: 403 });

    const sequence = await prisma.sequence.findFirst({
      where: { tenantId: tenant.id, name: "Promo Luce Fix - Scintilla Hub" }
    });

    if (!sequence) {
      return NextResponse.json({ success: false, message: "Sequenza non trovata." }, { status: 404 });
    }

    // 1. SVEGLIA IL WORKER IN OGNI CASO (Il comando passa sempre)
    const nurturingQueue = new Queue('nurturing-queue', { connection });
    await nurturingQueue.add('start-campaigns', {}, { removeOnComplete: true });

    // 2. Cerca nuovi lead da agganciare
    const unenrolledLeads = await prisma.profile.findMany({
      where: {
        tenantId: tenant.id,
        status: { notIn: ['REJECTED', 'ANOMALO', 'QUALIFIED'] },
        sequenceStates: { none: { sequenceId: sequence.id } }
      },
      select: { id: true }
    });

    // Se non ci sono nuovi lead, avvisa ma il worker è comunque partito
    if (unenrolledLeads.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "Nessun nuovo lead, ma motore di invio forzato." }, { status: 200 });
    }

    // 3. Aggancia i nuovi lead
    const enrollments = unenrolledLeads.map(lead => ({
      profileId: lead.id,
      sequenceId: sequence.id,
      currentStep: 0,
      isCompleted: false,
      isUnsubscribed: false
    }));

    const result = await prisma.leadSequenceState.createMany({
      data: enrollments,
      skipDuplicates: true
    });

    return NextResponse.json({ success: true, count: result.count, message: "Lead agganciati e motore avviato." }, { status: 200 });

  } catch (error: any) {
    console.error("❌ [Enroll API Error]:", error.message);
    return NextResponse.json({ success: false, message: "Errore interno" }, { status: 500 });
  }
}
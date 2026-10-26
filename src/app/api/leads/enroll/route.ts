import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL!, {
  tls: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Scudo di sicurezza: operazione consentita solo con API Key autorizzata
    const apiKey = req.headers.get("x-rls-api-key");
    if (!apiKey) return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });

    const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
    if (!tenant) return NextResponse.json({ success: false, message: "Credenziali Tenant non valide" }, { status: 403 });

    // 2. Identifica la Sequenza di Nurturing attiva
    const sequence = await prisma.sequence.findFirst({
      where: { 
        tenantId: tenant.id,
        name: "Promo Luce Fix - Scintilla Hub"
      }
    });

    if (!sequence) {
      return NextResponse.json({ success: false, message: "Sequenza Promo Luce Fix non trovata per questo Tenant." }, { status: 404 });
    }

    // 3. Estrai i lead validi non ancora iscritti (esclude gli scarti e i già chiusi)
    const unenrolledLeads = await prisma.profile.findMany({
      where: {
        tenantId: tenant.id,
        status: { notIn: ['REJECTED', 'ANOMALO', 'QUALIFIED'] },
        sequenceStates: {
          none: { sequenceId: sequence.id }
        }
      },
      select: { id: true }
    });

    if (unenrolledLeads.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "Tutti i lead sono già in sequenza." }, { status: 200 });
    }

    // 4. Iniezione massiva per l'innesco del Worker asincrono
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

    // NUOVO: Sveglia il Worker per iniziare le spedizioni immediatamente
    const nurturingQueue = new Queue('nurturing-queue', { connection });
    await nurturingQueue.add('start-campaigns', {}, { 
      removeOnComplete: true, 
      removeOnFail: true 
    });

    return NextResponse.json({ success: true, count: result.count, message: "Lead agganciati con successo." }, { status: 200 });

  } catch (error: any) {
    console.error("❌ [Enroll API Error]:", error.message);
    return NextResponse.json({ success: false, message: "Errore interno del server" }, { status: 500 });
  }
}
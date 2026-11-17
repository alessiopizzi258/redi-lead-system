import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function escapeCsvField(val: unknown): string {
  const str = String(val ?? '').replace(/\r?\n|\r/g, ' ').trim();
  if (str.includes(';') || str.includes('"') || str.includes(',')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId')?.trim();
    const minScore = Number(searchParams.get('minScore') || 0);
    const onlyClean = searchParams.get('onlyClean') === 'true';

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId mancante' }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return NextResponse.json({ error: 'Azienda non trovata' }, { status: 404 });
    }

    const whereClause: any = { tenantId };

    if (onlyClean) {
      whereClause.status = { notIn: ['REJECTED', 'ANOMALO'] };
    }
    if (minScore > 0) {
      whereClause.icpScore = { gte: minScore };
    }

    const leads = await prisma.profile.findMany({
      where: whereClause,
      orderBy: [{ status: 'asc' }, { icpScore: 'desc' }, { updatedAt: 'desc' }]
    });

    const headers = [
      'Email',
      'Nome',
      'Cognome',
      'Telefono',
      'Stato',
      'Segmento',
      'Punteggio ICP',
      'Note / Valutazione',
      'Ultimo Contatto',
      'Data Creazione'
    ];

    const rows = leads.map(l => [
      escapeCsvField(l.email),
      escapeCsvField(l.firstName),
      escapeCsvField(l.lastName),
      escapeCsvField(l.phone),
      escapeCsvField(l.status),
      escapeCsvField(l.segment),
      escapeCsvField(l.icpScore),
      escapeCsvField(l.aiSummary || l.problemDescription || ''),
      escapeCsvField(l.lastContactedAt ? new Date(l.lastContactedAt).toLocaleString('it-IT') : ''),
      escapeCsvField(new Date(l.createdAt).toLocaleString('it-IT'))
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const safeName = tenant.companyName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads_${safeName}_${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Errore export CSV' }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenantId = String(body.tenantId || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const appPassword = String(body.appPassword || '').trim();
    const provider = String(body.provider || 'GMAIL').toUpperCase();
    const smtpHost = String(body.smtpHost || (provider === 'GMAIL' ? 'smtp.gmail.com' : '')).trim();
    const smtpPort = Number(body.smtpPort || 465);
    const imapHost = String(body.imapHost || (provider === 'GMAIL' ? 'imap.gmail.com' : '')).trim();
    const imapPort = Number(body.imapPort || 993);
    const dailyLimit = Number(body.dailyLimit || 90);

    if (!tenantId || !email || !appPassword) {
      return NextResponse.json({ error: 'Tenant, Email e Password sono obbligatori.' }, { status: 400 });
    }

    const sender = await prisma.gmailSender.upsert({
      where: { email },
      create: {
        tenantId,
        email,
        appPassword,
        provider,
        smtpHost: smtpHost || 'smtp.gmail.com',
        smtpPort,
        imapHost: imapHost || 'imap.gmail.com',
        imapPort,
        dailyLimit,
        isActive: true,
        quarantineUntil: null
      },
      update: {
        tenantId,
        appPassword,
        provider,
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

    return NextResponse.json({ success: true, sender });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Errore salvataggio casella' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 });

    await prisma.gmailSender.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Errore rimozione casella' }, { status: 500 });
  }
}
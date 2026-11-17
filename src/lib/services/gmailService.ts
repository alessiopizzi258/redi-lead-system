import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';

export async function resetDailyQuotasIfNeeded() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  await prisma.gmailSender.updateMany({
    where: {
      OR: [
        { lastSentAt: { lt: startOfToday } },
        { lastSentAt: null }
      ]
    },
    data: {
      sentToday: 0
    }
  });

  await prisma.gmailSender.updateMany({
    where: {
      quarantineUntil: { lte: now }
    },
    data: {
      quarantineUntil: null,
      isActive: true
    }
  });
}

export async function sendViaGmailRotator(
  to: string,
  subject: string,
  html: string,
  senderDisplayName: string,
  tenantId?: string
) {
  const now = new Date();

  const senders = await prisma.gmailSender.findMany({
    where: {
      isActive: true,
      ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {}),
      OR: [
        { quarantineUntil: null },
        { quarantineUntil: { lte: now } }
      ]
    },
    orderBy: { sentToday: 'asc' }
  });

  const availableSender = senders.find(s => s.sentToday < s.dailyLimit);

  if (!availableSender) {
    throw new Error('Nessuna casella disponibile o tutte hanno superato il limite giornaliero');
  }

  const host = availableSender.smtpHost || 'smtp.gmail.com';
  const port = availableSender.smtpPort || 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: availableSender.email,
      pass: availableSender.appPassword.replace(/\s+/g, '')
    }
  });

  await transporter.sendMail({
    from: `"${senderDisplayName}" <${availableSender.email}>`,
    to,
    subject,
    html
  });

  await prisma.gmailSender.update({
    where: { id: availableSender.id },
    data: {
      sentToday: { increment: 1 },
      lastSentAt: new Date()
    }
  });
}
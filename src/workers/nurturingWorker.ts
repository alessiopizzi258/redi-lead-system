import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { buildScintillaTemplate } from '@/lib/utils/emailWrapper';
import { prisma } from '@/lib/prisma';
import { sendViaGmailRotator } from '@/lib/services/gmailService'; // Oppure Resend

const connection = new IORedis(process.env.REDIS_URL!, {
  tls: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

const nurturingWorker = new Worker(
  'nurturing-queue',
  async (job: Job) => {
    console.log(`[Nurturing Engine] Avvio ciclo di invio sequenziale...`);

    // 1. Pesca le iscrizioni attive, non completate e non disiscritte
    const activeEnrollments = await prisma.leadSequenceState.findMany({
      where: { 
        isCompleted: false,
        isUnsubscribed: false,
      },
      include: {
        profile: true,
        sequence: {
          include: {
            tenant: true, // <-- Join relazionale per estrarre companyName
            emails: { orderBy: { stepNumber: 'asc' } }
          }
        }
      }
    });

    let sentCount = 0;

    for (const enrollment of activeEnrollments) {
      // Un lead in QUALIFIED non deve più ricevere email di Nurturing, è pronto per la vendita
      if (enrollment.profile.status === 'QUALIFIED') {
        await prisma.leadSequenceState.update({
          where: { id: enrollment.id },
          data: { isCompleted: true }
        });
        continue;
      }

      // 2. Identifica il prossimo Step
      const nextStepIndex = enrollment.sequence.emails.findIndex(e => e.stepNumber > enrollment.currentStep);
      
      // Se non ci sono più email, contrassegna come completata
      if (nextStepIndex === -1) {
        await prisma.leadSequenceState.update({
          where: { id: enrollment.id },
          data: { isCompleted: true }
        });
        continue;
      }

      const nextEmail = enrollment.sequence.emails[nextStepIndex];

      // 3. Calcolo Finestra Temporale (Delay)
      const now = new Date();
      if (enrollment.lastEmailedAt) {
        const targetDate = new Date(enrollment.lastEmailedAt);
        targetDate.setDate(targetDate.getDate() + nextEmail.delayDays);
        
        // Se non è ancora il giorno giusto, salta
        if (now < targetDate) continue;
      }

      try {
        // 4. Iniezione Layout Dinamico e Tracciamento
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tuodominio.it";
        const tenantId = enrollment.profile.tenantId;
        const tenantName = enrollment.sequence.tenant.companyName; // <-- Referenza risolta
        
        let bodyHtml = "";

        // Dispatcher dei Layout per Tenant
        if (tenantName.includes("Scintilla")) {
          bodyHtml = buildScintillaTemplate(nextEmail.plainText);
        } else {
          // Layout di Default Minimal per i futuri tenant
          bodyHtml = `
            <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111;">
              ${nextEmail.plainText.replace(/\n/g, '<br/>')}
            </div>`;
        }
        
        // Pixel di apertura iniettato prima della chiusura del tag body o alla fine
        const trackingPixel = `<img src="${baseUrl}/api/tracking/open?uid=${enrollment.profile.id}&tid=${tenantId}" width="1" height="1" style="display:none;" />`;
        if (bodyHtml.includes("</body>")) {
          bodyHtml = bodyHtml.replace("</body>", `${trackingPixel}</body>`);
        } else {
          bodyHtml += trackingPixel;
        }

        // Sostituzione dei link per il tracciamento click
        bodyHtml = bodyHtml.replace(
          /href=["'](https?:\/\/[^"']+)["']/gi, 
          `href="${baseUrl}/api/track/click?uid=${enrollment.profile.id}&tid=${tenantId}&url=$1"`
        );

        // 5. Sparo tramite il rotatore nativo
        await sendViaGmailRotator(
          enrollment.profile.email, 
          nextEmail.subject, 
          bodyHtml
        );

        // 6. Aggiorna lo stato della sequenza
        await prisma.leadSequenceState.update({
          where: { id: enrollment.id },
          data: {
            currentStep: nextEmail.stepNumber,
            lastEmailedAt: now
          }
        });

        sentCount++;
        console.log(`✅ [Nurturing] Inviato Step ${nextEmail.stepNumber} a ${enrollment.profile.email}`);

      } catch (error: any) {
        console.error(`❌ [Nurturing Error] Impossibile inviare a ${enrollment.profile.email}:`, error.message);
      }
    }

    return { success: true, sent: sentCount };
  },
  { connection }
);

nurturingWorker.on('ready', () => console.log('⚙️ [Nurturing Worker] ONLINE. Pronto per Drip Campaigns.'));
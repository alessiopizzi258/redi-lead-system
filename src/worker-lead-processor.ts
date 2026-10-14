/**
 * @file src/worker-lead-processor.ts
 * @description
 * Worker BullMQ per l'elaborazione asincrona dei Power Leads.
 * Genera l'OTP, aggiorna il record su PostgreSQL e gestisce lo stato di qualificazione.
 * Ottimizzato per l'esecuzione in background (PM2/Docker).
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@/lib/prisma';
import { LeadStatus } from '@prisma/client';
import crypto from 'crypto';

// ----------------------------------------------------------------------
// 1. INIZIALIZZAZIONE CONNESSIONE REDIS (I/O OPTIMIZED)
// ----------------------------------------------------------------------
const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  tls: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

// ----------------------------------------------------------------------
// 2. FUNZIONI QUANTITATIVE E DI SUPPORTO
// ----------------------------------------------------------------------
/**
 * Genera un OTP crittograficamente sicuro a 6 cifre.
 */
function generateSecureOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// ----------------------------------------------------------------------
// 3. ISTANZIAZIONE DEL WORKER
// ----------------------------------------------------------------------
const leadWorker = new Worker(
  'lead-processing',
  async (job: Job) => {
    // Gestione retrocompatibilità nome variabile (leadId vs profileId)
    const targetId = job.data.profileId || job.data.leadId;
    const icpScore = job.data.icpScore ?? 0;

    console.log(`[WORKER] Inizio elaborazione Job ${job.id} per Lead/Profile: ${targetId}`);

    if (!targetId) {
      throw new Error('Identificativo Lead mancante nel payload del Job.');
    }

    try {
      // 3A. Verifica esistenza record
      const profile = await prisma.profile.findUnique({
        where: { id: targetId },
      });

      if (!profile) {
        throw new Error(`Record Profile [${targetId}] non trovato nel database.`);
      }

      // 3B. Generazione OTP e definizione scadenza (10 minuti)
      const otpCode = generateSecureOTP();
      const expiresAt = new Date(Date.now() + 10 * 60000);

      // 3C. Transazione atomica: Salvataggio OTP + Aggiornamento Stato
      await prisma.$transaction(async (tx) => {
        // Scrittura del token
        await tx.otpToken.create({
          data: {
            token: otpCode,
            profileId: targetId,
            expiresAt: expiresAt,
          },
        });

        // Promozione di stato a QUALIFIED
        await tx.profile.update({
          where: { id: targetId },
          data: {
            status: LeadStatus.QUALIFIED,
            updatedAt: new Date(),
          },
        });
      });

      console.log(`✅ [WORKER] Job ${job.id} completato. OTP generato e stato promosso a QUALIFIED.`);
      
      // Valore di ritorno memorizzato in Redis per tracciamento job
      return { success: true, targetId, otpCode, score: icpScore };

    } catch (error: unknown) {
      // 3D. Gestione parametrica dell'errore e declassamento stato
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      console.error(`❌ [WORKER] Fallimento Job ${job.id}:`, errorMessage);

      // Tentativo di fallback per evitare che il lead rimanga in un limbo
      try {
        await prisma.profile.update({
          where: { id: targetId },
          data: { status: LeadStatus.DA_VERIFICARE_MANUALMENTE },
        });
      } catch (fallbackError) {
        console.error(`⚠️ [WORKER] Impossibile aggiornare lo stato di fallback per ${targetId}`);
      }

      // Rilancia l'errore per permettere a BullMQ di gestire i tentativi (backoff)
      throw error;
    }
  },
  { 
    connection,
    concurrency: 5, // Parametrizzazione carico parallelo
  }
);

// ----------------------------------------------------------------------
// 4. EVENT LISTENERS & GRACEFUL SHUTDOWN (DEMONIZZAZIONE)
// ----------------------------------------------------------------------
leadWorker.on('ready', () => console.log('⚙️ [Lead Processor Worker] ONLINE e in ascolto.'));
leadWorker.on('failed', (job, err) => console.error(`🚨 [Lead Processor Worker] Job ${job?.id} fallito definitivamente:`, err.message));

// Chiusura controllata per impedire la perdita di job durante il riavvio del demone
const gracefulShutdown = async (signal: string) => {
  console.log(`\n[${signal}] Avvio procedura di Graceful Shutdown per il Worker...`);
  await leadWorker.close();
  await prisma.$disconnect();
  connection.disconnect();
  console.log('Worker terminato in sicurezza. Uscita.');
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
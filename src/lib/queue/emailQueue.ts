import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../prisma';

// 1. Connessione Corazzata a Redis Cloud (Upstash)
// Aggiungiamo il blocco TLS per evitare l'ECONNRESET su Windows/Node24
const connection = new IORedis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
  tls: {
    // 🛡️ Patch vitale: ignora la validazione dei certificati locali 
    // spesso mancanti o corrotti negli store di Windows.
    rejectUnauthorized: false 
  }
});

// 2. Inizializzazione della Coda Principale
export const emailQueue = new Queue('email-queue', { 
  connection 
});

// 3. Servizio di Iniezione (Il Caricatore)
export class QueueService {
  /**
   * Seleziona chirurgicamente i lead a "Freddo" e li spara nella coda 
   */
  static async enqueueWarmupBatch(tenantId: string, campaignId: string) {
    
    const profiles = await prisma.profile.findMany({
      where: {
        tenantId: tenantId,
        segment: "Freddo",
        contactCount: 0,
      },
      take: 25, 
    });

    if (profiles.length === 0) {
      console.log(`[QueueService] Nessun bersaglio utile trovato.`);
      return 0;
    }

    let enqueued = 0;

    // Usiamo una Promise.all per velocizzare l'iniezione (non sequenziale)
    // Questo ridurrà drasticamente il tempo di risposta dell'API Cron.
    await Promise.all(profiles.map(profile => 
      emailQueue.add('generate-and-draft', {
        profileId: profile.id,
        tenantId: tenantId,
        campaignId: campaignId
      })
    ));

    enqueued = profiles.length;
    console.log(`🎯 [QueueService] Iniettati ${enqueued} bersagli. DeepSeek in coda.`);
    return enqueued;
  }
}
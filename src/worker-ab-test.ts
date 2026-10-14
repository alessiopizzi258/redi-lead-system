/**
 * @file src/worker-ab-test.ts
 * @description
 * Worker BullMQ dedicato al lifecycle degli A/B Test. 
 * Valuta l'esito dei test dopo 48 ore misurando i tassi di apertura (open rate) 
 * tra due varianti ed elegge il vincitore aggiornando il database.
 */

import 'dotenv/config';
import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";

const connection = new IORedis(process.env.REDIS_URL!, { tls: { rejectUnauthorized: false } });

const abTestWorker = new Worker(
  "ab-test-evaluator",
  async (job: Job) => {
    const { campaignId, tenantId, variantAId, variantBId } = job.data;
    console.log(`[A/B TEST] Valutazione Campagna ${campaignId} a 48h...`);

    // 1. Estrazione metriche di Apertura
    const statsA = await prisma.automationLog.count({
      where: { campaignId, variantId: variantAId, status: "OPENED" }
    });
    
    const statsB = await prisma.automationLog.count({
      where: { campaignId, variantId: variantBId, status: "OPENED" }
    });

    const totalOpens = statsA + statsB;

    if (totalOpens === 0) {
      console.log("[A/B TEST] Nessun dato sufficiente. Mantengo Variante A per default.");
      return;
    }

    // 2. Calcolo Delta
    const winRateA = (statsA / totalOpens) * 100;
    const winRateB = (statsB / totalOpens) * 100;
    const delta = Math.abs(winRateA - winRateB);

    let winnerId = variantAId; // Fallback di sicurezza a Variante A

    // Se la differenza è significativa (> 2%), si dichiara il vincitore
    if (delta > 2.0) {
      winnerId = winRateA > winRateB ? variantAId : variantBId;
      console.log(`🏆 [A/B TEST] Vincitore identificato. Variante: ${winnerId === variantAId ? 'A' : 'B'} (Delta: ${delta.toFixed(2)}%)`);
    } else {
      console.log(`⚖️ [A/B TEST] Pareggio tecnico (Delta: ${delta.toFixed(2)}%). Confermo Variante A.`);
    }

    // 3. Elettore del Master Subject
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { winningVariantId: winnerId, status: "OPTIMIZED" }
    });

  },
  { connection }
);

abTestWorker.on('ready', () => console.log("🧪 [A/B Test Worker] ONLINE."));
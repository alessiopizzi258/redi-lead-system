import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Queue } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';
import crypto from 'crypto';

export const dynamic = "force-dynamic";
export const maxDuration = 15; // Timeout massimo per Serverless Function

/**
 * Costruisce una configurazione IORedis blindata parsando in modo sicuro REDIS_URL.
 * Elimina spazi invisibili, virgolette residue e garantisce il supporto TLS/SNI per Upstash.
 */
function getSecureRedisConfig(): RedisOptions {
  const rawUrl = process.env.REDIS_URL?.trim().replace(/^["']|["']$/g, '');

  if (!rawUrl) {
    throw new Error("Variabile d'ambiente REDIS_URL mancante sul server.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("Formato REDIS_URL non valido. Deve iniziare con rediss:// o redis://");
  }

  const isTls = parsedUrl.protocol === 'rediss:' || parsedUrl.hostname.endsWith('.upstash.io');

  return {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 6379,
    username: decodeURIComponent(parsedUrl.username || 'default'),
    password: decodeURIComponent(parsedUrl.password),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: true,
    connectTimeout: 8000,
    family: 4, // Forza risoluzione DNS IPv4 (annienta gli errori ENOTFOUND su Vercel)
    retryStrategy(times) {
      if (times > 2) return null; // Fail-fast dopo 2 tentativi per non mandare Vercel in timeout
      return Math.min(times * 250, 1000);
    },
    ...(isTls && {
      tls: {
        rejectUnauthorized: false,
        servername: parsedUrl.hostname, // Obbligatorio per il routing SNI di Upstash
      },
    }),
  };
}

/**
 * Verifica sicura contro attacchi di Timing
 */
function isValidApiKey(provided: string, expected: string): boolean {
  const bufA = Buffer.from(provided);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  let redisClient: IORedis | null = null;
  let nurturingQueue: Queue | null = null;

  try {
    // 1. AUTENTICAZIONE E VALIDAZIONE TENANT
    const rawApiKey = req.headers.get("x-rls-api-key")?.trim();
    if (!rawApiKey || rawApiKey.length < 10) {
      return NextResponse.json(
        { success: false, message: "Accesso negato: API Key mancante o malformata." },
        { status: 401 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { apiKey: rawApiKey },
      select: { id: true, apiKey: true, name: true }
    });

    if (!tenant || !isValidApiKey(rawApiKey, tenant.apiKey)) {
      return NextResponse.json(
        { success: false, message: "Accesso negato: Credenziali Tenant non valide." },
        { status: 403 }
      );
    }

    // 2. RECUPERO SEQUENZA ATTIVA
    const sequence = await prisma.sequence.findFirst({
      where: {
        tenantId: tenant.id,
        name: "Promo Luce Fix - Scintilla Hub"
      },
      select: { id: true, isActive: true }
    });

    if (!sequence) {
      return NextResponse.json(
        { success: false, message: "Sequenza 'Promo Luce Fix - Scintilla Hub' non trovata." },
        { status: 404 }
      );
    }

    // 3. AGGANCIO NUOVI LEAD NEL DATABASE (PRIMA DI SVEGLIARE IL WORKER)
    const unenrolledLeads = await prisma.profile.findMany({
      where: {
        tenantId: tenant.id,
        status: { notIn: ['REJECTED', 'ANOMALO', 'QUALIFIED'] },
        sequenceStates: { none: { sequenceId: sequence.id } }
      },
      select: { id: true }
    });

    let enrolledCount = 0;

    if (unenrolledLeads.length > 0) {
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
      enrolledCount = result.count;
    }

    // 4. INNESCO SICURO SULLA CODA REDIS (CON CONNESSIONE ISOLATA)
    try {
      const redisConfig = getSecureRedisConfig();
      redisClient = new IORedis(redisConfig);

      // Silenzia crash non gestiti a livello di event emitter
      redisClient.on('error', (err) => {
        console.warn("⚠️ [Redis Socket Warning]:", err.message);
      });

      nurturingQueue = new Queue('nurturing-queue', { connection: redisClient });

      // Idempotenza a finestra di 15 secondi: evita inneschi multipli se si clicca due volte
      const deduplicationWindow = Math.floor(Date.now() / 15000);
      await nurturingQueue.add(
        'start-campaigns',
        {
          tenantId: tenant.id,
          sequenceId: sequence.id,
          triggeredAt: new Date().toISOString()
        },
        {
          jobId: `trigger-${tenant.id}-${deduplicationWindow}`,
          removeOnComplete: true,
          removeOnFail: 50
        }
      );
    } catch (redisError: any) {
      console.error("❌ [Redis Trigger Error]:", redisError.message);
      return NextResponse.json(
        {
          success: false,
          message: `Errore connessione Redis (${redisError.code || redisError.message}). Verifica REDIS_URL su Vercel.`
        },
        { status: 502 }
      );
    }

    // 5. RISPOSTA ESECUTIVA ALLA DASHBOARD
    return NextResponse.json(
      {
        success: true,
        count: enrolledCount,
        message: enrolledCount > 0
          ? `${enrolledCount} nuovi lead agganciati e Worker avviato con successo.`
          : "Motore di invio svegliato con successo (tutti i lead erano già in coda)."
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("❌ [Enroll API Fatal Error]:", error.message);
    return NextResponse.json(
      { success: false, message: "Errore interno del server durante l'innesco." },
      { status: 500 }
    );
  } finally {
    // 6. TEARDOWN OBBLIGATORIO: Chiude i socket per evitare saturazione su Upstash e Vercel
    if (nurturingQueue) {
      await nurturingQueue.close().catch(() => {});
    }
    if (redisClient) {
      await redisClient.quit().catch(() => {
        redisClient?.disconnect();
      });
    }
  }
}
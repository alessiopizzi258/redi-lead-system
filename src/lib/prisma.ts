import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const createPrismaClient = () => {
  let dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error("[Nexus Engine] DATABASE_URL mancante nel file .env.");
  }

  // 🛡️ Mantenimento crittografia militare forzata
  if (dbUrl.includes('sslmode=require')) {
    dbUrl = dbUrl.replace('sslmode=require', 'sslmode=verify-full');
  } else if (!dbUrl.includes('sslmode=')) {
    const separator = dbUrl.includes('?') ? '&' : '?';
    dbUrl = `${dbUrl}${separator}sslmode=verify-full`;
  }

  // Inizializzazione Pool e Driver Adapter per Prisma 7+
  const pool = new Pool({ connectionString: dbUrl });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter, // Connessione diretta iniettata
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
};

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
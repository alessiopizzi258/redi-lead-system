import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// 🛡️ Connessione diretta e blindata. Eliminato il Driver Adapter per superare la build Vercel
const prisma = new PrismaClient();

async function main() {
  const emailTest = "alessiopizzi258@gmail.com";

  // 1. Cerchiamo il Tenant creato dal seed
  const tenant = await prisma.tenant.findFirst({ where: { companyName: "Cosmea Studio Dentistico" } });
  if (!tenant) throw new Error("Tenant non trovato. Esegui prima il seed.");

  // 2. Creiamo o Attiviamo la Campagna
  const campaign = await prisma.campaign.upsert({
    where: { id: "campagna-test-1" }, // ID fisso per il test
    update: { status: "ACTIVE", dailyLimit: 50 },
    create: {
      id: "campagna-test-1",
      tenantId: tenant.id,
      name: "Campagna Riattivazione ARCH",
      status: "ACTIVE",
      dailyLimit: 50
    }
  });

  // 3. Reset del tuo Profilo per il primo invio
  await prisma.profile.update({
    where: { tenantId_email: { tenantId: tenant.id, email: emailTest } },
    data: { 
      lastContactedAt: null, // Forza l'invio immediato bypassando i filtri temporali
      segment: "Freddo"
    }
  });

  console.log("✅ Campagna ATTIVATA.");
  console.log(`✅ Profilo ${emailTest} pronto per il fuoco.`);
}

main().finally(() => prisma.$disconnect());
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("🚀 Inizializzazione Motore Nexus...");
  
  // Pulizia precauzionale
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: { 
      companyName: 'Design Lab Studio', // Brand aggiornato
      apiKey: 'Al3s6i024@' 
    }
  });

  const campaign = await prisma.campaign.create({
    data: { 
      name: 'Campagna Riattivazione ARCH', 
      status: 'ACTIVE', 
      tenantId: tenant.id 
    }
  });

  console.log(`✅ Sistema armato per Design Lab Studio.`);
  console.log(`📡 Tenant ID: ${tenant.id}`);
  console.log(`🎯 Campaign ID: ${campaign.id}`);
}

main()
  .catch((e) => { 
    console.error("❌ Errore durante il seed:", e); 
    process.exit(1); 
  })
  .finally(async () => { 
    await prisma.$disconnect(); 
  });
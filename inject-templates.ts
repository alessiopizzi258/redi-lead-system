import 'dotenv/config';
import { prisma } from './src/lib/prisma';

async function main() {
  console.log("⚡ Ricerca Tenant e Iniezione Flussi per Scintilla Hub...");

  // 1. Identifica il Tenant nel database usando 'companyName'
  let tenant = await prisma.tenant.findFirst({
    where: { companyName: { contains: "Scintilla" } }
  });

  if (!tenant) {
    console.log("⚠️ Tenant 'Scintilla' non trovato per companyName. Seleziono il primo Tenant attivo...");
    tenant = await prisma.tenant.findFirst();
  }

  if (!tenant) {
    console.error("❌ ERRORE FATALE: Nessun Tenant presente nel database. Creare prima un Tenant.");
    return;
  }

  console.log(`✅ Tenant agganciato: ${tenant.id}`);

  // 2. Creiamo la Sequenza padre collegandola obbligatoriamente al Tenant
  const sequence = await prisma.sequence.create({
    data: {
      name: "Promo Luce Fix - Scintilla Hub",
      tenant: { connect: { id: tenant.id } }
    }
  });
  console.log(`✅ Sequenza creata con ID: ${sequence.id}`);

  // 3. Strutturiamo i template conformi al 100% con lo schema (solo plainText)
  const templates = [
    {
      subject: "Bollette fuori controllo? Blocca il prezzo dell'energia oggi.",
      plainText: "Il mercato energetico è un campo minato. Le oscillazioni bruciano i tuoi margini di risparmio ogni singolo mese. Noi di Scintilla Energy disinneschiamo il rischio. Abbiamo appena aperto una finestra per la Luce Fix: tariffa monoraria bloccata a 0,119 €/kWh per i prossimi 24 mesi. Zero sorprese, zero rincari. L'offerta è attiva solo per pochi giorni. Scrivici subito su WhatsApp al +39 0883 360050 o passa in store in Via Giovanni Boccaccio, 51 a Barletta per blindare la tua fornitura.",
      stepNumber: 1,
      delayDays: 0,
      sequence: { connect: { id: sequence.id } }
    },
    {
      subject: "0,119 €/kWh per 24 mesi. Finestra in chiusura.",
      plainText: "Ti abbiamo riservato l'accesso alla nostra tariffa fissa a 0,119 €/kWh. Chi sceglie Luce Fix non subisce le fluttuazioni del mercato per 2 anni interi. I posti per questa promozione sono limitati e il tempo stringe. Basta un messaggio per tagliare i costi. Contattaci su WhatsApp al +39 0883 360050.",
      stepNumber: 2,
      delayDays: 1,
      sequence: { connect: { id: sequence.id } }
    },
    {
      subject: "Ultima chiamata: disinnesca il caro bollette.",
      plainText: "La promo Luce Fix sta per scadere. È l'ultima occasione per assicurarti l'energia a 0,119 €/kWh con prezzo bloccato fino al 2028. Non lasciare i tuoi soldi sul tavolo. Attiva la promo in 2 minuti su WhatsApp al +39 0883 360050 oppure passa direttamente in store in Via Giovanni Boccaccio, 51 a Barletta.",
      stepNumber: 3,
      delayDays: 3,
      sequence: { connect: { id: sequence.id } }
    }
  ];

  // 4. Iniezione massiva dei template
  for (const template of templates) {
    await prisma.emailTemplate.create({
      data: template
    });
    console.log(`✅ Template iniettato: Step ${template.stepNumber}`);
  }

  console.log("🚀 L'intero ecosistema di nurturing è operativo nel database!");
}

main()
  .catch((e) => {
    console.error("❌ Errore durante l'iniezione:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
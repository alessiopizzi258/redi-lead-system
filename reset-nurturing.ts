import 'dotenv/config';
import { prisma } from './src/lib/prisma';

async function main() {
  console.log("⚡ Eliminazione stati di sequenza...");
  const deleted = await prisma.leadSequenceState.deleteMany({});
  console.log(`✅ Reset completato: ${deleted.count} record cancellati. I lead sono liberi per un nuovo innesco.`);
}

main().finally(() => prisma.$disconnect());
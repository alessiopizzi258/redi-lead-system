import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as xlsx from 'xlsx';

export async function POST(req: NextRequest) {
  try {
    // 1. Autorizzazione (Da sostituire con la tua logica di sessione Auth)
    const tenantId = req.headers.get('x-tenant-id'); 
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized: Tenant ID mancante" }, { status: 401 });
    }

    // 2. Estrazione del file dal payload form-data
    const formData = await req.formData();
    const file = formData.get('file') as Blob | null;

    if (!file) {
      return NextResponse.json({ error: "Nessun file fornito" }, { status: 400 });
    }

    // 3. Lettura del file Excel direttamente in RAM (Zero disk I/O)
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let added = 0;
    let skipped = 0;

    // 4. Ingestion Massiva
    for (const row of data as any[]) {
      const email = row['EMAIL']?.toString().trim().toLowerCase();
      if (!email || !email.includes('@')) {
        skipped++;
        continue;
      }

      const fullName = row['NOME']?.toString().trim() || "Cliente Storico";
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || "";

      await prisma.profile.upsert({
        where: { tenantId_email: { tenantId, email } },
        update: {
          firstName,
          lastName,
          phone: row['TELEFONO']?.toString().trim(),
          source: row['ORIGINE LEAD']?.toString().trim(),
          problemDescription: row['NOTE LEAD']?.toString().trim()
        },
        create: {
          tenantId,
          email,
          firstName,
          lastName,
          phone: row['TELEFONO']?.toString().trim(),
          source: row['ORIGINE LEAD']?.toString().trim(),
          problemDescription: row['NOTE LEAD']?.toString().trim(),
          status: 'NURTURING', // Mappato direttamente per l'inseguimento
          isVerified: true
        }
      });
      added++;
    }

    return NextResponse.json({ success: true, added, skipped });

  } catch (error: any) {
    console.error("❌ [Upload API Error]:", error.message);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}
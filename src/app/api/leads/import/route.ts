import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as xlsx from 'xlsx';

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Scudo di Sicurezza: Allineato all'Ingestion standard
    const apiKey = req.headers.get("x-rls-api-key");
    if (!apiKey) return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });

    const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
    if (!tenant) return NextResponse.json({ success: false, message: "Credenziali Tenant non valide" }, { status: 403 });

    // 2. Estrazione File in RAM
    const formData = await req.formData();
    const file = formData.get('file') as Blob | null;

    if (!file) {
      return NextResponse.json({ success: false, message: "Nessun file fornito nel payload" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let added = 0;
    let skipped = 0;

    // 3. Ingestion Massiva per il Nurturing Storico
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
        where: { tenantId_email: { tenantId: tenant.id, email } },
        update: {
          firstName,
          lastName,
          phone: row['TELEFONO']?.toString().trim(),
          source: row['ORIGINE LEAD']?.toString().trim(),
          problemDescription: row['NOTE LEAD']?.toString().trim(),
          lastActivityAt: new Date()
        },
        create: {
          tenantId: tenant.id,
          email,
          firstName,
          lastName,
          phone: row['TELEFONO']?.toString().trim(),
          source: row['ORIGINE LEAD']?.toString().trim() || "Importazione_Storico",
          problemDescription: row['NOTE LEAD']?.toString().trim(),
          segment: "Dormiente",
          status: 'NURTURING', 
          icpScore: 0,
          isVerified: true,
          lastActivityAt: new Date()
        }
      });
      added++;
    }

    return NextResponse.json({ success: true, added, skipped, message: "Iniezione completata." }, { status: 200 });

  } catch (error: any) {
    console.error("❌ [Mass Import Error]:", error.message);
    return NextResponse.json({ success: false, message: "Errore interno del server" }, { status: 500 });
  }
}
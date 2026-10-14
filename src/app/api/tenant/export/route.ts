/**
 * @file src/app/api/tenant/export/route.ts
 * @description
 * Esporta il database isolato del cliente in formato CSV.
 * Protetto da Basic Auth. Risponde alla richiesta di ownership dei dati.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Sicurezza Basic Auth (Identica a middleware)
  const authHeader = req.headers.get('authorization');
  const expectedAuth = `Basic ${btoa(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`)}`;
  
  if (authHeader !== expectedAuth) {
    return new NextResponse('Non autorizzato', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tid");

  if (!tenantId) return new NextResponse("Tenant ID richiesto", { status: 400 });

  try {
    const profiles = await prisma.profile.findMany({
      where: { tenantId },
      select: { email: true, firstName: true, lastName: true, segment: true, totalRevenue: true, lastActivityAt: true }
    });

    // Costruzione manuale CSV ad alte prestazioni
    const headers = "Email,Nome,Cognome,Segmento_ARCH,Fatturato_Acquisito,Ultima_Attivita\n";
    const csvContent = profiles.map(p => 
      `${p.email},${p.firstName || ''},${p.lastName || ''},${p.segment},${p.totalRevenue || 0},${p.lastActivityAt?.toISOString() || ''}`
    ).join("\n");

    const fullCsv = headers + csvContent;

    return new NextResponse(fullCsv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="database_arch_${tenantId}.csv"`,
      }
    });
  } catch (error) {
    return new NextResponse("Errore di esportazione", { status: 500 });
  }
}
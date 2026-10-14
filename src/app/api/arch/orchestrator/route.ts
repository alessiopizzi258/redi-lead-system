import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RfmService } from "@/lib/services/rfmService";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const secret = process.env.CRON_SECRET || "Al3s6i024@"; 
    
    if (authHeader !== `Bearer ${secret}`) {
      console.warn("⚠️ [Orchestratore] Tentativo di accesso negato.");
      return NextResponse.json({ success: false, error: "Non autorizzato" }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "Tenant ID mancante." }, { status: 400 });
    }

    console.log(`⚙️ [Orchestratore] Avvio Sincronizzazione RFM Massiva per Tenant: ${tenantId}`);

    const profiles = await prisma.profile.findMany({
      where: {
        tenantId,
        segment: { not: "Bounced_Inattivo" } 
      }
    });

    let updatedCount = 0;

    for (const profile of profiles) {
      // Invochiamo il motore centrale che gestisce calcolo, db update e warming trigger
      await RfmService.syncProfileScore(profile.id);
      updatedCount++;
    }

    console.log(`✅ [Orchestratore] Completato. Profili riallineati: ${updatedCount}`);

    return NextResponse.json({ 
      success: true, 
      message: "Orchestrazione RFM completata con successo.",
      updatedCount 
    });

  } catch (error: any) {
    console.error("❌ [ORCHESTRATOR_ERROR]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
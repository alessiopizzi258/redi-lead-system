import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  try {
    // 1. Scudo di sicurezza: operazione consentita solo con API Key autorizzata
    const apiKey = req.headers.get("x-nexus-api-key");
    if (!apiKey) return NextResponse.json({ success: false, message: "Accesso negato." }, { status: 401 });

    const tenant = await prisma.tenant.findFirst({ where: { apiKey: apiKey } });
    if (!tenant) return NextResponse.json({ success: false, message: "Credenziali non valide." }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get("id");

    if (!profileId) {
      return NextResponse.json({ success: false, message: "ID Profilo mancante." }, { status: 400 });
    }

    // 2. Annientamento a cascata (Transazione Atomica)
    // È essenziale eliminare prima i record relazionali per evitare violazioni dei vincoli di chiave esterna.
    await prisma.$transaction([
      prisma.otpToken.deleteMany({ where: { profileId } }),
      prisma.webActivity.deleteMany({ where: { profileId } }),
      prisma.trackingEvent.deleteMany({ where: { profileId } }),
      prisma.automationLog.deleteMany({ where: { profileId } }),
      prisma.profile.delete({ where: { id: profileId, tenantId: tenant.id } })
    ]);

    console.log(`🗑️ [GDPR Compliance] Epurazione completata con successo per il profilo: ${profileId}`);

    return NextResponse.json({ 
      success: true, 
      message: "Oblio eseguito. Tutti i dati operativi e anagrafici sono stati distrutti." 
    }, { status: 200 });

  } catch (error: any) {
    console.error("❌ [GDPR Erase Error]:", error.message);
    return NextResponse.json({ success: false, message: "Impossibile completare l'operazione di cancellazione." }, { status: 500 });
  }
}
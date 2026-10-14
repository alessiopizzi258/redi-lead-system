import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RfmService } from "@/lib/services/rfmService";

export const dynamic = "force-dynamic";
export const revalidate = 0; // Disinnesco totale della cache

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

    console.log(`⚙️ [Orchestratore] Avvio Ricalcolo RFM Massivo per Tenant: ${tenantId}`);

    const profiles = await prisma.profile.findMany({
      where: {
        tenantId,
        segment: { not: "Bounced_Inattivo" } 
      }
    });

    let updatedCount = 0;

    for (const profile of profiles) {
      let r = 0, f = 0, m = 0, totalScore = 0;
      
      // 🛡️ BASTA ACROBAZIE TYPESCRIPT: Usiamo un tipo flessibile per non far crashare Vercel
      let segment: any = "Freddo";

      if (profile.contactCount === 0 && profile.totalRevenue === 0) {
        segment = "Freddo";
      } else {
        r = RfmService.calculateRecency(profile.lastActivityAt);
        f = RfmService.calculateFrequency(profile.contactCount);
        m = RfmService.calculateMonetary(profile.totalRevenue);
        totalScore = r + f + m;
        segment = RfmService.classifySegment(totalScore);
      }

      const archAngle = RfmService.pickAngle(segment, profile.email);

      await prisma.profile.update({
        where: { id: profile.id },
        data: { 
          recency: r, 
          frequency: f, 
          monetary: m, 
          segment, 
          arch_angle: archAngle 
        }
      });
      
      updatedCount++;
    }

    console.log(`✅ [Orchestratore] Completato. Profili allineati: ${updatedCount}`);

    return NextResponse.json({ 
      success: true, 
      message: "Orchestrazione ARCH completata con successo.",
      updatedCount 
    });

  } catch (error: any) {
    console.error("❌ [ORCHESTRATOR_ERROR]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
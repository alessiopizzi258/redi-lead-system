import { prisma } from "@/lib/prisma";
import { DeliveryService } from "@/lib/services/deliveryService"; // <-- Importa il delivery service
import { LeadStatus } from "@prisma/client";

export type RediSegment = "Freddo" | "Tiepido" | "Caldo" | "Urgente" | "Dormiente";

export class RfmService {
  // Pesi dinamici configurabili (Redi Method)
  private static WEIGHT_OPEN = 5;
  private static WEIGHT_CLICK = 15; // Aggiornato a 15 punti per la Direttiva 3

  public static calculateActiveScore(contactCount: number, totalClicks: number = 0, lastActivityAt: Date | null): number {
    let score = 0;
    score += (contactCount * this.WEIGHT_OPEN);
    score += (totalClicks * this.WEIGHT_CLICK);

    if (lastActivityAt) {
      const diffInDays = Math.floor((Date.now() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24));
      if (diffInDays <= 2) score += 15;
      else if (diffInDays <= 7) score += 10;
      else if (diffInDays <= 30) score += 5;
    }
    return score;
  }

  public static classifyRediSegment(totalScore: number): RediSegment {
    if (totalScore >= 101) return "Urgente";
    if (totalScore >= 60) return "Caldo"; // Soglia di attivazione a 60
    if (totalScore >= 31) return "Tiepido";
    if (totalScore > 0) return "Freddo";
    return "Dormiente"; 
  }

  /**
   * TRIGGER CENTRALE: Sincronizzazione Totale Punteggio e Promozione Lead
   */
  public static async syncProfileScore(profileId: string) {
    try {
      const profile = await prisma.profile.findUnique({
        where: { id: profileId }
      });

      if (!profile) return null;

      const activeScore = this.calculateActiveScore(
        profile.contactCount, 
        (profile as any).totalClicks || 0,
        profile.lastActivityAt
      );
      
      const passiveScore = (profile as any).passiveScore || 0;
      const coherenceScore = (profile as any).coherenceScore || 0;

      // 1. Fusione Matematica
      const integratedScore = activeScore + passiveScore + coherenceScore;
      const newSegment = this.classifyRediSegment(integratedScore);

      // 2. Logica di Promozione Automatica (Warming Trigger)
      let targetStatus = profile.status;
      let isNewlyQualified = false;

      // Se un lead in parcheggio supera la soglia termica dei 60 punti (diventando "Caldo" o "Urgente")
      if ((profile.status === LeadStatus.NURTURING || profile.status === LeadStatus.PENDING_VERIFICATION) && integratedScore >= 60) {
        targetStatus = LeadStatus.QUALIFIED;
        isNewlyQualified = true;
      }

      // 3. Salvataggio Chirurgico
      await prisma.profile.update({
        where: { id: profileId },
        data: {
          segment: newSegment,
          status: targetStatus,
          icpScore: integratedScore > profile.icpScore ? integratedScore : profile.icpScore // Protezione punteggio storico
        }
      });

      console.log(`🎯 [RFM Sync] Profilo ${profile.email} riallineato: ${integratedScore} pt. -> Segmento: ${newSegment}`);

      // 4. Innesco Commerciale
      if (isNewlyQualified) {
        console.log(`🔥 [Warming Trigger] Il lead ${profile.email} ha sfondato la soglia critica (${integratedScore} pt). Promosso a QUALIFIED.`);
        
        // Passiamo istantaneamente il lead "riscaldato" al venditore senza intermediari
        DeliveryService.sendLeadToTenant(profileId, profile.tenantId).catch(err => {
            console.error(`❌ [Warming Delivery Error] Fallimento notifica venditore per lead riscaldato:`, err.message);
        });
      }

      return { integratedScore, newSegment };

    } catch (error) {
      console.error(`❌ [RFM Sync Error] Impossibile ricalcolare score per ${profileId}:`, error);
      return null;
    }
  }
}
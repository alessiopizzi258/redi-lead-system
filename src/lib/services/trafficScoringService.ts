export class TrafficScoringService {
  /**
   * AREA 2: Qualità delle pagine visitate
   * Decodifica l'URL e assegna il peso specifico.
   */
  public static calculatePageScore(url: string): number {
    const u = url.toLowerCase();
    
    if (u.includes('contatti')) return 15;
    if (u.includes('pricing') || u.includes('prezzi') || u.includes('preventivo')) return 12;
    if (u.includes('case-study') || u.includes('portfolio') || u.includes('risultati')) return 7;
    if (u.includes('servizi') || u.includes('prodotti')) return 5;
    if (u.includes('chi-siamo') || u.includes('about')) return 3;
    
    // Homepage fallback
    if (u.endsWith('.com/') || u.endsWith('.it/') || u === '/') return 2;
    
    return 0; // Pagine non strategiche
  }

  /**
   * AREA 1: Qualità della visita (Tempo sul sito)
   * Calcola il delta bonus basato sull'incremento di durata rispetto al pulse precedente.
   */
  public static getDurationBonus(currentDuration: number, previousDuration: number): number {
    let deltaBonus = 0;
    
    // 45-90 secondi (+5)
    if (previousDuration < 45 && currentDuration >= 45) deltaBonus += 5;
    // 90-180 secondi (+10 totali, aggiungiamo il delta di 5)
    if (previousDuration < 90 && currentDuration >= 90) deltaBonus += 5;
    // > 3 minuti (+15 totali, aggiungiamo il delta di 5)
    if (previousDuration < 180 && currentDuration >= 180) deltaBonus += 5;
    
    return deltaBonus;
  }
}
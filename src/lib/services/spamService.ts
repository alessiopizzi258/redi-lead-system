/**
 * @file src/lib/services/spamService.ts
 * @description
 * Motore euristico di analisi Spam. Simula le regole di SpamAssassin analizzando
 * il payload HTML dell'email prima dell'invio. 
 * Se il punteggio > 3, l'email è rischiosa per la deliverability e viene bloccata.
 */

export class SpamService {
  public static calculateScore(subject: string, htmlBody: string): number {
    let score = 0;
    const bodyLower = htmlBody.toLowerCase();
    const subjectLower = subject.toLowerCase();

    // 1. Parole ad alto rischio Spam (Trigger Finanziari/Urgenza)
    const spamWords = ["gratis", "soldi", "guadagno", "urgente", "vincita", "offerta", "clicca qui"];
    spamWords.forEach(word => {
      if (bodyLower.includes(word)) score += 1.5;
      if (subjectLower.includes(word)) score += 2.0;
    });

    // 2. Abuso di formattazione (Maiuscole, Punteggiatura estrema)
    if ((subject.match(/[A-Z]/g)?.length || 0) > subject.length * 0.5) score += 2.0; // Oggetto 50% CAPS
    if (subject.includes('!!!') || subject.includes('???')) score += 1.5;

    // 3. Rapporto Immagini/Testo (Regola aurea della deliverability)
    const imageCount = (htmlBody.match(/<img/g) || []).length;
    const textLength = htmlBody.replace(/<[^>]*>?/gm, '').trim().length;
    
    if (imageCount > 0 && textLength < 100) {
      score += 2.5; // Molte immagini, poco testo = Filtro Promozioni garantito
    }

    // 4. Link Spam (Troppi link nel corpo disperdono la CTA)
    const linkCount = (htmlBody.match(/<a href/g) || []).length;
    if (linkCount > 3) score += 1.5;

    return parseFloat(score.toFixed(2));
  }
}
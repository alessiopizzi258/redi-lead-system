/**
 * @file src/lib/services/vaultService.ts
 * @description
 * Motore di generazione testuale potenziato da Claude (Anthropic). 
 * Applica rigorosamente le logiche di conversione violenta, Egoismo Strategico, 
 * e i framework PAS/BAB per il brand Paolucci Advisory. 
 */

import Anthropic from '@anthropic-ai/sdk';

export interface GeneratedContent {
  subject: string;
  email_body: string;
}

export interface EmailGenerationParams {
  nome: string;
  angolo: string;
  isProxy?: boolean;
  brandVoice?: string;
  profileId: string;
  tenantId: string;
  destinationUrl?: string; 
  timeInactive?: string;
  segment?: string;      
}

export class VaultService {
  // Inizializzazione protetta: previene il crash se la chiave manca nel .env
  private static anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || "chiave_mancante_bypass", 
  });

  private static ARCH_COPY_VAULT: Record<string, string> = {
    "Cambio di Prospettiva": `Per anni ho fatto la stessa cosa che fanno tutti... [TAG_LINK]`,
    "La domanda che nessuno si fa": `Mi sono fatto una domanda [TEMPO_TRASCORSO] fa... [TAG_LINK]`,
    "La storia breve": `Ho un collega, lavora in un settore diverso... [TAG_LINK]`,
    "Riconoscimento Diretto": `È passato [TEMPO_TRASCORSO] dall'ultima volta che ci siamo sentiti... [TAG_LINK]`,
    "Il cambio che giustifica il ritorno": `Circa [TEMPO_TRASCORSO] fa ho smesso di fare una cosa che facevo sempre... [TAG_LINK]`,
    "La domanda diretta": `Non ci sentiamo da [TEMPO_TRASCORSO]. Ha ancora senso per te ricevere le mie mail? [TAG_LINK]`,
    "Re-permission Onesta": `Sei tra i miei contatti da [TEMPO_TRASCORSO]... [TAG_LINK]`,
    "Valore prima di tutto": `Non mi presento perché ci siamo già incrociati... [TAG_LINK]`,
    "Punto di ingresso esterno": `Non ti scrivo da [TEMPO_TRASCORSO], ed ecco perché ti contatto oggi... [TAG_LINK]`
  };

  public static async generateEmailContent(params: EmailGenerationParams): Promise<GeneratedContent> {
    const { nome, angolo, profileId, tenantId, destinationUrl, timeInactive, segment } = params;
    
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://paolucciadvisory.com";
    const finalDestination = destinationUrl || "https://paolucciadvisory.com/libro-arch";
    const trackingLink = `${baseUrl}/api/track/click?uid=${profileId}&tid=${tenantId}&url=${encodeURIComponent(finalDestination)}`;

    const rawTemplate = this.ARCH_COPY_VAULT[angolo] || this.ARCH_COPY_VAULT["Cambio di Prospettiva"];
    const baseTemplate = rawTemplate.replace(/\[TEMPO_TRASCORSO\]/g, timeInactive || "molto tempo");
    
    const finalHtmlMock = `<p>Ciao ${nome || "Imprenditore"},</p><p>${baseTemplate.replace("[TAG_LINK]", `<a href="${trackingLink}" style="color: #d93025; font-weight: bold;">Accedi Ora</a>`)}</p>`;

    // SHIELD: Se non c'è la chiave reale, usa il fallback e non chiamare l'API
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "chiave_mancante_bypass") {
      console.warn("⚠️ [VaultService] ANTHROPIC_API_KEY mancante. Uso fallback statico.");
      return {
        subject: "I soldi fermi nel tuo database",
        email_body: finalHtmlMock
      };
    }

    const businessContext = "Paolucci Advisory";
    const productTarget = "Libro: 'Non ti servono nuovi clienti' (Up-sell implicito: Audit ARCH).";
    const userSegment = segment || "Freddo";
    const framework = (userSegment === "Freddo" || userSegment === "Dormiente") 
      ? "PAS (Problem-Agitate-Solve)" 
      : "BAB (Before-After-Bridge)";

    const systemPrompt = `CORE DIRECTIVE OVERRIDE: Sei "Massimo Paolucci", Marketing Strategist & Elite Copywriter.
Azienda: ${businessContext}. Prodotto: ${productTarget}. Destinatario: ${nome || "Imprenditore"}. Segmento RFM: ${userSegment}.

TESTO BASE:
"""
${baseTemplate}
"""

DIRETTIVA:
1. Egoismo Strategico e framework ${framework}. Disintegra obiezioni.
2. Ritmo: Paragrafi brevi. Usa <br><br>.
3. Alla fine usa ESATTAMENTE: "<a href='${trackingLink}'>Accedi Ora</a>".
Rispondi in JSON puro: { "subject": "...", "email_body": "..." }`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        temperature: 0.6,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Genera email' }]
      });

      let rawText = response.content.find(block => block.type === 'text')?.text || "{}";
      rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(rawText);

      return {
        subject: parsed.subject || "I soldi fermi nel tuo database",
        email_body: parsed.email_body || finalHtmlMock
      };
    } catch (error) {
      console.error("[VaultService] Errore Claude AI:", error);
      // Fallback finale in caso di timeout API
      return { subject: "Comunicazione Importante", email_body: finalHtmlMock };
    }
  }
}
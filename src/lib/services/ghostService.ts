import OpenAI from "openai";

export interface IntentData {
  hasIntent: boolean;
  topic?: string;
  confidenceScore?: number;
}

export interface GhostEmailContent {
  subject: string;
  email_body: string;
}

export class GhostService {
  private static aiClient = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });

  public static async analyzeIntentGraph(email: string): Promise<IntentData> {
    if (!email) return { hasIntent: false };

    const hash = email.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const confidenceScore = (hash % 100) / 100; 
    
    // Topic riallineati al target "Paolucci Advisory"
    const intentTopics = [
      "come aumentare i margini senza nuovi clienti",
      "calcolo gap di fatturato aziendale",
      "riattivazione database clienti b2b",
      "consulenza direzionale aumento profitti",
      "ottimizzazione costi acquisizione clienti"
    ];
    const detectedTopic = intentTopics[hash % intentTopics.length];

    if (confidenceScore > 0.75) {
      return {
        hasIntent: true,
        topic: detectedTopic,
        confidenceScore
      };
    }

    return { hasIntent: false };
  }

  public static async generateContextualEmail(
    nome: string, 
    intentTopic: string, 
    brandVoice: string
  ): Promise<GhostEmailContent> {
    
    const systemPrompt = `Sei un Elite Copywriter specializzato in riattivazione B2B.
Business: ${brandVoice || "Paolucci Advisory"}.
Destinatario: ${nome || "Imprenditore"}.

DATI DI INTENTO (SEGRETI):
Cerca soluzioni su: "${intentTopic}".

IL TUO COMPITO:
Aggancialo. NON svelare che lo stiamo tracciando. 

REGOLE DI SCRITTURA (TASSATIVE):
1. Paragrafi di massimo 1-2 frasi. 
2. Usa "Bucket Brigades" (es. "Il problema è questo:", "La verità:").
3. Usa il tag <strong> sulle parole chiave per lo skimming.
4. Tono: Da imprenditore a imprenditore. Nessuna fuffa. Autorevole e analitico.
5. Recency: Insight finale alla fine assoluta del testo.

FORMATO OUTPUT (SOLO JSON):
{
  "subject": "Oggetto atomico (max 6 parole)",
  "email_body": "Codice HTML puro. Usa SOLO <p> e <strong>."
}`;

    try {
      const completion = await this.aiClient.chat.completions.create({
        model: "deepseek-chat",
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0.4, 
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      return {
        subject: parsed.subject || "Una riflessione sui tuoi margini",
        email_body: parsed.email_body
      };

    } catch (error) {
      throw new Error("Generazione email fallita.");
    }
  }
}
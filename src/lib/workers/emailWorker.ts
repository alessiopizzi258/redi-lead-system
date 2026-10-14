import { Worker, Job } from 'bullmq';
import { prisma } from '../prisma';
import OpenAI from 'openai';
import IORedis from 'ioredis';

// Inizializzazione DeepSeek tramite SDK OpenAI
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const redisConnection = new IORedis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
  tls: {
    rejectUnauthorized: false // 🛡️ Patch obbligatoria per prevenire l'ECONNRESET su Windows/Node24
  }
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

console.log("⚙️ [DeepSeek Worker] Demone di generazione testuale HITL attivo...");

const worker = new Worker('email-queue', async (job: Job) => {
  const { profileId, tenantId, campaignId } = job.data;

  try {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId }
    });

    if (!profile) throw new Error(`Profilo ${profileId} inesistente.`);

    console.log(`🧠 [DeepSeek Worker] Ingegnerizzazione bozza HITL per: ${profile.email}`);

    // ==========================================================
    // NEURO-PROMPT ENGINEERING HIGH-TICKET (INBOX PRIMARIA GMAIL)
    // ==========================================================
    const systemPrompt = `Sei l'Head of Growth di "Design Lab Studio". Scrivi cold email B2B per fissare un check veloce.
Regole psicologiche e di deliverability fondamentali:
1. ANNULLA i convenevoli. Vietato iniziare con "Spero stia bene", "Mi chiamo", "Sono il responsabile di". Vai dritto al punto.
2. Identifica un'inefficienza visiva o di conversione basandoti sull'angolo fornito. Tono freddo, clinico, da pari a pari (C-Level).
3. Scrivi un blocco di massimo 3-4 frasi brevi. Massimo 70 parole totali. Deve sembrare un testo inviato rapidamente da iPhone.
4. Chiudi con una sola domanda secca, binaria e a frizione zero per aprire la conversazione.
5. Restituisci SOLO il testo pulito, usa esclusivamente i tag <br><br> per andare a capo. Nessun tag html, body o blocco di codice markdown (\`\`\`).`;

    const userPrompt = ` Sotto-angolo d'attacco: ${profile.arch_angle || 'Il design debole sta bruciando i tassi di conversione delle loro landing page'}.
Destinatario: ${profile.firstName || 'il responsabile'}.
Genera il corpo del messaggio.`;

    // Chiamata API per il testo dell'email
    const completion = await deepseek.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model: "deepseek-chat",
      temperature: 0.35, // Abbassato per garantire massima stabilità e aderenza ai vincoli di sintesi
      max_tokens: 150,
    });

    let generatedHtml = completion.choices[0].message.content?.trim() || "Errore di generazione testo.";
    
    // Pulizia radicale di eventuali sbavature o blocchi markdown restituiti dall'IA
    generatedHtml = generatedHtml
      .replace(/```html/gi, '')
      .replace(/```/gi, '')
      .replace(/^"|"$/g, '') // Rimuove eventuali virgolette esterne
      .trim();

    // 💉 INIEZIONE DEL DNA (SHADOW TRACKING LINK)
    let infectedBody = generatedHtml.replace(
      /href=["'](https?:\/\/(www\.)?[^"']*)["']/gi, 
      (match, url) => {
        const separator = url.includes('?') ? '&' : '?';
        return `href="${APP_URL}/api/tracking?url=${encodeURIComponent(url)}&uid=${profile.id}&tid=${tenantId}"`;
      }
    );

    // 🛡️ WRAPPER HTML ULTRA-LIGHT (Simula Plain Text per schivare la tab Promozioni)
    const finalHtml = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 15px; color: #111111; line-height: 1.5; max-width: 600px; margin: 0;">
  <div>${infectedBody}</div>
  <img src="${APP_URL}/api/tracking/open?uid=${profile.id}&tid=${tenantId}" width="1" height="1" style="display:none;" alt="" />
</body>
</html>`.trim();

    // Chiamata API per l'Oggetto dell'email (Ottimizzato per tassi di apertura interni)
    const subjectCompletion = await deepseek.chat.completions.create({
      messages: [
        { role: "system", content: "Sei un analista. Scrivi un oggetto per un'email interna. Massimo 2-4 parole, tutto minuscolo, nessuna punteggiatura, zero parole di vendita. Deve sembrare una nota veloce tra colleghi." },
        { role: "user", content: `Genera l'oggetto basandoti su questa email: ${generatedHtml}` }
      ],
      model: "deepseek-chat",
      temperature: 0.4,
      max_tokens: 30
    });

    let generatedSubject = subjectCompletion.choices[0].message.content?.trim() || "quick update";
    generatedSubject = generatedSubject.replace(/['"“”]/g, '').toLowerCase();

    // 📥 DELEGA IN QUARANTENA (HITL)
    // Salviamo lo stato come PENDING_APPROVAL. La dashboard HITL leggerà questo record.
    await prisma.automationLog.create({
      data: {
        tenantId,
        profileId,
        campaignId,
        emailAddress: profile.email,
        status: "PENDING_APPROVAL", 
        subject: generatedSubject,
        errorMessage: finalHtml, // Il codice HTML tracciato è stoccato qui dentro, pronto per la review manuale
      }
    });

    console.log(`📥 [HITL Queue] Bozza stoccata in attesa di approvazione per: ${profile.email}`);

  } catch (error: any) {
    console.error(`❌ [DeepSeek Worker ERROR] Fallimento sul lead ${profileId}:`, error.message);
    throw error;
  }
}, { connection: redisConnection });

worker.on('failed', (job, err) => {
  console.log(`⚠️ Job ${job?.id} fallito nel cluster. Motivo: ${err.message}`);
});
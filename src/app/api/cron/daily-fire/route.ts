import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Limite hardware Vercel Hobby

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nexus-engine-v1.vercel.app";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || "Al3s6i024@"}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ success: false, message: "Non autorizzato" }, { status: 401 });
  }

  try {
    // 1A. Estrazione degli ID già in coda HITL (per non processarli due volte)
    const pendingLogs = await prisma.automationLog.findMany({
      where: { status: "PENDING_APPROVAL" },
      select: { profileId: true }
    });
    const lockedProfileIds = pendingLogs.map(log => log.profileId);

    // 1B. Pesca 2 lead "vergini" ignorando quelli già in Quarantena
    const leads = await prisma.profile.findMany({
      where: { 
        lastContactedAt: null, 
        email: { not: "" },
        id: { notIn: lockedProfileIds } // Esclusione matematica chirurgica
      },
      take: 2,
      orderBy: { createdAt: 'asc' }
    });

    if (leads.length === 0) {
      return NextResponse.json({ success: true, message: "Nessun lead disponibile per la generazione." });
    }

    let processedCount = 0;

    // 2. Generazione Sincrona con DeepSeek
    for (const profile of leads) {
      console.log(`🧠 Ingegnerizzazione HITL per: ${profile.email}`);

      const systemPrompt = `Sei un Copywriter B2B di altissimo livello per "Design Lab Studio". Il tuo obiettivo è scrivere una cold email a un target C-Level (imprenditori/direttori) in Italia.
Regole inviolabili:
1. Professionalità Estrema: Inizia sempre con "Buongiorno [Nome]" o "Gentile [Nome]".
2. Tono: Autorevole, educato, consulenziale. Nessuna arroganza, niente toni da venditore aggressivo. Devi sembrare un professionista serio che ha notato un'inefficienza reale.
3. Struttura in 3 frasi: (A) Contesto rapido del perché scrivi, (B) Il problema specifico o l'opportunità non sfruttata, (C) Una Call to Action morbida e non invadente.
4. Sintesi: Massimo 60-80 parole. 
5. Nessuna vendita: Non stai vendendo un servizio, stai proponendo uno scambio di idee su un potenziale collo di bottiglia.
6. Restituisci SOLO il testo pulito, usa <br><br> per andare a capo. Nessun tag html o markdown.`;

      const userPrompt = `Scrivi il testo per: ${profile.firstName || 'Responsabile'}.
L'angolo strategico è: ${profile.arch_angle || 'Analisi dei tassi di conversione bloccati da un ecosistema visivo non performante'}.
Suggerisci delicatamente che un check sul loro attuale posizionamento visivo potrebbe sbloccare margini inespressi. Chiudi chiedendo se sono aperti a una breve chiacchierata esplorativa la prossima settimana.`;

      const completion = await deepseek.chat.completions.create({
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        model: "deepseek-chat",
        temperature: 0.35,
        max_tokens: 150,
      });

      let generatedHtml = completion.choices[0].message.content?.replace(/```html/gi, '').replace(/```/gi, '').replace(/^"|"$/g, '').trim() || "Errore AI.";

      // Iniezione tracciamento invisibile
      const infectedBody = generatedHtml.replace(
        /href=["'](https?:\/\/(www\.)?[^"']*)["']/gi, 
        (match, url) => `href="${APP_URL}/api/tracking?url=${encodeURIComponent(url)}&uid=${profile.id}&tid=${profile.tenantId}"`
      );

      const finalHtml = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size: 15px; color: #111111; line-height: 1.5; max-width: 600px; margin: 0;">
  <div>${infectedBody}</div>
  <img src="${APP_URL}/api/tracking/open?uid=${profile.id}&tid=${profile.tenantId}" width="1" height="1" style="display:none;" alt="" />
</body>
</html>`.trim();

      const subjectCompletion = await deepseek.chat.completions.create({
        messages: [
          { role: "system", content: "Scrivi un oggetto email interna. Max 3 parole, tutto minuscolo, zero punteggiatura." },
          { role: "user", content: `Testo: ${generatedHtml}` }
        ],
        model: "deepseek-chat",
        temperature: 0.4,
        max_tokens: 20
      });

      const generatedSubject = subjectCompletion.choices[0].message.content?.replace(/['"“”]/g, '').toLowerCase().trim() || "quick check";

      // 3. Transazione di salvataggio nel database
      await prisma.$transaction([
        prisma.automationLog.create({
          data: {
            tenantId: profile.tenantId,
            profileId: profile.id,
            emailAddress: profile.email,
            status: "PENDING_APPROVAL", 
            subject: generatedSubject,
            errorMessage: finalHtml, 
          }
        }),
        prisma.profile.update({
          where: { id: profile.id },
          data: { lastActivityAt: new Date() } // Sostituito lo "status" con un aggiornamento del timestamp di attività
        })
      ]);

      processedCount++;
    }

    return NextResponse.json({ success: true, message: `Generazione completata. ${processedCount} bozze pronte in Quarantena.` });

  } catch (error: any) {
    console.error("❌ Errore Daily Fire:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
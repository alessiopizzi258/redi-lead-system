import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';

export interface AIDecisionOutput {
  subject: string;
  bodyText: string;
  newStatus: 'NURTURING' | 'QUALIFIED' | 'REJECTED' | 'DA_VERIFICARE_MANUALMENTE';
  newSegment: 'Urgente' | 'Caldo' | 'Tiepido' | 'Freddo' | 'Squalificato';
  icpScoreDelta: number;
  nextDelayDays: number;
  stopSequence: boolean;
  qualificationSummary: string;
  financialClean: boolean | null;
  employmentType: string | null;
}

const ANGLE_FRAMEWORK: Record<number, string> = {
  1: 'HOOK DIRETTO E QUALIFICA: Presenta le opzioni migliori in base ai dati iniziali del lead e poni 1 domanda secca di pre-qualifica (es. P.IVA o Tempo Indeterminato / assenza segnalazioni).',
  2: 'VALORE ECONOMICO E ZERO PENSIERI: Confronta il costo certo e fisso rispetto alle spese impreviste. Chiedi riscontro rapido.',
  3: 'GESTIONE OBIEZIONI E FLESSIBILITÀ: Abbatti il freno dell’anticipo o dei vincoli illustrando la soluzione più snella del catalogo.',
  4: 'CASO STUDIO / PROVA SOCIALE: Mostra come clienti simili hanno risolto il problema in 48 ore.',
  5: 'URGENZA SLOT DISPONIBILI: Segnala l’esaurimento delle disponibilità in pronta consegna alle tariffe attuali.',
  6: 'DOMANDA SECCA A UNA RIGA: Chiedi direttamente se il progetto è ancora prioritario o se hanno già risolto.',
  7: 'BREAK-UP EMAIL: Comunica la chiusura definitiva della pratica salvo risposta immediata.'
};

export async function generateAutonomousStepOrReply(params: {
  tenantId: string;
  profileId: string;
  stepNumber: number;
  incomingReplyText?: string;
  fallbackSubject?: string;
  fallbackBody?: string;
}): Promise<AIDecisionOutput> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    include: { aiAgentConfig: true }
  });

  const profile = await prisma.profile.findUnique({
    where: { id: params.profileId },
    include: {
      aiMessages: { orderBy: { createdAt: 'asc' }, take: 14 },
      trackingEvents: { orderBy: { timestamp: 'desc' }, take: 10 }
    }
  });

  if (!tenant || !profile) {
    throw new Error('Tenant o Profile non trovato.');
  }

  const config = tenant.aiAgentConfig;
  const openAiKey = tenant.aiApiKey || process.env.OPENAI_API_KEY;
  const anthropicKey = tenant.aiApiKey || process.env.ANTHROPIC_API_KEY;

  if (!tenant.aiEnabled || (!openAiKey && !anthropicKey)) {
    return {
      subject: params.fallbackSubject || `Aggiornamento pratica - ${tenant.companyName}`,
      bodyText: params.fallbackBody || `Ciao ${profile.firstName || ''},\n\nrestiamo a disposizione per la tua richiesta.\n\nUn saluto,\n${tenant.companyName}`,
      newStatus: profile.status as any,
      newSegment: (profile.segment as any) || 'Tiepido',
      icpScoreDelta: 0,
      nextDelayDays: tenant.aiDefaultDelayDays || 2,
      stopSequence: false,
      qualificationSummary: profile.aiSummary || 'Fallback statico attivo.',
      financialClean: profile.financialClean ?? null,
      employmentType: profile.employmentType ?? null
    };
  }

  const angleInstruction = ANGLE_FRAMEWORK[params.stepNumber] || ANGLE_FRAMEWORK[6];

  const systemPrompt = `
Sei il motore decisionale e commerciale autonomo di "${tenant.companyName}" (Nome Agente: ${config?.agentName || tenant.companyName}).
Il tuo compito è gestire il nurturing e la qualifica dei lead via email in totale autonomia, senza mai sembrare un bot.

CONTESTO AZIENDALE E SETTORE:
${config?.industryContext || 'Servizi B2B/B2C ad alta conversione.'}

CATALOGO OFFERTE ATTIVE:
${config?.offerCatalog || 'Offerte personalizzate in base al profilo.'}

CRITERI OBBLIGATORI PER QUALIFICARE IL LEAD (STATO QUALIFIED):
${config?.qualificationCriteria || 'Interesse esplicito confermato, budget in linea, assenza di blocchi finanziari/CRIF, contratto solido o P.IVA attiva.'}

REGOLE DI SQUALIFICA IMMEDIATA (STATO REJECTED + stopSequence=true):
${config?.disqualifyingRules || 'Segnalazioni CRIF/Cattivo pagatore, disoccupato/senza garanzie, richiesta esplicita di non essere più contattato, rifiuto netto definitivo.'}

${config?.systemPromptOverride || ''}

DATI ATTUALI DEL LEAD:
- Nome: ${profile.firstName || ''} ${profile.lastName || ''}
- Email: ${profile.email}
- Telefono: ${profile.phone || 'Non fornito'}
- Tipo: ${profile.leadType}
- Note/Esigenza iniziale: ${profile.problemDescription || 'Non specificata'}
- Punteggio ICP attuale: ${profile.icpScore}
- Aperture/Click tracciati: ${profile.trackingEvents.length}

ISTRUZIONI OPERATIVE:
${
  params.incomingReplyText
    ? `IL LEAD HA APPENA RISPOSTO CON QUESTO TESTO:\n"""${params.incomingReplyText}"""\nAnalizza la risposta. Se dichiara di essere segnalato in CRIF, protestato, senza reddito o non interessato, imposta newStatus="REJECTED", newSegment="Squalificato", stopSequence=true e non inviare ulteriori offerte (bodyText vuoto "" se non serve replica, oppure un saluto cortese di chiusura). Se invece ha i requisiti e mostra interesse reale o chiede di essere chiamato, imposta newStatus="QUALIFIED", newSegment="Urgente", stopSequence=true e invia una mail breve di conferma presa in carico. Se fa domande o ha dubbi, rispondi in modo chirurgico e verifica i requisiti mancanti.`
    : `Questo è lo STEP PROATTIVO N° ${params.stepNumber}. Angolo strategico da applicare: ${angleInstruction}. Scrivi un'email in plain-text (niente markdown, niente asterischi, niente blocchi HTML), diretta, umana, persuasiva, massimo 130 parole.`
}

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido con questa esatta struttura:
{
  "subject": "Oggetto email naturale e diretto",
  "bodyText": "Testo email in plain text con ritorni a capo \\n",
  "newStatus": "NURTURING" | "QUALIFIED" | "REJECTED" | "DA_VERIFICARE_MANUALMENTE",
  "newSegment": "Urgente" | "Caldo" | "Tiepido" | "Freddo" | "Squalificato",
  "icpScoreDelta": numero_intero_tra_-100_e_+100,
  "nextDelayDays": numero_giorni_attesa_prossimo_step_tra_1_e_5,
  "stopSequence": boolean,
  "qualificationSummary": "Sintesi tecnica per il venditore umano",
  "financialClean": true | false | null,
  "employmentType": "stringa o null"
}`.trim();

  const historyText = profile.aiMessages
    .map(m => `[${m.role}] ${m.subject ? `(${m.subject}) ` : ''}${m.content}`)
    .join('\n---\n');

  const userPrompt = `STORICO CONVERSAZIONE:\n${historyText || 'Nessun messaggio precedente.'}\n\nGenera il JSON decisionale.`;

  let rawJson = '';

  if (tenant.aiProvider === 'ANTHROPIC' && anthropicKey) {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const res = await anthropic.messages.create({
      model: tenant.aiModel.includes('claude') ? tenant.aiModel : 'claude-3-5-sonnet-latest',
      max_tokens: 1024,
      temperature: config?.temperature ?? 0.4,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });
    const block = res.content[0];
    if (block.type === 'text') rawJson = block.text;
  } else {
    const openai = new OpenAI({ apiKey: openAiKey });
    const res = await openai.chat.completions.create({
      model: tenant.aiModel || 'gpt-4o-mini',
      temperature: config?.temperature ?? 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    rawJson = res.choices[0]?.message?.content || '{}';
  }

  const cleaned = rawJson.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned) as AIDecisionOutput;

  return {
    subject: parsed.subject || params.fallbackSubject || `Comunicazione da ${tenant.companyName}`,
    bodyText: parsed.bodyText ?? '',
    newStatus: parsed.newStatus || 'NURTURING',
    newSegment: parsed.newSegment || 'Tiepido',
    icpScoreDelta: Number(parsed.icpScoreDelta || 0),
    nextDelayDays: Math.max(1, Number(parsed.nextDelayDays || tenant.aiDefaultDelayDays || 2)),
    stopSequence: Boolean(parsed.stopSequence),
    qualificationSummary: parsed.qualificationSummary || '',
    financialClean: parsed.financialClean ?? null,
    employmentType: parsed.employmentType ?? null
  };
}
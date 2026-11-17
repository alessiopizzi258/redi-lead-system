export interface NativeGeneratedEmail {
  subject: string;
  html: string;
  plainText: string;
}

export interface CustomStepTemplate {
  stepNumber: number;
  delayDays: number;
  subject: string;
  bodyText: string;
}

export interface NativeEvaluationResult {
  status: 'QUALIFIED' | 'REJECTED' | 'NURTURING';
  segment: string;
  icpScoreDelta: number;
  reason: string;
  autoReplyHtml?: string;
}

export function getDefaultStepTemplates(): CustomStepTemplate[] {
  return [
    {
      stepNumber: 1,
      delayDays: 0,
      subject: '{nome}, riepilogo disponibilità e condizioni - {azienda}',
      bodyText: `Buongiorno {nome},

In merito alla tua richiesta per {contesto}, abbiamo verificato le disponibilità attuali:

{catalogo}

Requisiti standard per l'attivazione: {requisiti}

Rispondi direttamente a questa email indicandomi a quale opzione sei interessato e un recapito telefonico aggiornato per bloccare le condizioni.

Un cordiale saluto,
{firma}
{azienda}`
    },
    {
      stepNumber: 2,
      delayDays: 2,
      subject: 'Aggiornamento pratica per {nome} - {azienda}',
      bodyText: `Buongiorno {nome},

Ti scrivo un rapido promemoria perché stiamo chiudendo le assegnazioni della settimana e vorrei capire se mantenere attiva la tua priorità sulle nostre proposte:

{catalogo}

Se possiedi i requisiti richiesti ({requisiti}), rispondi con un "OK" e il tuo numero: ti contatteremo per l'istruttoria rapida senza impegno.

A presto,
{firma}
{azienda}`
    },
    {
      stepNumber: 3,
      delayDays: 2,
      subject: 'Verifica requisiti rapida - {azienda}',
      bodyText: `Ciao {nome},

Spesso chi valuta le nostre soluzioni ha un dubbio specifico su tempistiche o idoneità della pratica.

Ti confermo che per procedere ci basta verificare: {requisiti}.

Rispondi a questa mail se desideri ricevere il prospetto dettagliato o essere richiamato da un nostro consulente.

Un saluto,
{firma}
{azienda}`
    },
    {
      stepNumber: 4,
      delayDays: 3,
      subject: 'Chiusura dossier {nome} - Ultimo avviso disponibilità',
      bodyText: `Buongiorno {nome},

Non avendo ricevuto un tuo riscontro, sto per archiviare la tua richiesta per liberare le quote riservate a queste condizioni:

{catalogo}

Se sei ancora interessato, rispondi a questa email entro oggi così blocchiamo la tua posizione.

Cordiali saluti,
{firma}
{azienda}`
    }
  ];
}

export function renderTemplateWithVariables(
  rawSubject: string,
  rawBody: string,
  profile: { firstName?: string | null; lastName?: string | null; email: string },
  config: {
    companyName?: string;
    agentName?: string;
    industryContext?: string;
    offerCatalog?: string;
    qualificationCriteria?: string;
  }
): NativeGeneratedEmail {
  const firstName = profile.firstName?.trim() || 'Gentile Cliente';
  const agentName = config.agentName?.trim() || 'Reparto Commerciale';
  const companyName = config.companyName?.trim() || 'Studio Commerciale';
  const catalog = (config.offerCatalog || '').trim();
  const criteria = (config.qualificationCriteria || 'documentazione standard in regola').trim();
  const context = (config.industryContext || companyName).trim();

  const replaceVars = (str: string) =>
    str
      .replace(/\{nome\}/gi, firstName)
      .replace(/\{azienda\}/gi, companyName)
      .replace(/\{firma\}/gi, agentName)
      .replace(/\{contesto\}/gi, context)
      .replace(/\{requisiti\}/gi, criteria)
      .replace(/\{catalogo\}/gi, catalog);

  const finalSubject = replaceVars(rawSubject);
  const plainText = replaceVars(rawBody);

  const formattedCatalogHtml = catalog
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `<li style="margin-bottom:6px;">${line.trim()}</li>`)
    .join('');

  const catalogBoxHtml = formattedCatalogHtml
    ? `<ul style="background:#f8fafc;border-left:4px solid #059669;padding:14px 20px;margin:14px 0;list-style:none;">${formattedCatalogHtml}</ul>`
    : '';

  const htmlBodyWithCatalog = rawBody
    .replace(/\{nome\}/gi, `<strong>${firstName}</strong>`)
    .replace(/\{azienda\}/gi, `<strong>${companyName}</strong>`)
    .replace(/\{firma\}/gi, `<strong>${agentName}</strong>`)
    .replace(/\{contesto\}/gi, context)
    .replace(/\{requisiti\}/gi, `<strong>${criteria}</strong>`)
    .replace(/\{catalogo\}/gi, catalogBoxHtml)
    .replace(/\n/g, '<br/>');

  return {
    subject: finalSubject,
    plainText,
    html: `<div style="font-family:sans-serif;font-size:15px;color:#1e293b;line-height:1.6;">${htmlBodyWithCatalog}</div>`
  };
}

export function generateNativeStepEmail(
  stepIndex: number,
  profile: { firstName?: string | null; lastName?: string | null; email: string; problemDescription?: string | null },
  config: {
    companyName?: string;
    agentName?: string;
    industryContext?: string;
    offerCatalog?: string;
    qualificationCriteria?: string;
    customTemplates?: CustomStepTemplate[];
  }
): NativeGeneratedEmail {
  const templates =
    config.customTemplates && config.customTemplates.length > 0
      ? config.customTemplates
      : getDefaultStepTemplates();

  const chosen = templates[stepIndex % templates.length];
  return renderTemplateWithVariables(chosen.subject, chosen.bodyText, profile, config);
}

export function evaluateLeadReplyNative(
  rawBody: string,
  config: {
    companyName?: string;
    agentName?: string;
    qualificationCriteria?: string;
    disqualifyingRules?: string;
  }
): NativeEvaluationResult {
  const text = (rawBody || '').toLowerCase();

  const customDisqualifiers = (config.disqualifyingRules || '')
    .toLowerCase()
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 3);

  const defaultDisqualifiers = [
    'crif', 'segnalato', 'segnalazione', 'protestato', 'pignoramento',
    'cattivo pagatore', 'disoccupato', 'senza busta paga', 'non mi interessa',
    'non sono interessato', 'cancellatemi', 'toglietemi', 'rimuovetemi', 'spam'
  ];

  const allDisqualifiers = Array.from(new Set([...defaultDisqualifiers, ...customDisqualifiers]));

  for (const rule of allDisqualifiers) {
    if (rule && text.includes(rule)) {
      return {
        status: 'REJECTED',
        segment: 'Scartato (Regola Automatica)',
        icpScoreDelta: -50,
        reason: `Rilevato criterio bloccante: "${rule}"`
      };
    }
  }

  const positiveSignals = [
    'interessato', 'interessata', 'mi interessa', 'procediamo', 'chiamatemi',
    'contattatemi', 'numero', 'cellulare', 'telefono', 'preventivo',
    'tempo indeterminato', 'partita iva', 'p.iva', 'busta paga', 'disponibile', 'info', 'ok'
  ];

  const phoneRegex = /(\+39)?\s?3\d{2}[\s.-]?\d{6,7}/;
  const hasPhoneInBody = phoneRegex.test(text);

  let matchedPositives = 0;
  for (const kw of positiveSignals) {
    if (text.includes(kw)) matchedPositives++;
  }

  if (hasPhoneInBody || matchedPositives >= 1) {
    return {
      status: 'QUALIFIED',
      segment: 'Caldo / Pronto Vendita',
      icpScoreDelta: 45,
      reason: hasPhoneInBody
        ? 'Il lead ha risposto lasciando il numero di telefono.'
        : `Il lead ha risposto positivamente (${matchedPositives} segnali rilevati).`,
      autoReplyHtml: `
        <div style="font-family:sans-serif;font-size:15px;color:#1e293b;line-height:1.6;">
          <p>Perfetto, abbiamo registrato la tua risposta e assegnato priorità alla tua pratica.</p>
          <p>Un nostro responsabile ti contatterà a brevissimo per tutti i dettagli operativi.</p>
          <p>Un cordiale saluto,<br><strong>${config.agentName || 'Reparto Commerciale'}</strong></p>
        </div>
      `
    };
  }

  return {
    status: 'NURTURING',
    segment: 'Tiepido (Ha risposto)',
    icpScoreDelta: 15,
    reason: 'Risposta interlocutoria ricevuta, mantenuto in osservazione.'
  };
}
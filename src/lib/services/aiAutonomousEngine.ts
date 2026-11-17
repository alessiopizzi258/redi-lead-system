export interface NativeGeneratedEmail {
  subject: string;
  html: string;
}

export interface NativeEvaluationResult {
  status: 'QUALIFIED' | 'REJECTED' | 'NURTURING';
  segment: string;
  icpScoreDelta: number;
  reason: string;
  autoReplyHtml?: string;
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
  }
): NativeGeneratedEmail {
  const firstName = profile.firstName?.trim() || 'Gentile Cliente';
  const agentName = config.agentName?.trim() || 'Reparto Commerciale';
  const companyName = config.companyName?.trim() || 'Studio Commerciale';
  const catalog = (config.offerCatalog || '').trim();
  const criteria = (config.qualificationCriteria || '').trim();
  const context = (config.industryContext || '').trim();

  const formattedCatalog = catalog
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `<li style="margin-bottom: 6px;">${line.trim()}</li>`)
    .join('');

  const catalogBlock = formattedCatalog
    ? `<ul style="background:#f8fafc;border-left:4px solid #059669;padding:14px 20px;margin:16px 0;list-style:none;">${formattedCatalog}</ul>`
    : '';

  const steps: NativeGeneratedEmail[] = [
    {
      subject: `${firstName}, riepilogo disponibilità e condizioni - ${companyName}`,
      html: `
        <div style="font-family:sans-serif;font-size:15px;color:#1e293b;line-height:1.6;">
          <p>Buongiorno <strong>${firstName}</strong>,</p>
          <p>In merito alla tua richiesta per <strong>${context || companyName}</strong>, abbiamo verificato le disponibilità attuali.</p>
          ${catalogBlock}
          ${criteria ? `<p style="font-size:13px;color:#475569;"><strong>Requisiti standard per l'attivazione:</strong> ${criteria}</p>` : ''}
          <p>Rispondi direttamente a questa email indicandomi a quale opzione sei interessato e un recapito telefonico aggiornato per bloccare le condizioni.</p>
          <p>Un cordiale saluto,<br><strong>${agentName}</strong><br>${companyName}</p>
        </div>
      `
    },
    {
      subject: `Aggiornamento pratica per ${firstName} - ${companyName}`,
      html: `
        <div style="font-family:sans-serif;font-size:15px;color:#1e293b;line-height:1.6;">
          <p>Buongiorno <strong>${firstName}</strong>,</p>
          <p>Ti scrivo un rapido promemoria perché stiamo chiudendo le assegnazioni della settimana e vorrei capire se mantenere attiva la tua priorità.</p>
          ${catalogBlock}
          <p>Se possiedi i requisiti richiesti (${criteria || 'documentazione standard in regola'}), rispondi con un "OK" e il tuo numero: ti contatteremo per l'istruttoria rapida senza impegno.</p>
          <p>A presto,<br><strong>${agentName}</strong><br>${companyName}</p>
        </div>
      `
    },
    {
      subject: `Verifica requisiti rapida - ${companyName}`,
      html: `
        <div style="font-family:sans-serif;font-size:15px;color:#1e293b;line-height:1.6;">
          <p>Ciao <strong>${firstName}</strong>,</p>
          <p>Spesso chi valuta le nostre soluzioni ha un dubbio specifico su tempistiche o idoneità della pratica.</p>
          <p>Ti confermo che per procedere ci basta verificare: <strong>${criteria || 'i requisiti base di solvibilità'}</strong>.</p>
          <p>Rispondi a questa mail se desideri ricevere il prospetto dettagliato o essere richiamato da un nostro consulente.</p>
          <p>Un saluto,<br><strong>${agentName}</strong><br>${companyName}</p>
        </div>
      `
    },
    {
      subject: `Chiusura dossier ${firstName} - Ultimo avviso disponibilità`,
      html: `
        <div style="font-family:sans-serif;font-size:15px;color:#1e293b;line-height:1.6;">
          <p>Buongiorno <strong>${firstName}</strong>,</p>
          <p>Non avendo ricevuto un tuo riscontro, sto per archiviare la tua richiesta per liberare le quote riservate a queste condizioni:</p>
          ${catalogBlock}
          <p>Se sei ancora interessato, rispondi a questa email entro oggi così blocchiamo la tua posizione.</p>
          <p>Cordiali saluti,<br><strong>${agentName}</strong><br>${companyName}</p>
        </div>
      `
    }
  ];

  const selected = steps[stepIndex % steps.length];
  return selected;
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
    'crif',
    'segnalato',
    'segnalazione',
    'protestato',
    'pignoramento',
    'cattivo pagatore',
    'disoccupato',
    'senza busta paga',
    'non mi interessa',
    'non sono interessato',
    'cancellatemi',
    'toglietemi',
    'rimuovetemi',
    'spam',
    'non contattatemi'
  ];

  const allDisqualifiers = Array.from(new Set([...defaultDisqualifiers, ...customDisqualifiers]));

  for (const rule of allDisqualifiers) {
    if (rule && text.includes(rule)) {
      return {
        status: 'REJECTED',
        segment: 'Scartato (Regola Automatica)',
        icpScoreDelta: -50,
        reason: `Rilevato criterio bloccante nel testo: "${rule}"`
      };
    }
  }

  const positiveSignals = [
    'interessato',
    'interessata',
    'mi interessa',
    'procediamo',
    'chiamatemi',
    'contattatemi',
    'numero',
    'cellulare',
    'telefono',
    'preventivo',
    'tempo indeterminato',
    'partita iva',
    'p.iva',
    'busta paga',
    'disponibile',
    'info',
    'informazioni',
    'ok'
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
        : `Il lead ha risposto positivamente (${matchedPositives} segnali di acquisto rilevati).`,
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
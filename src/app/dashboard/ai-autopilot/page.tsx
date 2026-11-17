"use client";

import { useState, useEffect } from "react";

export default function OneClickAutopilotPage() {
  const [tenantId, setTenantId] = useState("");
  const [companyName, setCompanyName] = useState("Scintilla Hub");
  const [agentName, setAgentName] = useState("Team Scintilla Rent");

  const [senderProvider, setSenderProvider] = useState("GMAIL");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPassword, setSenderPassword] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(465);
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState(993);
  const [dailyLimit, setDailyLimit] = useState(90);

  const [maxAutonomousSteps, setMaxAutonomousSteps] = useState(4);
  const [defaultDelayDays, setDefaultDelayDays] = useState(2);

  const [industryContext, setIndustryContext] = useState(
    "Noleggio a Lungo Termine di autovetture nuove per privati con busta paga a tempo indeterminato e Partite IVA."
  );
  const [offerCatalog, setOfferCatalog] = useState(
    "Fiat 500 Hybrid Icon: 267€/mese + IVA (36 mesi, 30.000 km, anticipo 2.000€)\nFiat Grande Panda 1.2 100cv Icon: 269€/mese + IVA (48 mesi, 60.000 km, anticipo 2.000€)\nKia Stonic 1.0 T-GDI 100cv Urban: 310€/mese + IVA (ZERO ANTICIPO, 48 mesi, 100.000 km)\nRenault Twingo Evolution Urban: 305€/mese + IVA (48 mesi, 100.000 km, anticipo 2.500€)"
  );
  const [qualificationCriteria, setQualificationCriteria] = useState(
    "Contratto a Tempo Indeterminato oppure Partita IVA attiva da almeno 2 anni, assenza di segnalazioni CRIF, interesse per rata mensile tra 260€ e 400€."
  );
  const [disqualifyingRules, setDisqualifyingRules] = useState(
    "crif, segnalato, protestato, pignoramento, cattivo pagatore, disoccupato, senza busta paga, non interessa"
  );

  const [databaseFile, setDatabaseFile] = useState<File | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tenant/ai-config")
      .then(r => r.json())
      .then(data => {
        if (data?.tenantId) {
          setTenantId(data.tenantId);
          setCompanyName(data.companyName || "Scintilla Hub");
          setMaxAutonomousSteps(data.aiMaxAutonomousSteps || 4);
          setDefaultDelayDays(data.aiDefaultDelayDays || 2);
          if (data.config) {
            setAgentName(data.config.agentName || "Team Scintilla Rent");
            setIndustryContext(data.config.industryContext || industryContext);
            setOfferCatalog(data.config.offerCatalog || offerCatalog);
            setQualificationCriteria(data.config.qualificationCriteria || qualificationCriteria);
            setDisqualifyingRules(data.config.disqualifyingRules || disqualifyingRules);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLaunching(true);
    setResultMsg(null);
    setErrorMsg(null);

    try {
      const fd = new FormData();
      fd.append("tenantId", tenantId);
      fd.append("companyName", companyName);
      fd.append("agentName", agentName);
      fd.append("senderProvider", senderProvider);
      fd.append("senderEmail", senderEmail);
      fd.append("senderPassword", senderPassword);
      fd.append("smtpHost", smtpHost);
      fd.append("smtpPort", String(smtpPort));
      fd.append("imapHost", imapHost);
      fd.append("imapPort", String(imapPort));
      fd.append("dailyLimit", String(dailyLimit));
      fd.append("maxAutonomousSteps", String(maxAutonomousSteps));
      fd.append("defaultDelayDays", String(defaultDelayDays));
      fd.append("industryContext", industryContext);
      fd.append("offerCatalog", offerCatalog);
      fd.append("qualificationCriteria", qualificationCriteria);
      fd.append("disqualifyingRules", disqualifyingRules);

      if (databaseFile) {
        fd.append("databaseFile", databaseFile);
      }

      const res = await fetch("/api/tenant/one-click-launch", {
        method: "POST",
        body: fd
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante l'avvio.");
      } else {
        setTenantId(data.tenantId);
        setResultMsg(
          `MOTORE NATIVO AVVIATO: ${data.importedLeadsCount} contatti caricati, ${data.enrolledLeadsCount} inseriti in coda e worker attivato.`
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Errore di rete.");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-8 bg-white text-slate-900">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Console One-Click Autopilot Nativo</h1>
          <p className="text-xs text-slate-500 mt-1">
            1. Carica Database • 2. Imposta Email (Gmail/Dominio) • 3. Inserisci Cosa Vendono • 4. Clicca OK
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/tenant/leads/export?tenantId=${tenantId}&minScore=31&onlyClean=true`}
            className="px-4 py-2.5 bg-slate-900 text-white text-xs font-bold uppercase rounded"
          >
            Esporta CSV Qualificati/Caldi
          </a>
        </div>
      </div>

      <form onSubmit={handleLaunch} className="space-y-8">
        <div className="p-6 border border-slate-200 rounded-lg bg-slate-50/50 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700">
            1. Carica Database Contatti (.CSV o .XLSX)
          </h2>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={e => setDatabaseFile(e.target.files?.[0] || null)}
            className="w-full text-sm file:mr-4 file:py-2.5 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:uppercase file:bg-emerald-600 file:text-white hover:file:bg-emerald-700"
          />
        </div>

        <div className="p-6 border border-slate-200 rounded-lg bg-slate-50/50 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700">
            2. Imposta Email Mittente & Lettura Risposte (Gmail o Dominio)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Tipo Casella</label>
              <select
                value={senderProvider}
                onChange={e => {
                  const val = e.target.value;
                  setSenderProvider(val);
                  if (val === "GMAIL") {
                    setSmtpHost("smtp.gmail.com");
                    setSmtpPort(465);
                    setImapHost("imap.gmail.com");
                    setImapPort(993);
                  }
                }}
                className="w-full border p-2.5 rounded text-sm bg-white"
              >
                <option value="GMAIL">Gmail (App Password)</option>
                <option value="CUSTOM">Dominio Custom (SMTP/IMAP)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase mb-1">Indirizzo Email</label>
              <input
                type="email"
                placeholder="info@azienda.it"
                value={senderEmail}
                onChange={e => setSenderEmail(e.target.value)}
                className="w-full border p-2.5 rounded text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase mb-1">App Password / Password</label>
              <input
                type="password"
                placeholder="xxxx xxxx xxxx xxxx"
                value={senderPassword}
                onChange={e => setSenderPassword(e.target.value)}
                className="w-full border p-2.5 rounded text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase mb-1">Limite Invii Giornaliero</label>
              <input
                type="number"
                value={dailyLimit}
                onChange={e => setDailyLimit(Number(e.target.value))}
                className="w-full border p-2.5 rounded text-sm bg-white"
              />
            </div>
          </div>

          {senderProvider === "CUSTOM" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={e => setSmtpHost(e.target.value)}
                  className="w-full border p-2.5 rounded text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">SMTP Port</label>
                <input
                  type="number"
                  value={smtpPort}
                  onChange={e => setSmtpPort(Number(e.target.value))}
                  className="w-full border p-2.5 rounded text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">IMAP Host</label>
                <input
                  type="text"
                  value={imapHost}
                  onChange={e => setImapHost(e.target.value)}
                  className="w-full border p-2.5 rounded text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">IMAP Port</label>
                <input
                  type="number"
                  value={imapPort}
                  onChange={e => setImapPort(Number(e.target.value))}
                  className="w-full border p-2.5 rounded text-sm bg-white"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border border-slate-200 rounded-lg bg-slate-50/50 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700">
            3. Inserisci Cosa Vendono, Prezzi e Regole di Filtro Automatico
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Nome Azienda</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                className="w-full border p-2.5 rounded text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Firma Mittente</label>
              <input
                type="text"
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                className="w-full border p-2.5 rounded text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Numero Step Sequenza</label>
              <input
                type="number"
                value={maxAutonomousSteps}
                onChange={e => setMaxAutonomousSteps(Number(e.target.value))}
                className="w-full border p-2.5 rounded text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Giorni di Attesa tra Step</label>
              <input
                type="number"
                value={defaultDelayDays}
                onChange={e => setDefaultDelayDays(Number(e.target.value))}
                className="w-full border p-2.5 rounded text-sm bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1">Cosa Vendono (Descrizione Servizio/Prodotto)</label>
            <textarea
              rows={2}
              value={industryContext}
              onChange={e => setIndustryContext(e.target.value)}
              className="w-full border p-2.5 rounded text-sm bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1">Catalogo Offerte e Prezzi (1 per riga)</label>
            <textarea
              rows={4}
              value={offerCatalog}
              onChange={e => setOfferCatalog(e.target.value)}
              className="w-full border p-2.5 rounded text-sm font-mono bg-white"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase mb-1 text-emerald-700">
                Requisiti Richiesti (Mostrati nelle email)
              </label>
              <textarea
                rows={3}
                value={qualificationCriteria}
                onChange={e => setQualificationCriteria(e.target.value)}
                className="w-full border border-emerald-300 p-2.5 rounded text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1 text-red-700">
                Parole Chiave di Scarto Automatico (separate da virgola)
              </label>
              <textarea
                rows={3}
                value={disqualifyingRules}
                onChange={e => setDisqualifyingRules(e.target.value)}
                className="w-full border border-red-300 p-2.5 rounded text-sm bg-white"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLaunching}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold uppercase tracking-widest rounded-lg shadow-lg disabled:opacity-50"
        >
          {isLaunching ? "Avvio in corso..." : "OK — CARICA DATABASE E AVVIA TUTTO IN AUTOMATICO"}
        </button>

        {resultMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold uppercase tracking-wide rounded text-center">
            {resultMsg}
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-300 text-red-700 text-xs font-bold uppercase tracking-wide rounded text-center">
            {errorMsg}
          </div>
        )}
      </form>
    </div>
  );
}
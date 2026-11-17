"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function TenantAutopilotWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlTenantId = searchParams.get("tenantId") || "";

  const [allTenants, setAllTenants] = useState<Array<{ id: string; companyName: string }>>([]);
  const [tenantId, setTenantId] = useState(urlTenantId);
  const [companyName, setCompanyName] = useState("");
  const [agentName, setAgentName] = useState("");

  const [stats, setStats] = useState({
    totalLeads: 0,
    qualifiedLeads: 0,
    nurturingLeads: 0,
    rejectedLeads: 0
  });

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

  const [industryContext, setIndustryContext] = useState("");
  const [offerCatalog, setOfferCatalog] = useState("");
  const [qualificationCriteria, setQualificationCriteria] = useState("");
  const [disqualifyingRules, setDisqualifyingRules] = useState("");

  const [databaseFile, setDatabaseFile] = useState<File | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadTenantDetails = async (targetId: string) => {
    if (!targetId) return;
    try {
      const res = await fetch(`/api/master/tenants?tenantId=${targetId}`);
      const data = await res.json();
      if (data?.tenant) {
        const t = data.tenant;
        setTenantId(t.id);
        setCompanyName(t.companyName || "");
        setMaxAutonomousSteps(t.aiMaxAutonomousSteps || 4);
        setDefaultDelayDays(t.aiDefaultDelayDays || 2);

        const cfg = t.aiAgentConfig;
        setAgentName(cfg?.agentName || `Team ${t.companyName}`);
        setIndustryContext(cfg?.industryContext || "");
        setOfferCatalog(cfg?.offerCatalog || "");
        setQualificationCriteria(cfg?.qualificationCriteria || "");
        setDisqualifyingRules(
          cfg?.disqualifyingRules || "crif, segnalato, protestato, pignoramento, disoccupato, non interessa"
        );

        const sender = t.gmailSenders?.[0];
        if (sender) {
          setSenderProvider(sender.provider || "GMAIL");
          setSenderEmail(sender.email || "");
          setSenderPassword(sender.appPassword || "");
          setSmtpHost(sender.smtpHost || "smtp.gmail.com");
          setSmtpPort(sender.smtpPort || 465);
          setImapHost(sender.imapHost || "imap.gmail.com");
          setImapPort(sender.imapPort || 993);
          setDailyLimit(sender.dailyLimit || 90);
        } else {
          setSenderEmail("");
          setSenderPassword("");
        }

        if (data.stats) setStats(data.stats);
      }
    } catch {}
  };

  useEffect(() => {
    fetch("/api/master/tenants")
      .then(r => r.json())
      .then(data => {
        const list = data.tenants || [];
        setAllTenants(list);
        const initialId = urlTenantId || list[0]?.id || "";
        if (initialId) {
          loadTenantDetails(initialId);
        }
      })
      .catch(() => {});
  }, [urlTenantId]);

  const handleSwitchTenant = (newId: string) => {
    setResultMsg(null);
    setErrorMsg(null);
    router.push(`/dashboard/ai-autopilot?tenantId=${newId}`);
    loadTenantDetails(newId);
  };

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
        await loadTenantDetails(data.tenantId);
        setResultMsg(
          `AZIENDA "${companyName.toUpperCase()}" AVVIATA: ${data.importedLeadsCount} contatti caricati, ${data.enrolledLeadsCount} attivati nel motore automatico.`
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Errore di rete.");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 bg-white text-slate-900">
      {/* Barra Superiore Multi-Azienda */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/master"
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold uppercase rounded"
          >
            ← Tutte le Aziende (/master)
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Dashboard Azienda: <span className="text-emerald-700">{companyName || "Seleziona"}</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={tenantId}
            onChange={e => handleSwitchTenant(e.target.value)}
            className="border border-slate-300 rounded px-3 py-2 text-xs font-bold uppercase bg-white"
          >
            {allTenants.map(t => (
              <option key={t.id} value={t.id}>
                Azienda: {t.companyName}
              </option>
            ))}
          </select>

          <a
            href={`/api/tenant/leads/export?tenantId=${tenantId}&minScore=31&onlyClean=true`}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase rounded shrink-0"
          >
            Esporta Caldi CSV
          </a>
        </div>
      </div>

      {/* KPI real-time specifici di questa Azienda */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-4 bg-slate-50 border rounded-lg">
          <div className="text-2xl font-bold">{stats.totalLeads}</div>
          <div className="text-xs font-bold uppercase text-slate-500">Contatti Caricati</div>
        </div>
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="text-2xl font-bold text-emerald-700">{stats.qualifiedLeads}</div>
          <div className="text-xs font-bold uppercase text-emerald-700">Qualificati / Pronti Vendita</div>
        </div>
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-2xl font-bold text-blue-700">{stats.nurturingLeads}</div>
          <div className="text-xs font-bold uppercase text-blue-700">In Lavorazione Automatica</div>
        </div>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-2xl font-bold text-red-700">{stats.rejectedLeads}</div>
          <div className="text-xs font-bold uppercase text-red-700">Scartati / Bounce / CRIF</div>
        </div>
      </div>

      <form onSubmit={handleLaunch} className="space-y-8">
        <div className="p-6 border border-slate-200 rounded-lg bg-slate-50/50 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700">
            1. Carica Database Contatti per {companyName} (.CSV o .XLSX)
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
            2. Email Dedicata dell&apos;Azienda (Gmail o Dominio Custom)
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
                placeholder="commerciale@azienda.it"
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
            3. Cosa Vende {companyName}, Catalogo Offerte e Filtri
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
              <label className="block text-xs font-bold uppercase mb-1">Firma Mittente Email</label>
              <input
                type="text"
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                className="w-full border p-2.5 rounded text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Step Sequenza</label>
              <input
                type="number"
                value={maxAutonomousSteps}
                onChange={e => setMaxAutonomousSteps(Number(e.target.value))}
                className="w-full border p-2.5 rounded text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Giorni tra Email</label>
              <input
                type="number"
                value={defaultDelayDays}
                onChange={e => setDefaultDelayDays(Number(e.target.value))}
                className="w-full border p-2.5 rounded text-sm bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1">Cosa Vendono (Settore e Proposta)</label>
            <textarea
              rows={2}
              value={industryContext}
              onChange={e => setIndustryContext(e.target.value)}
              className="w-full border p-2.5 rounded text-sm bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1">Catalogo Offerte / Prezzi di questa Azienda (1 per riga)</label>
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
                Requisiti Richiesti al Cliente
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
          {isLaunching
            ? "Salvataggio e Avvio in corso..."
            : `OK — SALVA E AVVIA IL MOTore PER ${companyName.toUpperCase() || "QUESTA AZIENDA"}`}
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

export default function OneClickAutopilotPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm">Caricamento console azienda...</div>}>
      <TenantAutopilotWorkspace />
    </Suspense>
  );
}
"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function TenantAutopilotWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlTenantId = searchParams.get("tenantId") || "";

  const [activeTab, setActiveTab] = useState<"SETUP" | "MONITOR" | "LEADS" | "REPLIES">("SETUP");
  const [allTenants, setAllTenants] = useState<Array<{ id: string; companyName: string }>>([]);
  const [tenantId, setTenantId] = useState(urlTenantId);
  const [companyName, setCompanyName] = useState("");
  const [agentName, setAgentName] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [stats, setStats] = useState({
    totalLeads: 0,
    qualifiedLeads: 0,
    nurturingLeads: 0,
    rejectedLeads: 0,
    activeQueueCount: 0,
    completedQueueCount: 0,
    sentLogsCount: 0,
    bouncedLogsCount: 0
  });

  const [senderStatus, setSenderStatus] = useState<{
    sentToday: number;
    dailyLimit: number;
    lastSentAt: string | null;
    isActive: boolean;
    errorLog: string | null;
  }>({
    sentToday: 0,
    dailyLimit: 90,
    lastSentAt: null,
    isActive: false,
    errorLog: null
  });

  const [profiles, setProfiles] = useState<any[]>([]);
  const [outboundLogs, setOutboundLogs] = useState<any[]>([]);
  const [sequenceQueue, setSequenceQueue] = useState<any[]>([]);
  const [replies, setReplies] = useState<any[]>([]);
  const [leadFilter, setLeadFilter] = useState<"ALL" | "QUALIFIED" | "NURTURING" | "REJECTED">("ALL");
  const [logFilter, setLogFilter] = useState<"ALL" | "SENT" | "BOUNCED">("ALL");

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

  const loadTenantDetails = async (targetId: string, silent = false) => {
    if (!targetId) return;
    try {
      const res = await fetch(`/api/master/tenants?tenantId=${targetId}`);
      const data = await res.json();
      if (data?.tenant) {
        const t = data.tenant;
        setTenantId(t.id);

        if (!silent) {
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
        }

        const primarySender = t.gmailSenders?.[0];
        setSenderStatus({
          sentToday: primarySender?.sentToday || 0,
          dailyLimit: primarySender?.dailyLimit || 90,
          lastSentAt: primarySender?.lastSentAt || null,
          isActive: primarySender?.isActive ?? false,
          errorLog: primarySender?.errorLog || null
        });

        if (data.stats) setStats(data.stats);
        setProfiles(data.profiles || []);
        setOutboundLogs(data.outboundLogs || []);
        setSequenceQueue(data.sequenceQueue || []);
        setReplies(data.replies || []);
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
          loadTenantDetails(initialId, false);
        }
      })
      .catch(() => {});
  }, [urlTenantId]);

  // Telemetria Live: aggiorna automaticamente log e contatori ogni 15 secondi
  useEffect(() => {
    if (!autoRefresh || !tenantId) return;
    const timer = setInterval(() => {
      loadTenantDetails(tenantId, true);
    }, 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, tenantId]);

  const handleSwitchTenant = (newId: string) => {
    setResultMsg(null);
    setErrorMsg(null);
    router.push(`/dashboard/ai-autopilot?tenantId=${newId}`);
    loadTenantDetails(newId, false);
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
        await loadTenantDetails(data.tenantId, false);
        setResultMsg(
          `AZIENDA "${companyName.toUpperCase()}" AVVIATA: ${data.importedLeadsCount} contatti caricati, ${data.enrolledLeadsCount} in coda automatica.`
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Errore di rete.");
    } finally {
      setIsLaunching(false);
    }
  };

  const filteredProfiles = profiles.filter(p => {
    if (leadFilter === "ALL") return true;
    if (leadFilter === "QUALIFIED") return p.status === "QUALIFIED";
    if (leadFilter === "NURTURING") return p.status === "NURTURING";
    if (leadFilter === "REJECTED") return p.status === "REJECTED" || p.status === "ANOMALO";
    return true;
  });

  const filteredLogs = outboundLogs.filter(l => {
    if (logFilter === "ALL") return true;
    if (logFilter === "SENT") return l.status === "SENT" || l.status === "OPENED";
    if (logFilter === "BOUNCED") return l.status === "BOUNCED";
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white text-slate-900 min-h-screen">
      {/* Barra Superiore Azienda & Controlli Live */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/master"
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase rounded"
          >
            ← Tutte le Aziende (/master)
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                Azienda Pilota Isolata
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Worker Attivo
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{companyName || "Seleziona Azienda"}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tenantId}
            onChange={e => handleSwitchTenant(e.target.value)}
            className="border border-slate-300 rounded px-3 py-2 text-xs font-bold uppercase bg-slate-50"
          >
            {allTenants.map(t => (
              <option key={t.id} value={t.id}>
                Azienda: {t.companyName}
              </option>
            ))}
          </select>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 text-xs font-bold uppercase rounded border ${
              autoRefresh
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-slate-100 border-slate-300 text-slate-600"
            }`}
          >
            {autoRefresh ? "Live Refresh: ON (15s)" : "Live Refresh: OFF"}
          </button>

          <button
            onClick={() => loadTenantDetails(tenantId, true)}
            className="px-3 py-2 border border-slate-300 hover:bg-slate-100 text-xs font-bold uppercase rounded"
          >
            Aggiorna Ora ↻
          </button>

          <a
            href={`/api/tenant/leads/export?tenantId=${tenantId}&minScore=31&onlyClean=true`}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase rounded"
          >
            Esporta CSV Qualificati
          </a>
        </div>
      </div>

      {/* Telemetria Operativa Real-Time dell'Azienda */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <div className="p-3.5 bg-slate-50 border rounded-lg">
          <div className="text-xl font-bold">{stats.totalLeads}</div>
          <div className="text-[10px] font-bold uppercase text-slate-500">Contatti Totali</div>
        </div>
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-xl font-bold text-amber-700">{stats.activeQueueCount}</div>
          <div className="text-[10px] font-bold uppercase text-amber-700">In Coda Attiva</div>
        </div>
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-xl font-bold text-blue-700">
            {senderStatus.sentToday}/{senderStatus.dailyLimit}
          </div>
          <div className="text-[10px] font-bold uppercase text-blue-700">Invii Oggi (Tot: {stats.sentLogsCount})</div>
        </div>
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="text-xl font-bold text-emerald-700">{stats.qualifiedLeads}</div>
          <div className="text-[10px] font-bold uppercase text-emerald-700">Qualificati / Caldi</div>
        </div>
        <div className="p-3.5 bg-slate-100 border border-slate-300 rounded-lg">
          <div className="text-xl font-bold text-slate-700">{stats.completedQueueCount}</div>
          <div className="text-[10px] font-bold uppercase text-slate-600">Cicli Completati</div>
        </div>
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-xl font-bold text-red-700">
            {stats.rejectedLeads} <span className="text-xs font-normal">({stats.bouncedLogsCount} bounce)</span>
          </div>
          <div className="text-[10px] font-bold uppercase text-red-700">Scartati / Bloccati</div>
        </div>
      </div>

      {/* Menu Sezioni */}
      <div className="flex flex-wrap gap-2 border-b pb-3 mb-6">
        <button
          onClick={() => setActiveTab("SETUP")}
          className={`px-4 py-2 text-xs font-bold uppercase rounded ${
            activeTab === "SETUP" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          1. Setup One-Click & Offerte
        </button>
        <button
          onClick={() => setActiveTab("MONITOR")}
          className={`px-4 py-2 text-xs font-bold uppercase rounded ${
            activeTab === "MONITOR" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          2. Monitor Live: Cosa Sta Facendo, Coda & Log ({outboundLogs.length})
        </button>
        <button
          onClick={() => setActiveTab("LEADS")}
          className={`px-4 py-2 text-xs font-bold uppercase rounded ${
            activeTab === "LEADS" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          3. Database Contatti ({stats.totalLeads})
        </button>
        <button
          onClick={() => setActiveTab("REPLIES")}
          className={`px-4 py-2 text-xs font-bold uppercase rounded ${
            activeTab === "REPLIES" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          4. Risposte Ricevute ({replies.length})
        </button>
      </div>

      {/* TAB 1: CONFIGURAZIONE ONE-CLICK */}
      {activeTab === "SETUP" && (
        <form onSubmit={handleLaunch} className="space-y-6">
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
              2. Imposta Casella Email di {companyName} (Gmail o Dominio Custom)
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
              3. Cosa Vende {companyName}, Catalogo Prezzi e Filtri Automatici
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
                <label className="block text-xs font-bold uppercase mb-1">Step Sequenza</label>
                <input
                  type="number"
                  value={maxAutonomousSteps}
                  onChange={e => setMaxAutonomousSteps(Number(e.target.value))}
                  className="w-full border p-2.5 rounded text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Giorni tra Step</label>
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
              ? "Avvio in corso..."
              : `OK — SALVA E AVVIA IN AUTOMATICO PER ${companyName.toUpperCase()}`}
          </button>

          {resultMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold uppercase rounded text-center">
              {resultMsg}
            </div>
          )}

          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-300 text-red-700 text-xs font-bold uppercase rounded text-center">
              {errorMsg}
            </div>
          )}
        </form>
      )}

      {/* TAB 2: MONITOR ESECUTIVO LIVE (COSA STA FACENDO, CODA E LOG) */}
      {activeTab === "MONITOR" && (
        <div className="space-y-8">
          {/* Stato Casella Mittente */}
          <div className="p-4 border rounded-xl bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="text-xs space-y-1">
              <div className="font-bold uppercase text-slate-700">
                Stato Casella Mittente ({senderEmail || "Non configurata"})
              </div>
              <div className="text-slate-600">
                Ultimo sparo:{" "}
                <strong>
                  {senderStatus.lastSentAt
                    ? new Date(senderStatus.lastSentAt).toLocaleString("it-IT")
                    : "Nessun invio recente"}
                </strong>{" "}
                • Quota Oggi: <strong>{senderStatus.sentToday} / {senderStatus.dailyLimit}</strong>
              </div>
              {senderStatus.errorLog && (
                <div className="text-red-600 font-bold">Ultimo avviso SMTP: {senderStatus.errorLog}</div>
              )}
            </div>
            <span
              className={`px-3 py-1 rounded text-xs font-bold uppercase ${
                senderStatus.isActive ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
              }`}
            >
              {senderStatus.isActive ? "Motore Operativo" : "Casella Inattiva"}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Colonna Sinistra: Registro Log Invii, Errori e Bounce */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Registro Log Esecutivi ({filteredLogs.length})
                </h3>
                <div className="flex gap-1">
                  {(["ALL", "SENT", "BOUNCED"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setLogFilter(f)}
                      className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded ${
                        logFilter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {f === "ALL" ? "Tutti" : f === "SENT" ? "Inviati" : "Rimbalzati / Errori"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden max-h-[550px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[10px] font-bold uppercase text-slate-500">
                      <th className="p-2.5">Destinatario & Azione</th>
                      <th className="p-2.5">Esito</th>
                      <th className="p-2.5 text-right">Orario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs">
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-slate-400">
                          Nessun log registrato per questo filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="p-2.5">
                            <div className="font-bold text-slate-900">{log.emailAddress}</div>
                            <div className="text-[11px] text-slate-600 truncate max-w-xs">{log.subject}</div>
                            {log.errorMessage && (
                              <div className="text-[10px] text-red-600 font-medium mt-0.5">{log.errorMessage}</div>
                            )}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                log.status === "BOUNCED"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-right text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Colonna Destra: Stato Coda & Contatti Processati */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Stato Coda & Avanzamento Step ({sequenceQueue.length})
                </h3>
                <span className="text-[11px] text-slate-500 font-medium">
                  Max {maxAutonomousSteps} step per contatto
                </span>
              </div>

              <div className="border rounded-xl overflow-hidden max-h-[550px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[10px] font-bold uppercase text-slate-500">
                      <th className="p-2.5">Lead in Lavorazione</th>
                      <th className="p-2.5">Step Attuale</th>
                      <th className="p-2.5">Stato Coda</th>
                      <th className="p-2.5 text-right">Prossima Azione</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs">
                    {sequenceQueue.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          Nessun contatto in coda per {companyName}.
                        </td>
                      </tr>
                    ) : (
                      sequenceQueue.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-2.5">
                            <div className="font-bold text-slate-900">{item.profile?.email}</div>
                            <div className="text-[10px] text-slate-500">{item.profile?.segment}</div>
                          </td>
                          <td className="p-2.5 font-mono font-bold text-slate-800">
                            Step {item.currentStep} / {maxAutonomousSteps}
                          </td>
                          <td className="p-2.5">
                            {item.isUnsubscribed ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700">
                                Bloccato
                              </span>
                            ) : item.isCompleted ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                                Processato
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                                In Coda
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right text-[11px] text-slate-500 whitespace-nowrap">
                            {item.isCompleted
                              ? "Completato"
                              : item.nextActionAt
                              ? new Date(item.nextActionAt).toLocaleString("it-IT", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })
                              : "Subito"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DATABASE CONTATTI DELL'AZIENDA */}
      {activeTab === "LEADS" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["ALL", "QUALIFIED", "NURTURING", "REJECTED"] as const).map(f => (
              <button
                key={f}
                onClick={() => setLeadFilter(f)}
                className={`px-3 py-1.5 text-xs font-bold uppercase rounded ${
                  leadFilter === f ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {f === "ALL"
                  ? "Tutti"
                  : f === "QUALIFIED"
                  ? "Qualificati Caldi"
                  : f === "NURTURING"
                  ? "In Corso"
                  : "Scartati / Bounce"}
              </button>
            ))}
          </div>

          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-[11px] font-bold uppercase text-slate-500">
                  <th className="p-3">Contatto</th>
                  <th className="p-3">Telefono</th>
                  <th className="p-3">Stato</th>
                  <th className="p-3">Segmento / Esito Filtro</th>
                  <th className="p-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      Nessun contatto trovato in questo filtro per {companyName}.
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">
                          {p.firstName || ""} {p.lastName || ""}
                        </div>
                        <div className="text-slate-500">{p.email}</div>
                      </td>
                      <td className="p-3 font-mono">{p.phone || "—"}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            p.status === "QUALIFIED"
                              ? "bg-emerald-100 text-emerald-800"
                              : p.status === "REJECTED" || p.status === "ANOMALO"
                              ? "bg-red-100 text-red-800"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">
                        <div className="font-semibold">{p.segment}</div>
                        {p.aiSummary && <div className="text-[11px] text-slate-400">{p.aiSummary}</div>}
                      </td>
                      <td className="p-3 text-right font-bold">{p.icpScore}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: RISPOSTE RICEVUTE DAI CLIENTI DELL'AZIENDA */}
      {activeTab === "REPLIES" && (
        <div className="space-y-4">
          {replies.length === 0 ? (
            <div className="p-12 border border-dashed rounded-xl text-center text-xs text-slate-400 uppercase font-bold">
              Nessuna risposta ancora ricevuta sulla casella di {companyName}.
            </div>
          ) : (
            replies.map(r => (
              <div key={r.id} className="p-4 border rounded-xl bg-slate-50 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-bold text-sm">{r.profile?.email}</span>
                    {r.profile?.phone && (
                      <span className="ml-3 text-xs font-mono bg-white px-2 py-0.5 border rounded">
                        Tel: {r.profile.phone}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    {r.sentiment || r.profile?.status}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-700">{r.subject}</div>
                <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans bg-white p-3 rounded border max-h-40 overflow-y-auto">
                  {r.content}
                </pre>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function OneClickAutopilotPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm">Caricamento workspace azienda...</div>}>
      <TenantAutopilotWorkspace />
    </Suspense>
  );
}
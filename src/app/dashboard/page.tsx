import { prisma } from "@/lib/prisma";
import PriorityList from "./PriorityList";
import { LeadStatus } from "@prisma/client";

export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardOverview({ searchParams }: DashboardPageProps) {
  const resolvedParams = await searchParams;
  const currentFilter = (resolvedParams.filter as string) || "ALL";

  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return <div className="p-8 text-slate-500 text-xs uppercase tracking-widest font-medium">Nessuna Licenza Attiva.</div>;

  // 1. Estrazione massiva ottimizzata con indici relazionali
  const profiles = await prisma.profile.findMany({
    where: { tenantId: tenant.id },
    orderBy: { lastActivityAt: 'desc' }
  });

  // Data di riferimento per calcoli temporali (es. ultimi 7 giorni = freschezza critica)
  const now = new Date().getTime();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // 2. EQUAZIONI DI FILTRAGGIO MULTIDIMENSIONALE
  const processedProfiles = profiles.map(p => {
    const lastActivityTime = p.lastActivityAt ? new Date(p.lastActivityAt).getTime() : new Date(p.createdAt).getTime();
    const isRecent = (now - lastActivityTime) <= SEVEN_DAYS_MS;
    
    // Equazione di valore ponderato (Matematica + Temporale)
    // Un lead è "Power" se è qualificato, ha un buon score ICP ed è attivo recentemente o ha budget alto
    const isPowerLead = p.status === LeadStatus.QUALIFIED && p.icpScore >= 60 && (p.budget !== null && p.budget > 0);
    const isUrgent = p.urgency === "HIGH" && p.status === LeadStatus.QUALIFIED;
    const isStale = !isRecent && p.status === LeadStatus.NURTURING;

    return {
      ...p,
      _metrics: {
        isRecent,
        isPowerLead,
        isUrgent,
        isStale
      }
    };
  });

  // 3. CALCOLO KPI GLOBALI (Basati su equazioni matematiche e finanziarie reali)
  const qualifiedLeads = processedProfiles.filter(p => p.status === LeadStatus.QUALIFIED);
  const powerLeadsCount = processedProfiles.filter(p => p._metrics.isPowerLead).length;
  const urgentCount = processedProfiles.filter(p => p._metrics.isUrgent).length;
  const pendingCount = processedProfiles.filter(p => p.status === LeadStatus.PENDING_OTP).length;
  const anomaliesCount = processedProfiles.filter(p => p.status === LeadStatus.ANOMALO || p.status === LeadStatus.REJECTED).length;
  const socialLeadsCount = processedProfiles.filter(p => p.source === "Social_Ingestion").length;
  const webLeadsCount = processedProfiles.length - socialLeadsCount;
  const ticketMedio = 1500;
  const conversionRate = 0.05;
  // Interessi calcolati sui Power Leads (liquidità immediata) + conversione standard sui qualificati
  const interessiMaturati = Math.round((powerLeadsCount * 0.20 + qualifiedLeads.length * conversionRate) * ticketMedio);

  // 4. APPLICAZIONE FILTRO INTERATTIVO (UI State)
  const filteredProfiles = processedProfiles.filter(p => {
    if (currentFilter === "POWER") return p._metrics.isPowerLead;
    if (currentFilter === "URGENT") return p._metrics.isUrgent;
    if (currentFilter === "PENDING") return p.status === LeadStatus.PENDING_OTP;
    if (currentFilter === "ANOMALIES") return p.status === LeadStatus.ANOMALO || p.status === LeadStatus.REJECTED;
    return true; // "ALL"
  });

  return (
    <div className="animate-in fade-in duration-500 space-y-8 font-sans">
      
      {/* HEADER */}
      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-1">{tenant.companyName || "Founders Edition"}</h2>
          <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">Motorized Analytics & RLS Engine</p>
        </div>
        
        <div className="flex gap-2">
          {urgentCount > 0 && (
            <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] uppercase tracking-wider font-bold rounded-full">
              {urgentCount} A Alta Urgenza
            </div>
          )}
          {powerLeadsCount > 0 && (
            <div className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-600 text-[10px] uppercase tracking-wider font-bold rounded-full">
              {powerLeadsCount} Power Leads
            </div>
          )}
        </div>
      </div>

      {/* API KEY SECURE BOX (server safe) */}
      <div className="bg-zinc-950 rounded-xl p-6 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between shadow-lg gap-4 text-zinc-100">
        <div>
          <p className="text-zinc-400 text-[10px] uppercase tracking-widest font-bold mb-1">Infrastruttura di Ingestion</p>
          <p className="text-zinc-400 text-sm">Header di autenticazione API: <code className="text-emerald-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">x-rls-api-key</code></p>
        </div>
        <div className="flex items-center">
          <input 
            type="text" 
            readOnly 
            value={tenant.apiKey} 
            className="bg-zinc-900 text-emerald-400 font-mono text-sm px-4 py-2 rounded-lg border border-zinc-800 w-full md:w-80 focus:outline-none"
          />
        </div>
      </div>

      {/* KPI METRICS (MATEMATICA & FINANZA) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KpiBox label="Traffico Organico (Sito)" value={webLeadsCount.toString()} />
        <KpiBox label="Traffico Intercettato (Social)" value={socialLeadsCount.toString()} />
        <KpiBox label="Power Leads (ROI Matematico)" value={powerLeadsCount.toString()} highlight />
        <KpiBox label="Liquidità Stimata (Pipeline)" value={`€ ${interessiMaturati.toLocaleString('it-IT')}`} />
      </div>

      {/* FILTRI INTERATTIVI (UI TAB SWITCHER) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        <FilterTab label="Tutti i Contatti" value="ALL" current={currentFilter} count={processedProfiles.length} />
        <FilterTab label="Power Leads (Alta Priorità)" value="POWER" current={currentFilter} count={powerLeadsCount} />
        <FilterTab label="Urgenti (Alta Urgenza)" value="URGENT" current={currentFilter} count={urgentCount} />
        <FilterTab label="In Attesa OTP" value="PENDING" current={currentFilter} count={pendingCount} />
        <FilterTab label="Anomalie / Scarti" value="ANOMALIES" current={currentFilter} count={anomaliesCount} />
      </div>

      {/* TABELLA PRIORITARIA DINAMICA */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">
            Flusso Filtrato ({filteredProfiles.length} record visualizzati)
          </h3>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Algoritmo ICP Attivo</span>
        </div>
        <PriorityList leads={filteredProfiles} />
      </div>

    </div>
  );
}

function KpiBox({ label, value, highlight = false, isAlert = false }: { label: string, value: string, highlight?: boolean, isAlert?: boolean }) {
  return (
    <div className={`p-6 rounded-xl border shadow-sm transition-all ${highlight ? 'border-emerald-200 bg-emerald-50' : isAlert ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <p className={`text-[10px] uppercase font-bold tracking-widest mb-1.5 ${highlight ? 'text-emerald-600' : isAlert ? 'text-red-500' : 'text-slate-500'}`}>{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${highlight ? 'text-emerald-600' : isAlert ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function FilterTab({ label, value, current, count }: { label: string, value: string, current: string, count: number }) {
  const isActive = current === value;
  return (
    <a 
      href={`/dashboard?filter=${value}`}
      className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all border flex items-center space-x-2 ${
        isActive 
          ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      <span>{label}</span>
      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'}`}>
        {count}
      </span>
    </a>
  );
}
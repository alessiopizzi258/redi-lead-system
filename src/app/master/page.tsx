"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface TenantSummary {
  id: string;
  companyName: string;
  apiKey: string;
  aiEnabled: boolean;
  agentName: string;
  industryContext: string;
  offerCatalog: string;
  senderEmail: string;
  senderProvider: string;
  senderActive: boolean;
  sentToday: number;
  dailyLimit: number;
  stats: {
    total: number;
    qualified: number;
    nurturing: number;
    rejected: number;
  };
}

export default function MasterAdminPage() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/master/tenants");
      const data = await res.json();
      if (data.tenants) setTenants(data.tenants);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/master/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: newCompanyName,
          industryContext: newIndustry
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewCompanyName("");
        setNewIndustry("");
        await fetchTenants();
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-8 bg-white text-slate-900 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-6 mb-8 gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded">
            Multi-Tenant Master Hub
          </span>
          <h1 className="text-3xl font-bold tracking-tight mt-2">
            Amministrazione Aziende Pilota
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestisci ogni azienda cliente in ambienti separati: database, casella email, catalogo offerte e metriche isolate.
          </p>
        </div>
      </div>

      {/* Box Creazione Rapida Nuova Azienda Pilota */}
      <form
        onSubmit={handleCreateTenant}
        className="p-6 mb-10 border border-slate-200 rounded-xl bg-slate-50 flex flex-col md:flex-row gap-4 items-end"
      >
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold uppercase mb-1 text-slate-700">
            Nome Nuova Azienda Pilota
          </label>
          <input
            type="text"
            required
            placeholder="Es. Scintilla Hub / Rossi Immobiliare / Studio Verdi"
            value={newCompanyName}
            onChange={e => setNewCompanyName(e.target.value)}
            className="w-full border p-2.5 rounded text-sm bg-white"
          />
        </div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold uppercase mb-1 text-slate-700">
            Settore / Cosa Vendono (Opzionale)
          </label>
          <input
            type="text"
            placeholder="Es. Noleggio Lungo Termine / Impianti Fotovoltaici"
            value={newIndustry}
            onChange={e => setNewIndustry(e.target.value)}
            className="w-full border p-2.5 rounded text-sm bg-white"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded h-[42px] shrink-0"
        >
          {creating ? "Creazione..." : "+ Crea Nuova Azienda"}
        </button>
      </form>

      {/* Griglia Aziende Pilota */}
      {loading ? (
        <div className="text-sm text-slate-500 py-12 text-center">Caricamento aziende pilota...</div>
      ) : tenants.length === 0 ? (
        <div className="p-12 border border-dashed rounded-xl text-center text-slate-500">
          Nessuna azienda pilota presente. Creane una qui sopra per iniziare.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tenants.map(t => (
            <div
              key={t.id}
              className="border border-slate-200 rounded-xl p-6 bg-white shadow-sm hover:border-emerald-500 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start gap-4 mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{t.companyName}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Firma: <strong>{t.agentName}</strong> • ID: <code className="text-[11px]">{t.id.slice(0, 8)}</code>
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 text-[11px] font-bold uppercase rounded ${
                      t.senderActive
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {t.senderActive ? `Attiva (${t.senderProvider})` : "Email Da Configurare"}
                  </span>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded border border-slate-100 mb-4 space-y-1">
                  <div>
                    <strong>Casella Mittente:</strong> {t.senderEmail} ({t.sentToday}/{t.dailyLimit} invii oggi)
                  </div>
                  <div className="line-clamp-2">
                    <strong>Cosa vendono:</strong> {t.industryContext || "Non ancora specificato"}
                  </div>
                </div>

                {/* KPI Isolati della singola Azienda */}
                <div className="grid grid-cols-4 gap-2 mb-6 text-center">
                  <div className="p-2.5 bg-slate-50 rounded border">
                    <div className="text-lg font-bold text-slate-900">{t.stats.total}</div>
                    <div className="text-[10px] font-bold uppercase text-slate-500">Database</div>
                  </div>
                  <div className="p-2.5 bg-emerald-50 rounded border border-emerald-200">
                    <div className="text-lg font-bold text-emerald-700">{t.stats.qualified}</div>
                    <div className="text-[10px] font-bold uppercase text-emerald-700">Qualificati</div>
                  </div>
                  <div className="p-2.5 bg-blue-50 rounded border border-blue-200">
                    <div className="text-lg font-bold text-blue-700">{t.stats.nurturing}</div>
                    <div className="text-[10px] font-bold uppercase text-blue-700">In Corso</div>
                  </div>
                  <div className="p-2.5 bg-red-50 rounded border border-red-200">
                    <div className="text-lg font-bold text-red-700">{t.stats.rejected}</div>
                    <div className="text-[10px] font-bold uppercase text-red-700">Scartati</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-4 border-t">
                <Link
                  href={`/dashboard/ai-autopilot?tenantId=${t.id}`}
                  className="flex-1 text-center py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase rounded"
                >
                  Apri Dashboard Azienda →
                </Link>
                <a
                  href={`/api/tenant/leads/export?tenantId=${t.id}&minScore=31&onlyClean=true`}
                  className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase rounded"
                >
                  Scarica Caldi CSV
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
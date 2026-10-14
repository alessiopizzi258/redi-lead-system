"use client";

import { useState } from "react";

export default function PriorityList({ leads }: { leads: any[] }) {
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "REVIEW">("ALL");

  const segmentWeight: Record<string, number> = { "Urgente": 5, "Caldo": 4, "Tiepido": 3, "Freddo": 2, "Dormiente": 1 };

  const sortedLeads = [...leads].sort((a: any, b: any) => {
    if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
    if (b.status === "ACTIVE" && a.status !== "ACTIVE") return 1;
    if (a.status === "ACTIVE" && b.status === "ACTIVE") {
      const weightA = segmentWeight[a.segment] || 0;
      const weightB = segmentWeight[b.segment] || 0;
      if (weightA !== weightB) return weightB - weightA;
    }
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });

  const filteredLeads = sortedLeads.filter((lead: any) => {
    if (filter === "ACTIVE") return lead.status === "ACTIVE";
    if (filter === "REVIEW") return lead.status === "ANOMALO" || lead.status === "DA_VERIFICARE_MANUALMENTE";
    return true;
  });

  return (
    <div>
      <div className="flex gap-2 p-4 border-b border-slate-100 bg-white">
        <FilterBtn label="Tutti" active={filter === "ALL"} onClick={() => setFilter("ALL")} />
        <FilterBtn label="CRM Attivo" active={filter === "ACTIVE"} onClick={() => setFilter("ACTIVE")} />
        <FilterBtn label="Coda Revisione" active={filter === "REVIEW"} onClick={() => setFilter("REVIEW")} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase font-bold tracking-widest text-slate-500 border-b border-slate-200">
              <th className="p-4">Contatto</th>
              <th className="p-4">Stato Sistema</th>
              <th className="p-4">Segmento RFM</th>
              <th className="p-4">Interazioni</th>
              <th className="p-4 text-right">Ultima Attività</th>
            </tr>
          </thead>
          <tbody className="text-xs text-slate-600 divide-y divide-slate-100 bg-white">
            {filteredLeads.map((lead: any) => (
              <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <p className="font-semibold text-slate-900">{lead.email}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{lead.phone || 'Nessun Telefono'}</p>
                </td>
                <td className="p-4"><StatusBadge status={lead.status} /></td>
                <td className="p-4">
                  {lead.status === "ACTIVE" ? <SegmentBadge segment={lead.segment} /> : <span className="text-slate-300">-</span>}
                </td>
                <td className="p-4 text-[10px] font-medium tracking-widest text-slate-500">
                  <span className="text-slate-800 font-bold mr-1">{lead.contactCount}</span> Punti
                </td>
                <td className="p-4 text-right text-[10px] font-medium tracking-widest text-slate-500">
                  {new Date(lead.lastActivityAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' })}
                </td>
              </tr>
            ))}
            {filteredLeads.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400 font-medium text-[10px] uppercase tracking-widest">
                  Nessun bersaglio trovato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`text-[10px] uppercase font-bold tracking-widest px-4 py-2 rounded-md transition-all ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "ACTIVE": "bg-emerald-50 text-emerald-600 border border-emerald-200",
    "PENDING_OTP": "bg-slate-100 text-slate-500 border border-slate-200",
    "DA_VERIFICARE_MANUALMENTE": "bg-amber-50 text-amber-600 border border-amber-200",
    "ANOMALO": "bg-red-50 text-red-600 border border-red-200",
    "REJECTED": "bg-red-100 text-red-700 border border-red-300 font-bold",
  };
  return (
    <span className={`text-[9px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-md ${styles[status] || styles["PENDING_OTP"]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function SegmentBadge({ segment }: { segment: string }) {
  const styles: Record<string, string> = {
    "Urgente": "text-emerald-700 bg-emerald-100 font-bold",
    "Caldo": "text-blue-700 bg-blue-100 font-semibold",
    "Tiepido": "text-amber-700 bg-amber-100 font-medium",
    "Freddo": "text-slate-600 bg-slate-100",
    "Dormiente": "text-slate-400 bg-transparent border border-slate-200",
  };
  return (
    <span className={`text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-md ${styles[segment] || styles["Dormiente"]}`}>
      {segment}
    </span>
  );
}
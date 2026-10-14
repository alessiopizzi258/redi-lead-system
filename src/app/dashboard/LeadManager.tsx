"use client";

import { useState, useRef } from "react";
import { addSingleLead, importCsvLeads } from "./actions";

export default function LeadManager({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSingleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    const result = await addSingleLead(formData, tenantId);

    if (result.error) setMessage({ text: result.error, type: "error" });
    else {
      setMessage({ text: "Database aggiornato (Metodo Redi).", type: "success" });
      formRef.current?.reset();
    }
    setLoading(false);
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    const result = await importCsvLeads(formData, tenantId);

    if (result.error) setMessage({ text: result.error, type: "error" });
    else setMessage({ text: `${result.count} Lead iniettati nel sistema.`, type: "success" });
    
    if (fileRef.current) fileRef.current.value = "";
    setLoading(false);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 h-full shadow-sm">
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Inserimento Strategico</h3>
        <label className={`cursor-pointer text-[10px] font-bold uppercase tracking-widest px-4 py-2 border rounded-md transition-colors ${loading ? 'opacity-50 cursor-not-allowed border-slate-200 text-slate-400' : 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}>
          {loading ? "Elaborazione..." : "Importa CSV"}
          <input type="file" accept=".csv, .xlsx, .xls" className="hidden" ref={fileRef} onChange={handleCsvUpload} disabled={loading} />
        </label>
      </div>

      <form ref={formRef} onSubmit={handleSingleSubmit} className="space-y-4">
        <input type="email" name="email" required placeholder="Email Cliente *" className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-md placeholder-slate-400 transition-all" />
        <div className="grid grid-cols-2 gap-4">
          <input type="text" name="firstName" placeholder="Nome" className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-md placeholder-slate-400 transition-all" />
          <input type="text" name="lastName" placeholder="Cognome" className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-md placeholder-slate-400 transition-all" />
        </div>
        <input type="text" name="phone" placeholder="Telefono" className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-md placeholder-slate-400 transition-all" />
        
        <button type="submit" disabled={loading} className="w-full bg-emerald-500 text-white font-bold text-[11px] tracking-widest uppercase py-3.5 mt-4 rounded-md hover:bg-emerald-600 transition-colors disabled:opacity-50 shadow-sm shadow-emerald-500/20">
          Inietta nel Sistema
        </button>
      </form>

      {message && (
        <div className={`mt-6 p-4 text-xs font-bold tracking-widest uppercase rounded-md border ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-red-50 border-red-200 text-red-600'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
"use client";

import { useState } from "react";

export default function EnrollButton({ apiKey }: { apiKey: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);

  const handleEnroll = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/leads/enroll', {
        method: 'POST',
        headers: { 'x-rls-api-key': apiKey }
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Errore di innesco");
      
      if (data.count === 0) {
        setMessage({ text: "Nessun nuovo lead da agganciare.", type: "success" });
      } else {
        setMessage({ text: `🚀 Motore Avviato: ${data.count} lead in coda di invio.`, type: "success" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <button 
        onClick={handleEnroll} 
        disabled={loading}
        className="w-full bg-[#113b36] text-[#cfff04] font-bold text-[11px] tracking-widest uppercase py-3.5 rounded-md hover:bg-[#0c2a26] transition-colors disabled:opacity-50"
      >
        {loading ? "Innesco in corso..." : "Avvia Nurturing Email"}
      </button>

      {message && (
        <div className={`mt-3 p-4 text-xs font-bold tracking-widest uppercase rounded-md border ${message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-red-50 border-red-200 text-red-600'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
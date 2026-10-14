"use client";

import { useState } from "react";

export default function TriggerButton() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function fireHitlGeneration() {
    setLoading(true);
    setStatus("🧠 DeepSeek in elaborazione...");
    
    try {
      // Chiamiamo il trigger che innesca il worker (che ora fa SOLO generazione, non invio)
      const res = await fetch("/api/cron/daily-fire", {
        method: "GET",
        headers: { "Authorization": `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || "Al3s6i024@"}` }
      });
      
      const data = await res.json();
      
      if (data.success) {
        setStatus(`✅ ${data.message}`); 
        setTimeout(() => setStatus(null), 5000);
      } else {
        setStatus(`❌ Errore: ${data.error || data.message}`);
      }
    } catch (err: any) {
      setStatus(`❌ Fallimento rete: ${err.message}`);
    }
    setLoading(false);
  }

  return (
    <div className="mt-8 border-t border-gray-900 pt-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-[0.15em]">Motore IA (Generazione Bozze)</h3>
      </div>
      <p className="text-[10px] text-gray-500 mb-4 tracking-widest uppercase">
        Questa azione NON invia email. Interroga l'IA per generare bozze da revisionare manualmente.
      </p>
      
      <button 
        onClick={fireHitlGeneration} 
        disabled={loading}
        className="w-full bg-emerald-600/10 border border-emerald-500 text-emerald-500 font-bold text-[10px] tracking-widest uppercase py-4 hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
      >
        {loading ? "INIEZIONE CODE..." : "GENERA BOZZE DA REVISIONARE"}
      </button>
      
      {status && (
        <p className={`mt-3 text-[10px] tracking-widest uppercase text-center ${status.includes('❌') ? 'text-red-500' : 'text-emerald-500'}`}>
          {status}
        </p>
      )}
    </div>
  );
}
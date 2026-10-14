"use client";

import { useState } from "react";
import { syncRfmDatabase } from "./actions";

export default function RfmSyncButton({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setStatus("Sincronizzazione RFM in corso...");
    
    try {
      const result = await syncRfmDatabase(tenantId);
      
      if (result.error) {
        setStatus(`❌ Errore: ${result.error}`);
      } else {
        setStatus(`✅ Allineati ${result.updatedCount} profili.`);
        setTimeout(() => setStatus(null), 3000);
      }
    } catch (err: any) {
      setStatus(`❌ Fallimento imprevisto: ${err.message}`);
    }
    
    setLoading(false);
  }

  return (
    <div className="mt-4 border-t border-gray-900 pt-4">
      <button 
        onClick={handleSync} 
        disabled={loading}
        className="w-full bg-transparent border border-gray-700 text-gray-300 font-medium text-xs tracking-widest uppercase py-3 hover:bg-white hover:text-black transition-all disabled:opacity-50"
      >
        {loading ? "Calcolo Matematico..." : "Sincronizza Database RFM"}
      </button>
      {status && <p className="mt-2 text-[10px] tracking-widest uppercase text-emerald-500 text-center">{status}</p>}
    </div>
  );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OtpVerification({ profileId, onVerified }: { profileId: string, onVerified?: () => void }) {
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/leads/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, token })
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMsg(data.message);
      } else {
        if (onVerified) onVerified();
        else router.push("/success");
      }
    } catch (err) {
      setErrorMsg("Errore di connessione al server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full mx-auto shadow-lg shadow-slate-200/50">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Verifica Identità</h2>
        <p className="text-xs text-slate-500 font-medium">
          Inserisci il codice a 6 cifre ricevuto per sbloccare l'accesso.
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-6">
        <div>
          <input 
            type="text" maxLength={6} required value={token}
            onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-center text-3xl font-bold tracking-[0.5em] px-4 py-4 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
            placeholder="••••••"
          />
        </div>

        {errorMsg && (
          <div className="p-3 border border-red-200 bg-red-50 text-[10px] text-red-600 uppercase font-bold tracking-widest text-center rounded-md">
            {errorMsg}
          </div>
        )}

        <button 
          type="submit" disabled={isLoading || token.length !== 6}
          className="w-full bg-emerald-500 text-white text-[11px] font-bold tracking-widest uppercase py-4 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-500/20"
        >
          {isLoading ? "Validazione..." : "Conferma Accesso"}
        </button>
      </form>
    </div>
  );
}
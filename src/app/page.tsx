"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginUser } from "@/app/actions/auth";

export default function RootEntryPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [credentials, setCredentials] = useState({ email: "", license: "" });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    
    const result = await loginUser(credentials.email, credentials.license);

    if (result?.error) {
      setErrorMsg(result.error);
      setIsLoading(false);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-emerald-500/20 flex flex-col lg:flex-row">
      
      {/* SEZIONE SINISTRA: Branding */}
      <div className="lg:w-[55%] p-10 lg:p-20 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-slate-100 bg-slate-50/50">
        <div className="max-w-xl">
          <h1 className="text-4xl lg:text-5xl font-light tracking-tight text-slate-900 mb-4">
            Redi <span className="text-emerald-500 font-bold">Lead System</span>
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed border-l-2 border-emerald-500 pl-4 mb-12">
            Infrastruttura proprietaria per la deanonimizzazione, qualificazione e conversione di database B2B. Accesso riservato agli operatori autorizzati.
          </p>

          <div className="space-y-8">
            <FeatureStep number="01" title="Smart Qualification" desc="Il sistema intercetta e qualifica i lead bloccando i dati falsi alla fonte." />
            <FeatureStep number="02" title="Tracking Comportamentale" desc="Scoring passivo in tempo reale sulle pagine strategiche per misurare l'intento." />
            <FeatureStep number="03" title="Estrazione Liquidità" desc="Lista prioritaria dinamica per colpire i prospect nel momento di massima urgenza." />
          </div>
        </div>
      </div>

      {/* SEZIONE DESTRA: Login */}
      <div className="lg:w-[45%] bg-white flex items-center justify-center p-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 text-center">
            <h2 className="text-xl font-medium tracking-tight text-slate-900">Accesso Sistema</h2>
            <p className="text-xs text-slate-500 mt-2">Inserire le credenziali operative</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2">Email Amministratore</label>
              <input 
                type="email" required value={credentials.email}
                onChange={(e) => setCredentials({...credentials, email: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm px-4 py-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all rounded-md"
                placeholder="admin@azienda.com"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-2">License Key</label>
              <input 
                type="password" required value={credentials.license}
                onChange={(e) => setCredentials({...credentials, license: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm px-4 py-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all rounded-md tracking-widest"
                placeholder="••••••••••••••••"
              />
            </div>

            <button 
              type="submit" disabled={isLoading}
              className="w-full px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold tracking-widest uppercase rounded-md transition-colors disabled:opacity-50 mt-4 shadow-md shadow-emerald-500/20"
            >
              {isLoading ? "Autenticazione..." : "Sblocca Sistema"}
            </button>

            {errorMsg && (
              <div className="p-3 mt-4 border border-red-200 bg-red-50 text-[10px] text-red-600 uppercase tracking-widest text-center rounded-md font-medium">
                {errorMsg}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function FeatureStep({ number, title, desc }: { number: string, title: string, desc: string }) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-xs">{number}</div>
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-1">{title}</h4>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
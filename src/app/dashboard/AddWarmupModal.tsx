"use client";

import { useState } from "react";
import { addWarmupAccount } from "@/app/actions/warmup";

export default function AddWarmupModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [provider, setProvider] = useState<"GMAIL" | "CUSTOM">("GMAIL");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.append("provider", provider);

    const result = await addWarmupAccount(formData);

    if (result.error) setErrorMsg(result.error);
    else setIsOpen(false);
    
    setIsLoading(false);
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="text-[10px] font-bold tracking-widest text-emerald-600 bg-emerald-50 px-4 py-2 rounded-md uppercase border border-emerald-200 hover:bg-emerald-100 transition-colors"
      >
        + Connetti Casella
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 w-full max-w-md p-8 relative rounded-xl shadow-2xl">
            
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Inizializza Canale</h3>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-6 border-b border-slate-100 pb-4">
              Seleziona l'architettura della casella email
            </p>

            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 border border-slate-200 mb-6 rounded-md">
              <button
                type="button"
                onClick={() => setProvider("GMAIL")}
                className={`py-2 text-[10px] font-bold tracking-widest uppercase transition-all rounded ${provider === "GMAIL" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Google / Gmail
              </button>
              <button
                type="button"
                onClick={() => setProvider("CUSTOM")}
                className={`py-2 text-[10px] font-bold tracking-widest uppercase transition-all rounded ${provider === "CUSTOM" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Server Esterno
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-1.5">Email Account</label>
                <input type="email" name="email" required placeholder="info@dominio.com"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm px-3 py-2 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-1.5">
                  {provider === "GMAIL" ? "Google App Password (16 caratteri)" : "Password Account"}
                </label>
                <input type="password" name="appPassword" required placeholder="••••••••••••••••"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm px-3 py-2 rounded-md focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
              </div>

              {provider === "CUSTOM" && (
                <div className="space-y-4 border-t border-slate-100 pt-4 animate-in fade-in duration-300">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-1.5">SMTP Host</label>
                      <input type="text" name="smtpHost" required placeholder="smtp.dominio.com"
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs px-3 py-2 rounded-md focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-1.5">Porta SMTP</label>
                      <input type="number" name="smtpPort" defaultValue="465" required
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs px-3 py-2 rounded-md focus:outline-none focus:border-emerald-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-1.5">IMAP Host</label>
                      <input type="text" name="imapHost" required placeholder="imap.dominio.com"
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs px-3 py-2 rounded-md focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-1.5">Porta IMAP</label>
                      <input type="number" name="imapPort" defaultValue="993" required
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs px-3 py-2 rounded-md focus:outline-none focus:border-emerald-500" />
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-2 border border-red-200 bg-red-50 text-[10px] font-bold text-red-600 uppercase tracking-widest rounded-md mt-2">
                  {errorMsg}
                </div>
              )}

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full mt-6 bg-emerald-500 text-white text-[10px] font-bold tracking-widest uppercase py-3.5 rounded-md hover:bg-emerald-600 transition-colors disabled:opacity-50 shadow-sm shadow-emerald-500/20"
              >
                {isLoading ? "Iniezione in corso..." : "Arma Casella"}
              </button>
            </form>

          </div>
        </div>
      )}
    </>
  );
}
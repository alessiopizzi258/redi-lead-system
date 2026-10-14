"use client";

import React, { useState } from "react";
import { Loader2, ShieldCheck, CheckCircle, AlertCircle } from "lucide-react";

type Step = 1 | 2 | 3; // 1: Raccolta Dati, 2: Verifica OTP, 3: Successo

export default function RLSLeadForm() {
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  // Stato form Step 1
  const [formData, setFormData] = useState({
    firstName: "",
    email: "",
    phone: "",
    urgency: "MEDIUM",
    role: "MANAGER",
    budget: "",
  });

  // Stato form Step 2
  const [otpToken, setOtpToken] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        budget: formData.budget ? parseFloat(formData.budget) : null,
      };

      const res = await fetch("/api/leads/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // MOCK API KEY per il testing lato client (sostituire con gestione server-side sicura se necessario)
          "x-rls-api-key": "test_api_key_tenant", 
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Errore durante l'invio dei dati.");
      }

      if (data.status === "PENDING_OTP" || data.status === "PENDING_OTP") {
        setProfileId(data.profileId);
        setStep(2);
      } else {
        // Se non raggiunge la soglia e viene scartato silenziosamente (NURTURING)
        setStep(3); 
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/leads/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, token: otpToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "OTP non valido.");
      }

      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden text-zinc-100 font-sans">
      <div className="p-8">
        
        {/* HEADER */}
        <div className="flex flex-col items-center justify-center space-y-3 mb-8 text-center">
          <div className="h-12 w-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            {step === 3 ? (
              <CheckCircle className="w-6 h-6 text-green-500" />
            ) : (
              <ShieldCheck className="w-6 h-6 text-zinc-100" />
            )}
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            {step === 1 && "Verifica Accesso Sistema"}
            {step === 2 && "Autenticazione Richiesta"}
            {step === 3 && "Accesso Autorizzato"}
          </h2>
          <p className="text-sm text-zinc-500">
            {step === 1 && "Inserisci i dati operativi per procedere."}
            {step === 2 && "Abbiamo inviato un codice di sicurezza al tuo contatto."}
            {step === 3 && "Identità verificata, sarai contattato a breve."}
          </p>
        </div>

        {/* ERROR BANNER */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/30 border border-red-900/50 rounded-lg flex items-center space-x-3 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: INGESTION FORM */}
        {step === 1 && (
          <form onSubmit={submitLead} className="space-y-4">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Nome Completo</label>
                <input required type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white transition-all" placeholder="Es. Mario Rossi" />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Email Aziendale</label>
                <input required type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white transition-all" placeholder="nome@azienda.it" />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Telefono (per OTP)</label>
                <input required type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white transition-all" placeholder="+39 333 0000000" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Ruolo</label>
                  <select name="role" value={formData.role} onChange={handleInputChange} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white transition-all appearance-none">
                    <option value="OWNER">Titolare / Founder</option>
                    <option value="C_LEVEL">C-Level (CEO, CTO)</option>
                    <option value="DIRECTOR">Direttore</option>
                    <option value="MANAGER">Manager</option>
                    <option value="EMPLOYEE">Dipendente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Urgenza</label>
                  <select name="urgency" value={formData.urgency} onChange={handleInputChange} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white transition-all appearance-none">
                    <option value="HIGH">Alta (Entro 30 gg)</option>
                    <option value="MEDIUM">Media (3-6 mesi)</option>
                    <option value="LOW">Bassa (Ricerca)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Budget Stimato (€)</label>
                <input type="number" name="budget" value={formData.budget} onChange={handleInputChange} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-white transition-all" placeholder="Es. 5000" />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="w-full mt-6 bg-white text-black font-semibold rounded-lg px-4 py-3 text-sm hover:bg-zinc-200 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Procedi all'Autenticazione"}
            </button>
          </form>
        )}

        {/* STEP 2: OTP FORM */}
        {step === 2 && (
          <form onSubmit={submitOtp} className="space-y-6">
            <div>
              <label className="block text-center text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Codice a 6 cifre</label>
              <input 
                required 
                type="text" 
                maxLength={6} 
                pattern="\d{6}"
                value={otpToken} 
                onChange={(e) => setOtpToken(e.target.value)} 
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-4 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-1 focus:ring-white transition-all placeholder:text-zinc-700" 
                placeholder="000000" 
              />
            </div>
            
            <button type="submit" disabled={isLoading || otpToken.length !== 6} className="w-full bg-white text-black font-semibold rounded-lg px-4 py-3 text-sm hover:bg-zinc-200 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Conferma Identità"}
            </button>
          </form>
        )}

        {/* STEP 3: SUCCESS STATE */}
        {step === 3 && (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
            <p className="text-sm text-zinc-400">
              I tuoi dati sono stati protetti e processati dal sistema. Un nostro operatore specializzato analizzerà la tua richiesta e si metterà in contatto con te.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
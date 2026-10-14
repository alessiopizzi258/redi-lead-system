"use client";

import { useState } from "react";
import { approveAndSendEmail, rejectDraft } from "@/app/actions/hitlActions"; 

export default function HitlCard({ log }: { log: any }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSubject, setEditedSubject] = useState(log.subject);
  const [editedBody, setEditedBody] = useState(log.errorMessage); 
  
  const [isSending, setIsSending] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const SENDER_EMAIL = "alessio@designlab-group.it"; // Aggiorna se necessario

  const handleApprove = async () => {
    setIsSending(true);
    const result = await approveAndSendEmail(log.id, editedBody, editedSubject, log.tenantId, SENDER_EMAIL);
    if (!result.success) {
      alert("❌ Errore Invio: " + result.error);
      setIsSending(false); 
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    const result = await rejectDraft(log.id, log.tenantId);
    if (!result.success) {
      alert("❌ Errore Scarto: " + result.error);
      setIsRejecting(false);
    }
  };

  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between shadow-sm relative transition-opacity ${isSending || isRejecting ? 'opacity-50 pointer-events-none' : ''}`}>
      
      <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">
            Target: <span className="text-slate-800 font-semibold">{log.profile?.email}</span>
          </p>
          <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 uppercase font-bold tracking-wider">
            Modello AI Core
          </span>
        </div>
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className={`text-[9px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-md transition-all ${
            isEditing 
              ? "bg-slate-100 text-slate-600 border border-slate-200" 
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {isEditing ? "Chiudi Editor" : "Modifica Testo"}
        </button>
      </div>

      <div className="flex-1">
        {isEditing ? (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Oggetto</label>
              <input 
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 p-3 text-sm rounded-md focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Sorgente HTML / Copy</label>
              <textarea 
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-700 p-3 text-xs h-56 rounded-md custom-scrollbar focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all"
              />
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 leading-relaxed">
              Subj: {editedSubject}
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Live Preview</p>
            <div className="bg-white rounded-md overflow-hidden h-64 border border-slate-200 shadow-inner">
              <iframe 
                srcDoc={editedBody} 
                className="w-full h-full border-0" 
                title="Email Preview"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6 border-t border-slate-100 pt-5">
        <button 
          onClick={handleApprove}
          disabled={isSending || isRejecting}
          className="flex-1 bg-emerald-500 text-white text-[10px] font-bold tracking-widest uppercase py-3 rounded-md hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-500/20 disabled:bg-slate-300 disabled:shadow-none"
        >
          {isSending ? "Iniezione Payload..." : (isEditing ? "Salva & Fuoco" : "Approva & Fuoco")}
        </button>
        <button 
          onClick={handleReject}
          disabled={isSending || isRejecting}
          className="px-6 border border-slate-200 bg-white text-slate-500 text-[10px] font-bold tracking-widest uppercase rounded-md hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all disabled:opacity-50"
        >
          {isRejecting ? "Epurazione..." : "Scarta"}
        </button>
      </div>
    </div>
  );
}
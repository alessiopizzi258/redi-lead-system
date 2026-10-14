import { prisma } from "@/lib/prisma";
import AddWarmupModal from "../AddWarmupModal";
export const dynamic = 'force-dynamic';

export default async function WarmupPage() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return null;

  const senders = await prisma.gmailSender.findMany();

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      
      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-1">Multi-Sling Radar</h2>
          <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">Infrastruttura di Invio e Warmup</p>
        </div>
        <AddWarmupModal />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {senders.length === 0 ? (
          <div className="col-span-full py-24 border border-dashed border-slate-300 bg-white rounded-xl flex flex-col items-center justify-center">
            <span className="text-slate-300 text-3xl mb-3">📡</span>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nessun dominio di invio armato.</p>
          </div>
        ) : (
          senders.map(acc => {
            const progress = (acc.sentToday / acc.dailyLimit) * 100;
            const isWarming = acc.isActive && !acc.quarantineUntil;

            return (
              <div key={acc.id} className="bg-white border border-slate-200 rounded-xl p-6 relative shadow-sm hover:shadow-md transition-shadow">
                
                <div className="flex justify-between items-start mb-6">
                  <span className="text-sm font-bold text-slate-900 truncate pr-4">{acc.email}</span>
                  <span className={`text-[9px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-md border ${
                    isWarming ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'
                  }`}>
                    {isWarming ? 'ATTIVO' : 'BLOCCATO'}
                  </span>
                </div>
                
                <div className="mb-2 flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  <span>Volume Odierno</span>
                  <span><strong className="text-slate-900">{acc.sentToday}</strong> / {acc.dailyLimit}</span>
                </div>
                
                {/* Progress Bar Light Mode */}
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-5">
                  <div className={`h-full transition-all duration-700 rounded-full ${isWarming ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${progress}%` }}></div>
                </div>

                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-100 pt-4">
                  Ultimo Invio: <span className="text-slate-600">{acc.lastSentAt ? new Date(acc.lastSentAt).toLocaleTimeString('it-IT') : "Mai usato"}</span>
                </div>
                
                {acc.errorLog && (
                  <div className="mt-3 p-2 bg-red-50 border border-red-100 rounded-md text-[9px] font-bold text-red-600 uppercase tracking-wider truncate">
                    Errore: {acc.errorLog}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
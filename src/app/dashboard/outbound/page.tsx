import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export default async function OutboundPage() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return null;

  const sentEmails = await prisma.automationLog.findMany({
    where: { tenantId: tenant.id, status: { in: ['SENT', 'OPENED', 'DELIVERED'] } },
    orderBy: { timestamp: 'desc' },
    take: 50,
    include: { profile: { select: { email: true } } }
  });

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      
      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-1">Outbound Live</h2>
          <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">Registro Esecutivo delle Comunicazioni</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        {/* Header Tabella */}
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-100 bg-slate-50 text-[10px] uppercase font-bold tracking-widest text-slate-500">
          <div className="col-span-3">Destinatario</div>
          <div className="col-span-5">Oggetto Email</div>
          <div className="col-span-2 text-center">Stato</div>
          <div className="col-span-2 text-right">Orario Invio</div>
        </div>
        
        {/* Corpo Tabella */}
        <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto custom-scrollbar bg-white">
          {sentEmails.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center">
              <span className="text-slate-300 text-3xl mb-3">✉️</span>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nessun invio registrato nel sistema.</p>
            </div>
          ) : (
            sentEmails.map(log => (
              <div key={log.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-50 transition-colors">
                <div className="col-span-3 text-sm font-semibold text-slate-900 truncate pr-4">{log.profile.email}</div>
                <div className="col-span-5 text-xs text-slate-600 truncate pr-4 font-medium">{log.subject}</div>
                <div className="col-span-2 flex justify-center">
                  <span className={`text-[9px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-md ${
                    log.status === 'OPENED' ? 'text-emerald-700 bg-emerald-100 border border-emerald-200' : 'text-blue-700 bg-blue-50 border border-blue-200'
                  }`}>
                    {log.status}
                  </span>
                </div>
                <div className="col-span-2 text-right text-[10px] font-medium text-slate-500 tracking-widest">
                  {new Date(log.timestamp).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
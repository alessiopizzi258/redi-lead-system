import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export default async function NurturingDashboard() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return null;

  // Estrazione delle sequenze e dei lead intrappolati nel loop di riscaldamento
  const sequences = await prisma.sequence.findMany({
    where: { tenantId: tenant.id },
    include: {
      emails: { orderBy: { stepNumber: 'asc' } },
      _count: { select: { enrollments: true } }
    }
  });

  return (
    <div className="animate-in fade-in duration-500 space-y-8 font-sans">
      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-1">Nurturing Engine</h2>
          <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">Gestione Drip Campaigns e Follow-Up Algoritmico</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {sequences.length === 0 ? (
          <div className="col-span-full py-24 border border-dashed border-slate-300 bg-white rounded-xl flex flex-col items-center justify-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nessuna Sequenza Attiva</p>
          </div>
        ) : (
          sequences.map(seq => (
            <div key={seq.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">{seq.name}</h3>
                <span className={`text-[9px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-md ${seq.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                  {seq.isActive ? 'IN ESECUZIONE' : 'IN PAUSA'}
                </span>
              </div>
              
              <div className="mb-6 p-3 bg-slate-50 border border-slate-100 rounded-lg flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Target in Riscaldamento</span>
                <span className="text-lg font-bold text-slate-900">{seq._count.enrollments} Leads</span>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Architettura Sequenza (Plain Text)</h4>
                {seq.emails.map(email => (
                  <div key={email.id} className="p-3 bg-white border border-slate-100 rounded-md hover:border-emerald-200 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-semibold text-slate-800">Step {email.stepNumber}: {email.subject}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Delay: {email.delayDays} gg</span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">{email.plainText}</p>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
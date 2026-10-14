import { prisma } from "@/lib/prisma";
import HitlCard from "./HitlCard";

export const dynamic = 'force-dynamic';

export default async function HitlPage() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return null;

  const pendingEmails = await prisma.automationLog.findMany({
    where: { tenantId: tenant.id, status: "PENDING_APPROVAL" },
    orderBy: { timestamp: 'asc' },
    include: { profile: { select: { email: true, firstName: true } } }
  });

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-1">Quarantena <span className="font-bold text-emerald-600">HitL</span></h2>
          <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">Revisione e Approvazione Bozze IA</p>
        </div>
        <div className="text-right flex items-center gap-3 bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg">
          <span className="text-2xl font-bold text-amber-600 leading-none">{pendingEmails.length}</span>
          <p className="text-[10px] font-bold tracking-widest text-amber-600 uppercase">In Coda</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {pendingEmails.length === 0 ? (
          <div className="col-span-full py-32 border border-dashed border-slate-300 bg-white rounded-xl flex flex-col items-center justify-center">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
              <span className="text-emerald-500 text-xl font-bold">✓</span>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nessuna operazione in sospeso</p>
          </div>
        ) : (
          pendingEmails.map(log => (
            <HitlCard key={log.id} log={log} />
          ))
        )}
      </div>
    </div>
  );
}
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

export default async function DeliveryMonitor({ tenantId }: { tenantId: string }) {
  // Estrae gli ultimi 15 lead in fase di Nurturing, ordinati per ultima attività
  const activeSequences = await prisma.leadSequenceState.findMany({
    where: { 
      profile: { tenantId: tenantId }
    },
    include: {
      profile: {
        select: { email: true, firstName: true, lastName: true, status: true }
      },
      sequence: {
        select: { name: true }
      }
    },
    orderBy: { lastEmailedAt: 'desc' },
    take: 15
  });

  if (activeSequences.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm mt-8">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-[0.15em] mb-4">Log di Spedizione</h3>
        <p className="text-sm text-slate-500">Nessuna attività di invio registrata.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm mt-8">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-[0.15em]">Live Delivery Log</h3>
        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md tracking-widest uppercase">Motore Attivo</span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest text-slate-400">
              <th className="pb-3 font-semibold">Contatto</th>
              <th className="pb-3 font-semibold">Sequenza</th>
              <th className="pb-3 font-semibold">Stato Attuale</th>
              <th className="pb-3 font-semibold">Ultimo Invio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {activeSequences.map((seq) => (
              <tr key={seq.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-3">
                  <div className="font-medium text-slate-900">{seq.profile.firstName} {seq.profile.lastName}</div>
                  <div className="text-xs text-slate-500">{seq.profile.email}</div>
                </td>
                <td className="py-3 text-xs text-slate-600">{seq.sequence.name}</td>
                <td className="py-3">
                  {seq.isCompleted ? (
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded-md tracking-widest uppercase">Completata</span>
                  ) : (
                    <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-1 rounded-md tracking-widest uppercase">Step {seq.currentStep}</span>
                  )}
                </td>
                <td className="py-3 text-xs font-medium text-slate-600">
                  {seq.lastEmailedAt 
                    ? formatDistanceToNow(new Date(seq.lastEmailedAt), { addSuffix: true, locale: it })
                    : "In attesa del Worker"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
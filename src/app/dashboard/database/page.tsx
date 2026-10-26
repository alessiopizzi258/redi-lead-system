import { prisma } from "@/lib/prisma";
import LeadManager from "@/app/dashboard/LeadManager";
import TriggerButton from "@/app/dashboard/TriggerButton";
import RfmSyncButton from "@/app/dashboard/RfmSyncButton";
import EnrollButton from "@/components/EnrollButton";
import DeliveryMonitor from '@/components/DeliveryMonitor';

export const dynamic = 'force-dynamic';

export default async function DatabasePage() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return null;

  const totalContacts = await prisma.profile.count({ where: { tenantId: tenant.id } });
  
  const segmentsData = await prisma.profile.groupBy({
    by: ['segment'],
    where: { tenantId: tenant.id },
    _count: { segment: true }
  });
  
  const getSegmentCount = (segName: string) => segmentsData.find(s => s.segment === segName)?._count.segment || 0;
  const segments = {
    Urgente: getSegmentCount("Urgente"),
    Caldo: getSegmentCount("Caldo"),
    Tiepido: getSegmentCount("Tiepido"),
    Freddo: getSegmentCount("Freddo"),
    Dormiente: getSegmentCount("Dormiente"),
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      
      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-1">Database & CRM Segmentato</h2>
          <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">Segmentazione Algoritmica e Controllo Dati</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Distribuzione RFM */}
        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          <h3 className="text-xs font-bold text-slate-800 mb-8 uppercase tracking-[0.15em]">Distribuzione RFM Globale</h3>
          <div className="space-y-6">
            <SegmentRow label="Urgente (>101 pt)" count={segments.Urgente} total={totalContacts} color="bg-emerald-500" />
            <SegmentRow label="Caldo (61-100 pt)" count={segments.Caldo} total={totalContacts} color="bg-blue-500" />
            <SegmentRow label="Tiepido (31-60 pt)" count={segments.Tiepido} total={totalContacts} color="bg-amber-500" />
            <SegmentRow label="Freddo (1-30 pt)" count={segments.Freddo} total={totalContacts} color="bg-slate-400" />
            <SegmentRow label="Dormiente (0 pt)" count={segments.Dormiente} total={totalContacts} color="bg-slate-200" />
          </div>
        </div>

        {/* Manager Inserimento */}
        <div className="lg:col-span-1 h-full">
          <LeadManager tenantId={tenant.id} apiKey={tenant.apiKey} />
        </div>

        {/* Operazioni di Sistema */}
        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col justify-end gap-6">
          <div className="flex-1">
            <h3 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-[0.15em]">Motore di Sincronizzazione</h3>
            <p className="text-[10px] font-medium text-slate-500 mb-6 leading-relaxed">
              Forza il ricalcolo dei punteggi di tutto il database o avvia la generazione delle bozze IA per i nuovi lead.
            </p>
          </div>
          {/* I bottoni TriggerButton e RfmSyncButton si adatteranno se li hai modificati, o puoi usare la versione base chiara */}
          <RfmSyncButton tenantId={tenant.id} />
          <TriggerButton />
          <EnrollButton apiKey={tenant.apiKey} />
        </div>
      </div>
    </div>
  );
}

function SegmentRow({ label, count, total, color }: { label: string, count: number, total: number, color: string }) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-2">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-800">{count} <span className="text-slate-400 ml-1">({percentage}%)</span></span>
      </div>
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
}
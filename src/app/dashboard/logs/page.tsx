import { prisma } from "@/lib/prisma";
import DeliveryMonitor from "@/components/DeliveryMonitor";

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return null;

  return (
    <div className="p-8 animate-in fade-in duration-500">
      <div className="border-b border-slate-200 pb-4 mb-8">
        <h2 className="text-2xl font-semibold text-slate-900 mb-1">Telemetria Nurturing</h2>
        <p className="text-slate-500 text-[10px] tracking-widest uppercase font-bold">Monitoraggio in tempo reale del motore di invio SMTP</p>
      </div>
      
      <DeliveryMonitor tenantId={tenant.id} />
    </div>
  );
}
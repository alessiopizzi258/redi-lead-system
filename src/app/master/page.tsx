import { prisma } from "@/lib/prisma";
import { createTenantAction, impersonateTenant } from "./actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MasterDashboard() {
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const masterData = await Promise.all(
      tenants.map(async (t) => {
        try {
          const totalLeads = await prisma.profile.count({ where: { tenantId: t.id } });
          const hotLeads = await prisma.profile.count({ where: { tenantId: t.id, status: "QUALIFIED" } });
          // CORRETTO: Nessun filtro tenantId su gmailSender essendo pool globale
          const senders = await prisma.gmailSender.findMany();
          return { ...t, totalLeads, hotLeads, senders };
        } catch (innerErr) {
          return { ...t, totalLeads: 0, hotLeads: 0, senders: [] };
        }
      })
    );

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans selection:bg-emerald-500/30">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="flex justify-between items-end border-b border-zinc-800 pb-6">
            <div>
              <h1 className="text-3xl font-light tracking-tight text-white mb-2">
                Nexus <span className="font-bold text-emerald-500">Master Control</span>
              </h1>
              <p className="text-zinc-500 text-xs tracking-widest uppercase font-bold">Orchestrazione Globale Agenzia</p>
            </div>
            <div className="text-right">
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-2 rounded-lg text-xs tracking-widest uppercase font-bold">
                {tenants.length} Tenant Attivi
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 h-fit">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-6 border-b border-zinc-800 pb-4">
                + Inizializza Nuovo Cliente
              </h2>
              
              <form action={async (formData) => {
                "use server";
                await createTenantAction(formData);
              }} className="space-y-4">
                <div>
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-bold">Nome Azienda</label>
                  <input type="text" name="companyName" required placeholder="Es. Scintilla Hub Srl"
                    className="w-full bg-zinc-950 border border-zinc-800 text-white text-sm px-4 py-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-bold">Email Referente (Destinazione Lead)</label>
                  <input type="email" name="adminEmail" required placeholder="stefano@scintillahub.it"
                    className="w-full bg-zinc-950 border border-zinc-800 text-white text-sm px-4 py-3 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors" />
                </div>
                <button type="submit" className="w-full bg-emerald-500 text-black font-bold text-xs uppercase tracking-widest py-3.5 rounded-lg hover:bg-emerald-400 transition-colors mt-4">
                  Arma Infrastruttura
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-6 border-b border-zinc-800 pb-4">
                Flotta Operativa
              </h2>
              
              {masterData.map(tenant => (
                <div key={tenant.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 hover:border-zinc-700 transition-colors">
                  
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white mb-1">{tenant.companyName}</h3>
                    <p className="text-xs text-zinc-500 mb-3">{tenant.adminEmail}</p>
                    <div className="flex gap-4 text-[10px] uppercase tracking-widest font-bold">
                      <span className="text-zinc-400">Totale Lead: <span className="text-white">{tenant.totalLeads}</span></span>
                      <span className="text-emerald-500">Qualificati: {tenant.hotLeads}</span>
                      <span className="text-blue-400">Caselle SMTP Globali: {tenant.senders.length}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 w-full md:w-auto">
                    <div className="bg-zinc-950 px-3 py-2 rounded-md border border-zinc-800">
                      <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">API KEY (Webhook)</p>
                      <code className="text-xs text-zinc-300 font-mono select-all">{tenant.apiKey}</code>
                    </div>
                    
                    <form action={async () => {
                      "use server";
                      await impersonateTenant(tenant.id);
                      redirect("/dashboard");
                    }}>
                      <button type="submit" className="w-full px-4 py-2 bg-zinc-800 text-white hover:bg-white hover:text-black text-[10px] uppercase tracking-widest font-bold rounded-md transition-all">
                        Entra (God Mode) &rarr;
                      </button>
                    </form>
                  </div>

                </div>
              ))}
              
              {masterData.length === 0 && (
                <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl">
                  <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Nessun Tenant Registrato</p>
                </div>
              )}
              
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error: any) {
    return (
      <div className="min-h-screen bg-zinc-950 text-red-500 p-10 font-mono">
        <h2 className="text-xl font-bold mb-4">🚨 Errore Critico nella Master Dashboard</h2>
        <p className="bg-zinc-900 p-4 rounded border border-red-900 text-sm">{error.message}</p>
      </div>
    );
  }
}
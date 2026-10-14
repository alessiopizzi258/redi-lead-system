import Sidebar from "./Sidebar";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("nexus_session")?.value;

  if (!sessionId) redirect("/");

  const tenant = await prisma.tenant.findUnique({ where: { id: sessionId } });
  if (!tenant) redirect("/");

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-500/20 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 border-b border-slate-200 bg-white px-8 flex justify-end items-center z-50 shrink-0">
          <div className="text-[10px] tracking-widest text-slate-500 uppercase font-medium">
            Licenza attiva: <span className="text-emerald-600 font-bold ml-1">{tenant.companyName}</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto custom-scrollbar p-8">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
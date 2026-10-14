"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    { name: "Overview", path: "/dashboard", icon: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z" },
    { name: "Controllo HitL", path: "/dashboard/hitl", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
    { name: "Outbound Live", path: "/dashboard/outbound", icon: "M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z" },
    { name: "Database CRM", path: "/dashboard/database", icon: "M4 4h16v16H4z M4 8h16 M8 4v16" },
    { name: "Nurturing Engine", path: "/dashboard/nurturing", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-full flex-shrink-0">
      <div className="h-16 flex items-center px-8 border-b border-slate-200">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          Redi <span className="text-emerald-500">Lead System</span>
        </h1>
      </div>

      <nav className="flex-1 py-8 px-4 space-y-1">
        <p className="px-4 text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-4">Moduli Operativi</p>
        
        {menuItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link key={item.name} href={item.path}>
              <div className={`flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 ${
                isActive ? "bg-emerald-50 border border-emerald-100" : "hover:bg-slate-50 border border-transparent"
              }`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                     className={`w-4 h-4 ${isActive ? "text-emerald-500" : "text-slate-400"}`}>
                  <path d={item.icon} />
                </svg>
                <span className={`text-[11px] uppercase tracking-wider font-semibold ${isActive ? "text-emerald-600" : "text-slate-500"}`}>
                  {item.name}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-6 border-t border-slate-200 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
          <span className="text-[10px] tracking-widest text-slate-500 uppercase font-bold">System Online</span>
        </div>
      </div>
    </aside>
  );
}
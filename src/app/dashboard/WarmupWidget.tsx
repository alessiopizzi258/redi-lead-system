import { prisma } from "@/lib/prisma";

export default async function WarmupWidget() {
  const accounts = await prisma.gmailSender.findMany();

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <h3 className="text-sm font-semibold text-gray-900 tracking-wide uppercase mb-4">
        Multi-Sling Engine
      </h3>
      
      {accounts.length === 0 ? (
        <p className="text-sm text-gray-500">Nessun account Gmail configurato.</p>
      ) : (
        <div className="space-y-4">
          {accounts.map((acc) => {
            const progress = (acc.sentToday / acc.dailyLimit) * 100;
            const isWarming = acc.isActive && !acc.quarantineUntil;

            return (
              <div key={acc.id} className="flex flex-col gap-2 p-4 bg-gray-50 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900">{acc.email}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${isWarming ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {isWarming ? 'ATTIVO' : 'QUARANTENA'}
                  </span>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                  <div 
                    className="bg-black h-1.5 rounded-full transition-all duration-500" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-500">Capacità odierna</span>
                  <span className="text-xs font-medium text-gray-900">
                    {acc.sentToday} / {acc.dailyLimit} inviate
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
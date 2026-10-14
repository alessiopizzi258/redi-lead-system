import { NextResponse } from 'next/server';
import { P2PWarmupService } from '@/lib/services/p2pWarmup';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Lancia il ciclo in background per non bloccare la richiesta Vercel
  P2PWarmupService.runPingPongCycle().catch(console.error);
  
  return NextResponse.json({ 
    success: true, 
    message: "Ciclo P2P Ping-Pong innescato. Gli account stanno comunicando." 
  });
}
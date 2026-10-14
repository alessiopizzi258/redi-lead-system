import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// 1. Inizializzazione della connessione Redis (Edge-compatible)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 2. Configurazione Sliding Window (5 req / 1 min)
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  ephemeralCache: new Map(),
  analytics: false, // Disabilitato per ridurre latenza I/O
});

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Applichiamo lo scudo solo sugli endpoint critici
  if (pathname.startsWith('/api/leads/ingest')) {
    
    // Identificazione del nodo (Vercel popola x-forwarded-for o ip nativo)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

    // --- DIFESA 1: RATE LIMITING ---
    const { success, limit, reset, remaining } = await ratelimit.limit(`ratelimit_${ip}`);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Quota superata. Riprova più tardi.' },
        { 
          status: 429, 
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString()
          } 
        }
      );
    }

    // --- DIFESA 2: HONEYPOT (Ghost Block) ---
    if (request.method === 'POST') {
      try {
        // Cloniamo la request per non consumare lo stream destinato alla Route Handler
        const clonedReq = request.clone();
        const body = await clonedReq.json();
        
        // Ipotizziamo che 'website_url' o '_honeypot' siano i campi nascosti nel frontend
        if (body && (body.website_url || body._honeypot)) {
          // Risposta fantasma: il bot crede di aver avuto successo
          return NextResponse.json(
            { success: true, message: 'Operazione completata con successo.' }, 
            { status: 200 }
          );
        }
      } catch (e) {
        // Ignoriamo le eccezioni di parsing JSON a questo livello. 
        // Zod bloccherà i payload corrotti direttamente nella Route Handler.
      }
    }
  }

  // --- DIFESA 3: HEADER DI SICUREZZA DI BASE ---
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
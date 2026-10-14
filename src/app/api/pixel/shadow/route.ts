import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TrafficScoringService } from "@/lib/services/trafficScoringService";
import { RfmService } from "@/lib/services/rfmService";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tid, fp, url, scroll, duration, email, isFinal } = body;
    
    let profile = null;
    if (email) {
        profile = await prisma.profile.findFirst({ where: { email, tenantId: tid } });
    } else {
        const lastWebActivity = await prisma.webActivity.findFirst({ 
            where: { fingerprint: fp, profileId: { not: null } }, 
            orderBy: { timestamp: 'desc' } 
        });
        if (lastWebActivity?.profileId) {
            profile = await prisma.profile.findUnique({ where: { id: lastWebActivity.profileId }});
        }
    }

    let activity = await prisma.webActivity.findFirst({
        where: { fingerprint: fp, url: url, timestamp: { gte: new Date(Date.now() - 1000 * 60 * 30) } } 
    });

    let newPoints = 0;
    let urlScoreAwarded = activity?.urlScoreAwarded || false;

    if (!urlScoreAwarded) {
        newPoints += TrafficScoringService.calculatePageScore(url);
        urlScoreAwarded = true;
    }

    const previousDuration = activity?.duration || 0;
    newPoints += TrafficScoringService.getDurationBonus(duration, previousDuration);

    if (activity) {
        await prisma.webActivity.update({
            where: { id: activity.id },
            data: { duration, scrollDepth: scroll, urlScoreAwarded }
        });
    } else {
        await prisma.webActivity.create({
            data: {
                profileId: profile?.id || null,
                fingerprint: fp,
                url: url,
                duration: duration,
                scrollDepth: scroll,
                urlScoreAwarded
            }
        });
    }

    if (profile && newPoints > 0) {
        await prisma.profile.update({
            where: { id: profile.id },
            data: { 
                passiveScore: { increment: newPoints },
                lastActivityAt: new Date() 
            }
        });

        // 👉 TRIGGER RICALCOLO GLOBALE
        await RfmService.syncProfileScore(profile.id);
        
        // Trigger Agguato per i Dormienti ad Alto Watch-Time
        if (profile.segment === "Dormiente" && duration > 30 && (url.includes('audit') || url.includes('libro'))) {
            await prisma.automationLog.create({
                data: {
                    tenantId: tid,
                    profileId: profile.id,
                    emailAddress: profile.email,
                    status: "SYSTEM_ALERT",
                    subject: "🔥 LEAD DORMIENTE RISVEGLIATO",
                    errorMessage: `Ha letto l'offerta per ${duration}s. Richiede contatto immediato (Recency Effect).`
                }
            });
        }
    }

    return new NextResponse(JSON.stringify({ status: 'tracked', pointsAdded: newPoints }), {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("[Shadow Pixel Error]", error);
    return new NextResponse(JSON.stringify({ error: "Pixel Error" }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { DeliveryService } from "@/lib/services/deliveryService";

export async function approveAndSendEmail(
  logId: string,
  finalHtml: string,
  finalSubject: string,
  tenantId: string,
  senderEmail: string
) {
  try {
    // 1. Recupera i dati del lead dal log
    const draft = await prisma.automationLog.findUnique({
      where: { id: logId }
    });

    if (!draft || draft.status !== "PENDING_APPROVAL") {
      return { success: false, error: "Bozza inesistente o già processata." };
    }

    // 2. Sparo con il motore SMTP proprietario (Zero Costi, no Resend)
    const success = await DeliveryService.sendColdEmailToProspect(
      tenantId,
      draft.emailAddress,
      finalSubject,
      finalHtml
    );

    if (!success) {
      return { success: false, error: "Fallimento SMTP. Verifica di aver armato la casella in Multi-Sling Radar." };
    }

    // 3. Aggiorna DB (Sposta da Quarantena a Inviato)
    await prisma.$transaction([
      prisma.automationLog.update({
        where: { id: logId },
        data: { 
          status: "SENT", 
          errorMessage: null, 
          subject: finalSubject 
        }
      }),
      prisma.profile.update({
        where: { id: draft.profileId },
        data: { 
          lastContactedAt: new Date(),
          contactCount: { increment: 1 }
        }
      })
    ]);

    // Ricarica la pagina della dashboard in automatico
    revalidatePath("/dashboard/hitl");

    return { success: true };

  } catch (error: any) {
    console.error("Errore critico in approvazione:", error);
    return { success: false, error: error.message };
  }
}

export async function rejectDraft(logId: string, tenantId: string) {
  try {
    await prisma.automationLog.delete({
      where: { id: logId }
    });
    
    revalidatePath("/dashboard/hitl");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
/**
 * @file src/lib/services/deliveryService.ts
 * @description
 * Servizio di inoltro a latenza ottimizzata per i Lead Qualificati.
 * Gestisce l'invio via Email (simulato per Resend/Nodemailer) e via Webhook (API).
 */

import { prisma } from "@/lib/prisma";

export class DeliveryService {
  /**
   * Consegna il Lead Qualificato all'amministratore del Tenant.
   * Isolato con try/catch globale per impedire il crash del Worker chiamante.
   */
  static async sendLeadToTenant(profileId: string, tenantId: string): Promise<boolean> {
    console.log(`[DELIVERY] Avvio inoltro Lead [${profileId}] al Tenant [${tenantId}]...`);

    try {
      // 1. Estrazione dati relazionali (Profile + Tenant)
      const profile = await prisma.profile.findUnique({
        where: { id: profileId },
      });

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!profile || !tenant) {
        console.error(`❌ [DELIVERY] Dati mancanti. Inoltro annullato.`);
        return false;
      }

      if (!tenant.adminEmail) {
        console.warn(`⚠️ [DELIVERY] Nessuna adminEmail configurata per il Tenant ${tenant.companyName}.`);
        // In un caso reale, potremmo comunque tentare il webhook
      }

      // 2. Costruzione Payload Standardizzato
      const leadPayload = {
        lead_id: profile.id,
        contact: {
          first_name: profile.firstName,
          last_name: profile.lastName,
          email: profile.email,
          phone: profile.phone,
        },
        qualification: {
          icp_score: profile.icpScore,
          urgency: profile.urgency,
          role: profile.role,
          budget: profile.budget,
          problem_description: profile.problemDescription,
        },
        timestamp: new Date().toISOString(),
      };

      // 3. Esecuzione Parallela dei Canali di Consegna
      const deliveryTasks = [];

      if (tenant.adminEmail) {
        deliveryTasks.push(this.simulateEmailDelivery(tenant.adminEmail, leadPayload, tenant.companyName));
      }

      // Simulazione presenza Webhook nel record Tenant (es. tenant.webhookUrl)
      // Ipotizziamo una variabile fittizia per dimostrazione
      const webhookUrl = process.env.MOCK_WEBHOOK_URL; 
      if (webhookUrl) {
        deliveryTasks.push(this.fireWebhook(webhookUrl, leadPayload));
      }

      // Attendiamo l'esito di tutti i canali senza bloccarci al primo errore
      const results = await Promise.allSettled(deliveryTasks);
      
      const hasSuccess = results.some((result) => result.status === "fulfilled" && result.value === true);
      
      if (hasSuccess) {
        console.log(`✅ [DELIVERY] Lead [${profileId}] consegnato con successo.`);
        return true;
      } else {
        console.error(`❌ [DELIVERY] Fallimento totale su tutti i canali di inoltro per Lead [${profileId}].`);
        return false;
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";
      console.error(`🚨 [DELIVERY FATAL ERROR]: ${errorMessage}`);
      return false; // Il worker BullMQ riproverà in base alla policy di backoff
    }
  }

  /**
   * Simulazione invio Email tramite provider (es. Resend)
   */
  private static async simulateEmailDelivery(to: string, payload: any, companyName: string): Promise<boolean> {
    try {
      const emailText = `
🚀 NUOVO LEAD QUALIFICATO PER ${companyName} 🚀

Il sistema RLS ha setacciato e qualificato un nuovo prospect.

DATI CONTATTO:
- Nome: ${payload.contact.first_name || "N/D"} ${payload.contact.last_name || "N/D"}
- Email: ${payload.contact.email}
- Telefono: ${payload.contact.phone || "N/D"}

PROFILAZIONE (ICP Score: ${payload.qualification.icp_score}/100):
- Urgenza: ${payload.qualification.urgency}
- Ruolo: ${payload.qualification.role}
- Budget: €${payload.qualification.budget || "Non specificato"}

PROBLEMA: 
${payload.qualification.problem_description || "N/D"}

Accedi alla dashboard per i dettagli completi.
      `;

      // Simula il ritardo di rete API (es. chiamata a Resend)
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      // In produzione: await resend.emails.send({ ... })
      console.log(`✉️ [EMAIL] Inviata a ${to}:\n${emailText}`);
      
      return true;
    } catch (error) {
      console.error(`❌ [EMAIL] Errore invio a ${to}`, error);
      return false;
    }
  }

  /**
   * Inoltro payload tramite Webhook con timeout di sicurezza (5 secondi)
   */
  private static async fireWebhook(url: string, payload: any): Promise<boolean> {
    try {
      // Usa AbortSignal per prevenire code bloccate da CRM lenti
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "RLS-Delivery-Engine/1.0",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Status ${response.status}`);
      }

      console.log(`🔌 [WEBHOOK] Payload consegnato a ${url} (Status: ${response.status})`);
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Errore timeout/rete";
      console.error(`❌ [WEBHOOK] Fallimento consegna a ${url}: ${errorMessage}`);
      return false;
    }
  }
}
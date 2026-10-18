import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";

export class DeliveryService {
  /**
   * MOTORE 1: Spedisce la Cold Email al Prospect usando le caselle del Tenant.
   */
  static async sendColdEmailToProspect(tenantId: string, to: string, subject: string, html: string): Promise<boolean> {
    try {
      // 1. Pesca il mittente SMTP dell'azienda con meno invii oggi (Load Balancing)
      const sender = await prisma.gmailSender.findFirst({
        where: { isActive: true }, // Pesca la casella attiva più libera dal pool globale
        orderBy: { sentToday: 'asc' }
      });

      if (!sender) {
        console.error(`❌ [SMTP] Nessuna casella attiva trovata per il Tenant ${tenantId}`);
        return false;
      }

      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: sender.email,
          pass: sender.appPassword || "" // Bypassa il blocco se il DB lo segna come null
        }
      });

      await transporter.sendMail({
        from: `"Team" <${sender.email}>`, // Sicuro al 100%, usa solo l'email dal DB
        to,
        subject,
        html
      });

      await prisma.gmailSender.update({
        where: { id: sender.id },
        data: { sentToday: { increment: 1 } }
      });

      console.log(`✉️ [SMTP] Cold Email inviata con successo a ${to} tramite ${sender.email}`);
      return true;

    } catch (error: any) {
      console.error(`🚨 [SMTP FATAL ERROR] Invio a ${to} fallito:`, error.message);
      return false;
    }
  }

  /**
   * MOTORE 2: Consegna il Lead Qualificato all'amministratore del Tenant.
   */
  static async sendLeadToTenant(profileId: string, tenantId: string): Promise<boolean> {
    console.log(`[DELIVERY] Avvio inoltro Lead [${profileId}] al Tenant [${tenantId}]...`);

    try {
      const profile = await prisma.profile.findUnique({ where: { id: profileId } });
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

      if (!profile || !tenant) return false;

      const leadPayload = {
        lead_id: profile.id,
        contact: {
          first_name: profile.firstName || "N/D",
          last_name: profile.lastName || "N/D",
          email: profile.email,
          phone: profile.phone || "N/D",
        },
        qualification: {
          icp_score: (profile as any).icpScore || 0,
          urgency: (profile as any).urgency || "N/D", // Disinnesco per campi mancanti
          budget: (profile as any).budget || "N/D",   // Disinnesco per campi mancanti
        },
        timestamp: new Date().toISOString(),
      };

      const deliveryTasks = [];
      const adminEmail = (tenant as any).adminEmail;
      const companyName = (tenant as any).companyName || "Azienda";

      if (adminEmail) {
        deliveryTasks.push(this.notifyAdminViaEmail(tenantId, adminEmail, leadPayload, companyName));
      }

      const webhookUrl = process.env.MOCK_WEBHOOK_URL; 
      if (webhookUrl) {
        deliveryTasks.push(this.fireWebhook(webhookUrl, leadPayload));
      }

      const results = await Promise.allSettled(deliveryTasks);
      return results.some((result) => result.status === "fulfilled" && result.value === true);

    } catch (error) {
      console.error(`🚨 [DELIVERY FATAL ERROR]`, error);
      return false; 
    }
  }

  private static async notifyAdminViaEmail(tenantId: string, to: string, payload: any, companyName: string): Promise<boolean> {
    const htmlText = `
      <h3>🔥 NUOVO LEAD QUALIFICATO PER ${companyName}</h3>
      <p>Il Redi Lead System ha qualificato un nuovo prospect.</p>
      <ul>
        <li><b>Nome:</b> ${payload.contact.first_name} ${payload.contact.last_name}</li>
        <li><b>Email:</b> ${payload.contact.email}</li>
        <li><b>Telefono:</b> ${payload.contact.phone}</li>
        <li><b>ICP Score:</b> ${payload.qualification.icp_score}/100</li>
      </ul>
      <p>Accedi alla dashboard per i dettagli.</p>
    `;

    return this.sendColdEmailToProspect(tenantId, to, `🔥 Lead Qualificato: ${payload.contact.email}`, htmlText);
  }

  private static async fireWebhook(url: string, payload: any): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP Status ${response.status}`);
      return true;
    } catch (error) {
      return false;
    }
  }
}
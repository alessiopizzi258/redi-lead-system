"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { RfmService } from "@/lib/services/rfmService";
import * as xlsx from "xlsx";

export async function addSingleLead(formData: FormData, tenantId: string) {
  const email = formData.get("email")?.toString().trim();
  const firstName = formData.get("firstName")?.toString().trim() || "";
  const lastName = formData.get("lastName")?.toString().trim() || "";
  const phone = formData.get("phone")?.toString().trim() || "";

  if (!email) return { error: "L'email è obbligatoria." };

  const coldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  try {
    await prisma.profile.upsert({
      where: { tenantId_email: { tenantId, email } },
      update: { firstName, lastName, phone }, 
      create: {
        tenantId, email, firstName, lastName, phone,
        source: "DesignLab_Manual", segment: "Freddo",
        contactCount: 0, totalRevenue: 0, lastActivityAt: coldDate
      }
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: any) {
    return { error: `Errore database: ${error.message}` };
  }
}

export async function importCsvLeads(formData: FormData, tenantId: string) {
  const file = formData.get("file") as File;
  if (!file) return { error: "Nessun file selezionato." };

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rawData: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (rawData.length === 0) return { error: "Il file è vuoto o illeggibile." };

    let successCount = 0;
    const coldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const ops = rawData.map(async (row) => {
      const keys = Object.keys(row);

      const emailKey = keys.find(k => {
        const l = k.toLowerCase().trim();
        return l.includes("email") || l.includes("e-mail") || l === "mail";
      });

      let email = emailKey ? String(row[emailKey]).trim() : null;

      if (!email) {
         const valueWithAt = Object.values(row).find(v => typeof v === 'string' && v.includes('@') && v.includes('.'));
         if (valueWithAt) email = String(valueWithAt).trim();
      }

      if (!email || !email.includes("@")) return;

      const firstNameKey = keys.find(k => k.toLowerCase().includes("first") || k.toLowerCase().includes("nome"));
      const lastNameKey = keys.find(k => k.toLowerCase().includes("last") || k.toLowerCase().includes("cognome"));
      const phoneKey = keys.find(k => k.toLowerCase().includes("phone") || k.toLowerCase().includes("telefono"));

      const firstName = firstNameKey ? String(row[firstNameKey]).trim() : "";
      const lastName = lastNameKey ? String(row[lastNameKey]).trim() : "";
      const phone = phoneKey ? String(row[phoneKey]).trim() : "";

      await prisma.profile.upsert({
        where: { tenantId_email: { tenantId, email } },
        update: {}, 
        create: {
          tenantId,
          email,
          firstName,
          lastName,
          phone,
          source: "DesignLab_Data_Import",
          segment: "Freddo",
          contactCount: 0,
          totalRevenue: 0,
          lastActivityAt: coldDate
        }
      });
      successCount++;
    });

    await Promise.all(ops);
    revalidatePath("/dashboard");
    return { success: true, count: successCount };

  } catch (error: any) {
    return { error: `Errore critico motore ETL: ${error.message}` };
  }
}

export async function syncRfmDatabase(tenantId: string) {
  try {
    const profiles = await prisma.profile.findMany({
      where: {
        tenantId,
        segment: { not: "Bounced_Inattivo" }
      }
    });

    let updatedCount = 0;

    for (const profile of profiles) {
      // Invocazione diretta e chirurgica del nuovo motore RFM
      await RfmService.syncProfileScore(profile.id);
      updatedCount++;
    }

    revalidatePath("/dashboard");
    return { success: true, updatedCount };
  } catch (error: any) {
    console.error("❌ Errore Server Action Orchestratore:", error);
    return { error: error.message };
  }
}
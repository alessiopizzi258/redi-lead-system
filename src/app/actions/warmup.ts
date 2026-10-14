"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function addWarmupAccount(formData: FormData) {
  const cookieStore = await cookies();
  const tenantId = cookieStore.get("nexus_session")?.value;
  
  if (!tenantId) return { error: "Violazione di sicurezza: Accesso negato." };

  const email = formData.get("email") as string;
  const appPassword = formData.get("appPassword") as string;
  const provider = formData.get("provider") as string; // "GMAIL" o "CUSTOM"
  
  const smtpHost = formData.get("smtpHost") as string;
  const smtpPort = parseInt(formData.get("smtpPort") as string) || 465;
  const imapHost = formData.get("imapHost") as string;
  const imapPort = parseInt(formData.get("imapPort") as string) || 993;

  if (!email || !appPassword) return { error: "Parametri incompleti. Inserire Email e Password." };

  if (provider === "CUSTOM" && (!smtpHost || !imapHost)) {
    return { error: "Per i server esterni sono necessari i parametri SMTP e IMAP." };
  }

  try {
    await prisma.gmailSender.create({
      data: {
        email,
        appPassword,
        provider,
        smtpHost: provider === "CUSTOM" ? smtpHost : "smtp.gmail.com",
        smtpPort: provider === "CUSTOM" ? smtpPort : 465,
        imapHost: provider === "CUSTOM" ? imapHost : "imap.gmail.com",
        imapPort: provider === "CUSTOM" ? imapPort : 993,
        dailyLimit: 10,
        sentToday: 0,
        isActive: true
      }
    });

    revalidatePath("/dashboard/warmup");
    return { success: true };
    
  } catch (error) {
    console.error(error);
    return { error: "Account già presente o errore database." };
  }
}
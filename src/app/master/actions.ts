"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import crypto from "crypto";

// Creazione rapida di una nuova azienda (Tenant)
export async function createTenantAction(formData: FormData) {
  const companyName = formData.get("companyName")?.toString().trim();
  const adminEmail = formData.get("adminEmail")?.toString().trim();

  if (!companyName || !adminEmail) return { error: "Dati mancanti" };

  // Generazione di una API Key unica e sicura per il webhook
  const apiKey = `RLS_${crypto.randomBytes(16).toString("hex")}`;

  try {
    await prisma.tenant.create({
      data: {
        companyName,
        adminEmail,
        apiKey,
      }
    });

    revalidatePath("/master");
    return { success: true };
  } catch (error: any) {
    return { error: `Errore DB: ${error.message}` };
  }
}

// God Mode: Entra nella dashboard di un cliente specifico
export async function impersonateTenant(tenantId: string) {
  const cookieStore = await cookies();
  
  // Sovrascriviamo il cookie di sessione con l'ID del cliente scelto
  cookieStore.set("nexus_session", tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 // 1 giorno
  });

  return { success: true };
}
"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function loginUser(email: string, license: string) {
  if (!email || !license) {
    return { error: "Compilare tutti i campi." };
  }

  // 1. Verifica nel Database
  const tenant = await prisma.tenant.findFirst({
    where: {
      adminEmail: email,
      apiKey: license
    }
  });

  if (!tenant) {
    return { error: "Credenziali non valide o licenza revocata." };
  }

  // 2. Generazione del Cookie di Sessione (Next.js 15 richiede await)
  const cookieStore = await cookies();
  cookieStore.set("nexus_session", tenant.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7 // Scade tra 7 giorni
  });

  return { success: true };
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete("nexus_session");
}
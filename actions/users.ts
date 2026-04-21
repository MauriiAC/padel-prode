"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, generateTemporaryPassword } from "@/lib/password";
import { sendWelcomeEmail } from "@/lib/email";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  name: z.string().min(1, "Nombre requerido"),
  role: z.enum(["admin", "player"]).default("player"),
});

export type UserActionResult = { ok: true } | { ok: false; error: string };

export async function createUserAction(
  formData: FormData
): Promise<UserActionResult> {
  await requireAdmin();

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role") ?? "player",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "Ya existe un usuario con ese email" };
  }

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(tempPassword);

  await db.insert(users).values({
    email,
    name: parsed.data.name,
    role: parsed.data.role,
    passwordHash,
    mustChangePassword: true,
  });

  try {
    await sendWelcomeEmail({
      to: email,
      name: parsed.data.name,
      temporaryPassword: tempPassword,
    });
  } catch (err) {
    console.error("[createUser] welcome email failed", err);
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

const userIdSchema = z.string().uuid();

export async function resendTemporaryPasswordAction(
  userId: string
): Promise<UserActionResult> {
  await requireAdmin();
  const parsedId = userIdSchema.safeParse(userId);
  if (!parsedId.success) return { ok: false, error: "ID inválido" };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsedId.data))
    .limit(1);

  if (!user) return { ok: false, error: "Usuario no encontrado" };

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(tempPassword);

  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(users.id, user.id));

  try {
    await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      temporaryPassword: tempPassword,
    });
  } catch (err) {
    console.error("[resendTempPassword] email failed", err);
    return { ok: false, error: "No pudimos enviar el mail" };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUserAction(userId: string): Promise<UserActionResult> {
  const adminUser = await requireAdmin();
  const parsedId = userIdSchema.safeParse(userId);
  if (!parsedId.success) return { ok: false, error: "ID inválido" };

  if (parsedId.data === adminUser.id) {
    return { ok: false, error: "No podés borrarte a vos mismo" };
  }

  await db.delete(users).where(eq(users.id, parsedId.data));
  revalidatePath("/admin/users");
  return { ok: true };
}

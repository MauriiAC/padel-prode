"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tournaments } from "@/db/schema";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type TournamentActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().uuid();

const createTournamentSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(120),
});

export type CreateTournamentState = { error?: string } | undefined;

export async function createTournamentAction(
  _prev: CreateTournamentState,
  formData: FormData
): Promise<CreateTournamentState> {
  await requireAdmin();
  const parsed = createTournamentSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const [row] = await db
    .insert(tournaments)
    .values({ name: parsed.data.name, status: "draft" })
    .returning({ id: tournaments.id });

  revalidatePath("/admin/tournaments");
  redirect(`/admin/tournaments/${row.id}`);
}

const updateTournamentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export async function updateTournamentAction(
  formData: FormData
): Promise<TournamentActionResult> {
  await requireAdmin();
  const parsed = updateTournamentSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await db
    .update(tournaments)
    .set({ name: parsed.data.name })
    .where(eq(tournaments.id, parsed.data.id));

  revalidatePath(`/admin/tournaments/${parsed.data.id}`);
  revalidatePath("/admin/tournaments");
  return { ok: true };
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "active", "finished"]),
});

export async function changeTournamentStatusAction(
  id: string,
  status: "draft" | "active" | "finished"
): Promise<TournamentActionResult> {
  await requireAdmin();
  const parsed = statusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  await db
    .update(tournaments)
    .set({ status: parsed.data.status })
    .where(eq(tournaments.id, parsed.data.id));

  revalidatePath(`/admin/tournaments/${parsed.data.id}`);
  revalidatePath("/admin/tournaments");
  revalidatePath("/player/tournaments");
  return { ok: true };
}

export async function deleteTournamentAction(
  id: string
): Promise<TournamentActionResult> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "ID inválido" };

  await db.delete(tournaments).where(eq(tournaments.id, parsed.data));
  revalidatePath("/admin/tournaments");
  return { ok: true };
}

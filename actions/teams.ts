"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { teams, tournaments } from "@/db/schema";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type TeamActionResult = { ok: true } | { ok: false; error: string };

const teamFieldsSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(80),
  player1Name: z.string().min(1, "Jugador 1 requerido").max(80),
  player2Name: z.string().min(1, "Jugador 2 requerido").max(80),
});

const createTeamSchema = teamFieldsSchema.extend({
  tournamentId: z.string().uuid(),
});

export async function createTeamAction(
  formData: FormData
): Promise<TeamActionResult> {
  await requireAdmin();
  const parsed = createTeamSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    name: formData.get("name"),
    player1Name: formData.get("player1Name"),
    player2Name: formData.get("player2Name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const [t] = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.id, parsed.data.tournamentId))
    .limit(1);
  if (!t) return { ok: false, error: "Torneo no encontrado" };

  await db.insert(teams).values(parsed.data);

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/teams`);
  return { ok: true };
}

const updateTeamSchema = teamFieldsSchema.extend({
  id: z.string().uuid(),
  tournamentId: z.string().uuid(),
});

export async function updateTeamAction(
  formData: FormData
): Promise<TeamActionResult> {
  await requireAdmin();
  const parsed = updateTeamSchema.safeParse({
    id: formData.get("id"),
    tournamentId: formData.get("tournamentId"),
    name: formData.get("name"),
    player1Name: formData.get("player1Name"),
    player2Name: formData.get("player2Name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await db
    .update(teams)
    .set({
      name: parsed.data.name,
      player1Name: parsed.data.player1Name,
      player2Name: parsed.data.player2Name,
    })
    .where(eq(teams.id, parsed.data.id));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/teams`);
  return { ok: true };
}

const deleteTeamSchema = z.object({
  id: z.string().uuid(),
  tournamentId: z.string().uuid(),
});

export async function deleteTeamAction(
  id: string,
  tournamentId: string
): Promise<TeamActionResult> {
  await requireAdmin();
  const parsed = deleteTeamSchema.safeParse({ id, tournamentId });
  if (!parsed.success) return { ok: false, error: "ID inválido" };

  await db.delete(teams).where(eq(teams.id, parsed.data.id));
  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/teams`);
  return { ok: true };
}

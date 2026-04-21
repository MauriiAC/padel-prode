"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { rounds } from "@/db/schema";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type RoundActionResult = { ok: true } | { ok: false; error: string };

type RoundStatus = "sin_abrir" | "abierta" | "cerrada";

const LEGAL_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  sin_abrir: ["abierta"],
  abierta: ["cerrada"],
  cerrada: [],
};

const changeSchema = z.object({
  roundId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  next: z.enum(["sin_abrir", "abierta", "cerrada"]),
});

export async function changeRoundStatusAction(
  roundId: string,
  tournamentId: string,
  next: RoundStatus
): Promise<RoundActionResult> {
  await requireAdmin();
  const parsed = changeSchema.safeParse({ roundId, tournamentId, next });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  const [current] = await db
    .select({ status: rounds.status })
    .from(rounds)
    .where(eq(rounds.id, parsed.data.roundId))
    .limit(1);

  if (!current) return { ok: false, error: "Ronda no encontrada" };

  const allowed = LEGAL_TRANSITIONS[current.status];
  if (!allowed.includes(parsed.data.next)) {
    return {
      ok: false,
      error: `Transición ${current.status} → ${parsed.data.next} no permitida`,
    };
  }

  await db
    .update(rounds)
    .set({ status: parsed.data.next })
    .where(eq(rounds.id, parsed.data.roundId));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/rounds`);
  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/matches`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/groups`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/ranking`);
  return { ok: true };
}

"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { matches, predictions, rounds } from "@/db/schema";

export type PredictionActionResult = { ok: true } | { ok: false; error: string };

const upsertSchema = z.object({
  matchId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  winnerTeamId: z.string().uuid(),
  sets: z.union([z.literal(2), z.literal(3)]),
});

export async function upsertPredictionAction(
  matchId: string,
  tournamentId: string,
  winnerTeamId: string,
  sets: 2 | 3
): Promise<PredictionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "No autenticado" };

  const parsed = upsertSchema.safeParse({
    matchId,
    tournamentId,
    winnerTeamId,
    sets,
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  const [row] = await db
    .select({ status: rounds.status })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, parsed.data.matchId))
    .limit(1);

  if (!row) return { ok: false, error: "Partido no encontrado" };
  if (row.status !== "abierta") {
    return { ok: false, error: "La ronda no está abierta para pronósticos" };
  }

  const existing = await db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.matchId, parsed.data.matchId),
        eq(predictions.userId, session.user.id)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(predictions)
      .set({
        predictedWinnerTeamId: parsed.data.winnerTeamId,
        predictedSets: parsed.data.sets,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(predictions.matchId, parsed.data.matchId),
          eq(predictions.userId, session.user.id)
        )
      );
  } else {
    await db.insert(predictions).values({
      matchId: parsed.data.matchId,
      userId: session.user.id,
      predictedWinnerTeamId: parsed.data.winnerTeamId,
      predictedSets: parsed.data.sets,
    });
  }

  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/groups`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/ranking`);
  return { ok: true };
}

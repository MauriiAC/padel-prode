"use server";

import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
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

const batchItemSchema = z.object({
  matchId: z.string().uuid(),
  winnerTeamId: z.string().uuid(),
  sets: z.union([z.literal(2), z.literal(3)]),
});

const batchSchema = z.object({
  tournamentId: z.string().uuid(),
  items: z.array(batchItemSchema).min(1),
});

export type BatchPredictionResult =
  | { ok: true; saved: number }
  | { ok: false; error: string };

export async function upsertPredictionsBatchAction(
  tournamentId: string,
  items: Array<{ matchId: string; winnerTeamId: string; sets: 2 | 3 }>
): Promise<BatchPredictionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "No autenticado" };

  const parsed = batchSchema.safeParse({ tournamentId, items });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  // Verify every involved match is in a round with status 'abierta'.
  const matchIds = parsed.data.items.map((i) => i.matchId);
  const matchRows = await db
    .select({
      matchId: matches.id,
      status: rounds.status,
      tournamentId: rounds.tournamentId,
    })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(inArray(matches.id, matchIds));

  const byId = new Map(matchRows.map((r) => [r.matchId, r]));

  for (const it of parsed.data.items) {
    const meta = byId.get(it.matchId);
    if (!meta) {
      return { ok: false, error: "Partido no encontrado" };
    }
    if (meta.tournamentId !== parsed.data.tournamentId) {
      return { ok: false, error: "Partido fuera del torneo" };
    }
    if (meta.status !== "abierta") {
      return {
        ok: false,
        error: "Al menos una ronda no está abierta para pronósticos",
      };
    }
  }

  const userId = session.user.id;
  const now = new Date();

  await db
    .insert(predictions)
    .values(
      parsed.data.items.map((it) => ({
        matchId: it.matchId,
        userId,
        predictedWinnerTeamId: it.winnerTeamId,
        predictedSets: it.sets,
        updatedAt: now,
      }))
    )
    .onConflictDoUpdate({
      target: [predictions.matchId, predictions.userId],
      set: {
        predictedWinnerTeamId: sql`excluded.predicted_winner_team_id`,
        predictedSets: sql`excluded.predicted_sets`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/groups`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/playoff`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/ranking`);
  return { ok: true, saved: parsed.data.items.length };
}

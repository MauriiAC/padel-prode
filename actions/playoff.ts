"use server";

import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { matches, rounds } from "@/db/schema";
import {
  completePlayoffRounds,
  isPowerOfTwo,
} from "@/lib/playoff-completer";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type PlayoffActionResult = { ok: true } | { ok: false; error: string };

export async function ensurePlayoffRoundAction(
  tournamentId: string
): Promise<PlayoffActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(tournamentId).success) {
    return { ok: false, error: "ID inválido" };
  }

  const existing = await db
    .select()
    .from(rounds)
    .where(
      and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "playoff"))
    )
    .limit(1);

  if (existing.length > 0) return { ok: true };

  await db.insert(rounds).values({
    tournamentId,
    kind: "playoff",
    order: 1,
    name: "Primera ronda",
    status: "sin_abrir",
  });

  revalidatePath(`/admin/tournaments/${tournamentId}/playoff`);
  return { ok: true };
}

const addMatchSchema = z.object({
  roundId: z.string().uuid(),
  tournamentId: z.string().uuid(),
});

export async function addPlayoffMatchAction(
  roundId: string,
  tournamentId: string
): Promise<PlayoffActionResult> {
  await requireAdmin();
  const parsed = addMatchSchema.safeParse({ roundId, tournamentId });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, parsed.data.roundId))
    .limit(1);
  if (!round || round.kind !== "playoff") {
    return { ok: false, error: "Ronda no es de playoff" };
  }
  if (round.status !== "sin_abrir") {
    return { ok: false, error: "La ronda debe estar sin abrir" };
  }

  const [maxRow] = await db
    .select({ max: matches.order })
    .from(matches)
    .where(eq(matches.roundId, parsed.data.roundId))
    .orderBy(desc(matches.order))
    .limit(1);
  const nextOrder = (maxRow?.max ?? -1) + 1;

  await db.insert(matches).values({
    roundId: parsed.data.roundId,
    groupId: null,
    order: nextOrder,
    slotAType: "group_position",
    slotARef: null,
    slotBType: "group_position",
    slotBRef: null,
  });

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/playoff`);
  return { ok: true };
}

const updateSlotSchema = z.object({
  matchId: z.string().uuid(),
  side: z.enum(["a", "b"]),
  slotType: z.enum(["group_position", "bye"]),
  slotRef: z.string().nullable(),
  tournamentId: z.string().uuid(),
});

export async function updatePlayoffSlotAction(
  matchId: string,
  side: "a" | "b",
  slotType: "group_position" | "bye",
  slotRef: string | null,
  tournamentId: string
): Promise<PlayoffActionResult> {
  await requireAdmin();
  const parsed = updateSlotSchema.safeParse({
    matchId,
    side,
    slotType,
    slotRef,
    tournamentId,
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  const [row] = await db
    .select({
      match: matches,
      roundStatus: rounds.status,
    })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, parsed.data.matchId))
    .limit(1);

  if (!row) return { ok: false, error: "Partido no encontrado" };
  if (row.roundStatus !== "sin_abrir") {
    return { ok: false, error: "La ronda no está sin abrir" };
  }

  const updateData =
    parsed.data.side === "a"
      ? {
          slotAType: parsed.data.slotType,
          slotARef:
            parsed.data.slotType === "bye" ? null : parsed.data.slotRef,
        }
      : {
          slotBType: parsed.data.slotType,
          slotBRef:
            parsed.data.slotType === "bye" ? null : parsed.data.slotRef,
        };

  await db
    .update(matches)
    .set(updateData)
    .where(eq(matches.id, parsed.data.matchId));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/playoff`);
  return { ok: true };
}

export async function deletePlayoffMatchAction(
  matchId: string,
  tournamentId: string
): Promise<PlayoffActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(matchId).success) {
    return { ok: false, error: "ID inválido" };
  }

  const [row] = await db
    .select({ roundStatus: rounds.status })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) return { ok: false, error: "Partido no encontrado" };
  if (row.roundStatus !== "sin_abrir") {
    return { ok: false, error: "La ronda no está sin abrir" };
  }

  await db.delete(matches).where(eq(matches.id, matchId));

  revalidatePath(`/admin/tournaments/${tournamentId}/playoff`);
  return { ok: true };
}

export async function completePlayoffRoundsAction(
  tournamentId: string
): Promise<PlayoffActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(tournamentId).success) {
    return { ok: false, error: "ID inválido" };
  }

  const playoffRounds = await db
    .select()
    .from(rounds)
    .where(
      and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "playoff"))
    )
    .orderBy(asc(rounds.order));

  if (playoffRounds.length === 0) {
    return { ok: false, error: "No hay rondas de playoff" };
  }
  if (playoffRounds.length > 1) {
    return {
      ok: false,
      error: "Ya hay rondas posteriores. Borrá las generadas primero.",
    };
  }

  const firstRound = playoffRounds[0];
  const firstMatches = await db
    .select({ id: matches.id, order: matches.order })
    .from(matches)
    .where(eq(matches.roundId, firstRound.id))
    .orderBy(asc(matches.order));

  if (!isPowerOfTwo(firstMatches.length)) {
    return {
      ok: false,
      error: `La primera ronda tiene ${firstMatches.length} partidos. Debe ser potencia de 2 (usá byes para balancear).`,
    };
  }

  if (firstMatches.length === 1) {
    return {
      ok: false,
      error: "Ya es la final; no hay rondas siguientes que generar.",
    };
  }

  const planned = completePlayoffRounds(firstMatches, firstRound.order);

  const syntheticToUuid = new Map<string, string>();
  for (const pr of planned) {
    const [insertedRound] = await db
      .insert(rounds)
      .values({
        tournamentId,
        kind: "playoff",
        order: pr.order,
        name: pr.name,
        status: "sin_abrir",
      })
      .returning({ id: rounds.id });

    const matchValues = pr.matches.map((m) => {
      const uuid = crypto.randomUUID();
      const syntheticId = `round${pr.order}-${m.order}`;
      syntheticToUuid.set(syntheticId, uuid);

      const slotARef =
        m.slotARef.startsWith("round") && syntheticToUuid.has(m.slotARef)
          ? syntheticToUuid.get(m.slotARef)!
          : m.slotARef;
      const slotBRef =
        m.slotBRef.startsWith("round") && syntheticToUuid.has(m.slotBRef)
          ? syntheticToUuid.get(m.slotBRef)!
          : m.slotBRef;

      return {
        id: uuid,
        roundId: insertedRound.id,
        groupId: null,
        order: m.order,
        slotAType: m.slotAType,
        slotARef,
        slotBType: m.slotBType,
        slotBRef,
      };
    });

    await db.insert(matches).values(matchValues);
  }

  revalidatePath(`/admin/tournaments/${tournamentId}/playoff`);
  revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
  revalidatePath(`/admin/tournaments/${tournamentId}/rounds`);
  revalidatePath(`/player/tournaments/${tournamentId}/playoff`);
  return { ok: true };
}

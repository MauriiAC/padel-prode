"use server";

import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  groups,
  groupTeams,
  matches,
  rounds,
  predictions,
  teams as teamsTable,
} from "@/db/schema";
import { generateMatchesForGroup } from "@/lib/match-generator";
import {
  computeAffectedMatches,
  diffResolvedMatches,
} from "@/lib/invalidation";
import type { SlotResolverCtx } from "@/lib/slot-resolver";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type MatchActionResult =
  | { ok: true; regenerated: string[]; skipped: string[]; invalid: string[] }
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; requiresConfirmation: true; affectedCount: number };

export async function generateGroupMatchesAction(
  tournamentId: string
): Promise<MatchActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(tournamentId).success) {
    return { ok: false, error: "ID inválido" };
  }

  // Ensure a groups round exists
  let [round] = await db
    .select()
    .from(rounds)
    .where(
      and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "groups"))
    )
    .limit(1);

  if (!round) {
    const [created] = await db
      .insert(rounds)
      .values({
        tournamentId,
        kind: "groups",
        order: 0,
        name: "Fase de grupos",
        status: "sin_abrir",
      })
      .returning();
    round = created;
  }

  const groupRows = await db
    .select()
    .from(groups)
    .where(eq(groups.tournamentId, tournamentId))
    .orderBy(asc(groups.order));

  const regenerated: string[] = [];
  const skipped: string[] = [];
  const invalid: string[] = [];

  for (const group of groupRows) {
    const teamsInGroup = await db
      .select({ teamId: groupTeams.teamId })
      .from(groupTeams)
      .where(eq(groupTeams.groupId, group.id));
    const teamIds = teamsInGroup.map((t) => t.teamId).sort();

    if (teamIds.length !== 3 && teamIds.length !== 4) {
      invalid.push(group.id);
      continue;
    }

    const existing = await db
      .select()
      .from(matches)
      .where(eq(matches.groupId, group.id));

    const existingTeamIds = new Set<string>();
    for (const m of existing) {
      if (m.slotAType === "team" && m.slotARef)
        existingTeamIds.add(m.slotARef);
      if (m.slotBType === "team" && m.slotBRef)
        existingTeamIds.add(m.slotBRef);
    }

    const teamSetSame =
      teamIds.length === existingTeamIds.size &&
      teamIds.every((id) => existingTeamIds.has(id));

    if (teamSetSame && existing.length > 0) {
      skipped.push(group.id);
      continue;
    }

    if (existing.length > 0) {
      await db.delete(matches).where(eq(matches.groupId, group.id));
    }

    const generated = generateMatchesForGroup(teamIds);

    const tempIdToUuid = new Map<string, string>();
    const firstWave = generated
      .filter((g) => g.slotAType === "team" && g.slotBType === "team")
      .map((g) => ({
        ...g,
        uuid: crypto.randomUUID(),
      }));
    for (const g of firstWave) tempIdToUuid.set(g.tempId, g.uuid);

    const secondWave = generated
      .filter((g) => g.slotAType !== "team" || g.slotBType !== "team")
      .map((g) => ({
        ...g,
        uuid: crypto.randomUUID(),
        slotARef:
          g.slotAType === "team"
            ? g.slotARef
            : tempIdToUuid.get(g.slotARef!) ?? null,
        slotBRef:
          g.slotBType === "team"
            ? g.slotBRef
            : tempIdToUuid.get(g.slotBRef!) ?? null,
      }));

    const toInsert = [...firstWave, ...secondWave].map((g) => ({
      id: g.uuid,
      roundId: round!.id,
      groupId: group.id,
      order: g.order,
      slotAType: g.slotAType,
      slotARef: g.slotARef,
      slotBType: g.slotBType,
      slotBRef: g.slotBRef,
    }));

    await db.insert(matches).values(toInsert);
    regenerated.push(group.id);
  }

  revalidatePath(`/admin/tournaments/${tournamentId}/groups`);
  revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
  revalidatePath(`/player/tournaments/${tournamentId}/groups`);

  return { ok: true, regenerated, skipped, invalid };
}

const resultSchema = z.object({
  matchId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  winnerTeamId: z.string().uuid().nullable(),
  sets: z.union([z.literal(2), z.literal(3)]).nullable(),
});

export async function setMatchResultAction(
  matchId: string,
  tournamentId: string,
  winnerTeamId: string | null,
  sets: 2 | 3 | null,
  confirm: boolean = false
): Promise<MatchActionResult> {
  await requireAdmin();
  const parsed = resultSchema.safeParse({
    matchId,
    tournamentId,
    winnerTeamId,
    sets,
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  const [row] = await db
    .select({
      matchId: matches.id,
      roundStatus: rounds.status,
    })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, parsed.data.matchId))
    .limit(1);

  if (!row) return { ok: false, error: "Partido no encontrado" };
  if (row.roundStatus === "sin_abrir") {
    return {
      ok: false,
      error: "No se puede cargar resultado con la ronda sin abrir",
    };
  }

  const ctx = await buildInvalidationContextForMatches(tournamentId);
  const change = {
    kind: "match_winner" as const,
    matchId: parsed.data.matchId,
    newWinnerTeamId: parsed.data.winnerTeamId,
  };
  const affected = computeAffectedMatches(ctx, change);
  const affectedWithPreds = await filterMatchesWithPredictionsInActiveRounds(
    affected
  );

  if (affectedWithPreds.length > 0 && !confirm) {
    return {
      ok: false,
      requiresConfirmation: true,
      affectedCount: affectedWithPreds.length,
    };
  }

  await db.transaction(async (tx) => {
    if (affectedWithPreds.length > 0) {
      await tx
        .delete(predictions)
        .where(inArray(predictions.matchId, affectedWithPreds));
    }
    await tx
      .update(matches)
      .set({
        resultWinnerTeamId: parsed.data.winnerTeamId,
        resultSets: parsed.data.sets,
      })
      .where(eq(matches.id, parsed.data.matchId));
  });

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/matches`);
  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/playoff`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/ranking`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/groups`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/playoff`);
  return { ok: true };
}

async function buildInvalidationContextForMatches(
  tournamentId: string
): Promise<SlotResolverCtx> {
  const [teamsRows, groupTeamsRows, matchesRows] = await Promise.all([
    db
      .select({ id: teamsTable.id, name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.tournamentId, tournamentId)),
    db
      .select({
        groupId: groupTeams.groupId,
        teamId: groupTeams.teamId,
        finalPosition: groupTeams.finalPosition,
      })
      .from(groupTeams)
      .innerJoin(groups, eq(groupTeams.groupId, groups.id))
      .where(eq(groups.tournamentId, tournamentId)),
    db
      .select()
      .from(matches)
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .where(eq(rounds.tournamentId, tournamentId)),
  ]);

  const flatMatches = matchesRows.map((r) => r.matches);

  return {
    teamsById: new Map(teamsRows.map((t) => [t.id, t])),
    groupTeamsByPosition: new Map(
      groupTeamsRows
        .filter((gt) => gt.finalPosition != null)
        .map((gt) => [`${gt.groupId}:${gt.finalPosition}`, gt.teamId])
    ),
    matchesById: new Map(
      flatMatches.map((m) => [
        m.id,
        {
          id: m.id,
          slotAType: m.slotAType,
          slotARef: m.slotARef,
          slotBType: m.slotBType,
          slotBRef: m.slotBRef,
          resultWinnerTeamId: m.resultWinnerTeamId,
        },
      ])
    ),
  };
}

async function filterMatchesWithPredictionsInActiveRounds(
  matchIds: string[]
): Promise<string[]> {
  if (matchIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ matchId: predictions.matchId })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(
      and(
        inArray(predictions.matchId, matchIds),
        inArray(rounds.status, ["abierta", "cerrada"])
      )
    );
  return rows.map((r) => r.matchId);
}

const batchResultEntrySchema = z.object({
  matchId: z.string().uuid(),
  winnerTeamId: z.string().uuid().nullable(),
  sets: z.union([z.literal(2), z.literal(3)]).nullable(),
});

const batchResultSchema = z.object({
  tournamentId: z.string().uuid(),
  entries: z.array(batchResultEntrySchema),
});

export async function setMatchResultsBatchAction(
  tournamentId: string,
  entries: Array<{
    matchId: string;
    winnerTeamId: string | null;
    sets: 2 | 3 | null;
  }>,
  confirm: boolean = false
): Promise<MatchActionResult> {
  await requireAdmin();
  const parsed = batchResultSchema.safeParse({ tournamentId, entries });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  if (parsed.data.entries.length === 0) return { ok: true };

  const matchIds = parsed.data.entries.map((e) => e.matchId);
  const rows = await db
    .select({
      matchId: matches.id,
      roundStatus: rounds.status,
      tournamentId: rounds.tournamentId,
    })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(inArray(matches.id, matchIds));

  const metaById = new Map(rows.map((r) => [r.matchId, r]));

  for (const e of parsed.data.entries) {
    const meta = metaById.get(e.matchId);
    if (!meta) return { ok: false, error: "Partido no encontrado" };
    if (meta.tournamentId !== parsed.data.tournamentId) {
      return { ok: false, error: "Partido fuera del torneo" };
    }
    if (meta.roundStatus === "sin_abrir") {
      return {
        ok: false,
        error: "Al menos una ronda sigue sin abrir",
      };
    }
  }

  // Build next ctx with all match_winner changes applied; diff once.
  const ctx = await buildInvalidationContextForMatches(tournamentId);
  const nextMatches = new Map(ctx.matchesById);
  for (const e of parsed.data.entries) {
    const existing = nextMatches.get(e.matchId);
    if (existing) {
      nextMatches.set(e.matchId, {
        ...existing,
        resultWinnerTeamId: e.winnerTeamId,
      });
    }
  }
  const nextCtx: SlotResolverCtx = { ...ctx, matchesById: nextMatches };

  const affected = diffResolvedMatches(ctx, nextCtx);
  const affectedWithPreds = await filterMatchesWithPredictionsInActiveRounds(
    affected
  );

  if (affectedWithPreds.length > 0 && !confirm) {
    return {
      ok: false,
      requiresConfirmation: true,
      affectedCount: affectedWithPreds.length,
    };
  }

  await db.transaction(async (tx) => {
    if (affectedWithPreds.length > 0) {
      await tx
        .delete(predictions)
        .where(inArray(predictions.matchId, affectedWithPreds));
    }
    for (const e of parsed.data.entries) {
      await tx
        .update(matches)
        .set({
          resultWinnerTeamId: e.winnerTeamId,
          resultSets: e.sets,
        })
        .where(eq(matches.id, e.matchId));
    }
  });

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/matches`);
  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/playoff`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/ranking`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/groups`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/playoff`);
  return { ok: true };
}

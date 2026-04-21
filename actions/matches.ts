"use server";

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { groups, groupTeams, matches, rounds } from "@/db/schema";
import { generateMatchesForGroup } from "@/lib/match-generator";

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
  | { ok: false; error: string };

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
  sets: 2 | 3 | null
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

  await db
    .update(matches)
    .set({
      resultWinnerTeamId: parsed.data.winnerTeamId,
      resultSets: parsed.data.sets,
    })
    .where(eq(matches.id, parsed.data.matchId));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/matches`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/ranking`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/groups`);
  return { ok: true };
}

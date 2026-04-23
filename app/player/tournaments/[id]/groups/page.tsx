import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  groups,
  groupTeams,
  matches,
  predictions,
  rounds,
  teams,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { resolveSlot, type SlotResolverCtx } from "@/lib/slot-resolver";
import {
  PredictionsPanel,
  type PanelItem,
  type PanelSection,
} from "@/components/predictions/predictions-panel";

export default async function PlayerGroupsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const [teamsRows, groupsRows, groupTeamsRows, groupsRound, allMatches, userPredictions] =
    await Promise.all([
      db.select().from(teams).where(eq(teams.tournamentId, tournamentId)),
      db
        .select()
        .from(groups)
        .where(eq(groups.tournamentId, tournamentId))
        .orderBy(asc(groups.order)),
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
        .from(rounds)
        .where(
          and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "groups"))
        )
        .limit(1),
      db
        .select()
        .from(matches)
        .innerJoin(rounds, eq(matches.roundId, rounds.id))
        .where(
          and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "groups"))
        ),
      db
        .select()
        .from(predictions)
        .where(eq(predictions.userId, session.user.id)),
    ]);

  const round = groupsRound[0];
  if (!round) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Aún no hay fase de grupos configurada.
      </div>
    );
  }

  if (round.status === "sin_abrir") {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        La fase de grupos todavía no está abierta para pronósticos.
      </div>
    );
  }

  const flatMatches = allMatches.map((r) => r.matches);

  const ctx: SlotResolverCtx = {
    teamsById: new Map(teamsRows.map((t) => [t.id, { id: t.id, name: t.name }])),
    groupTeamsByPosition: new Map(
      groupTeamsRows
        .filter((gt) => gt.finalPosition != null)
        .map((gt) => [`${gt.groupId}:${gt.finalPosition}`, gt.teamId])
    ),
    matchesById: new Map(flatMatches.map((m) => [m.id, m])),
  };

  const predictionByMatch = new Map(
    userPredictions.map((p) => [p.matchId, p])
  );

  const matchesByGroup = new Map<string, typeof flatMatches>();
  for (const m of flatMatches) {
    if (!m.groupId) continue;
    const arr = matchesByGroup.get(m.groupId) ?? [];
    arr.push(m);
    matchesByGroup.set(m.groupId, arr);
  }

  const locked = round.status === "cerrada";

  const sections: PanelSection[] = groupsRows.map((g) => {
    const grpMatches = (matchesByGroup.get(g.id) ?? []).sort(
      (a, b) => a.order - b.order
    );
    const items: PanelItem[] = [];
    for (const m of grpMatches) {
      const slotA = resolveSlot({ type: m.slotAType, ref: m.slotARef }, ctx);
      const slotB = resolveSlot({ type: m.slotBType, ref: m.slotBRef }, ctx);
      if (slotA.isBye || slotB.isBye) continue;
      if (!slotA.team || !slotB.team) {
        items.push({
          kind: "pending",
          key: m.id,
          label: "Partido pendiente (esperando resultados anteriores)",
        });
        continue;
      }
      const pred = predictionByMatch.get(m.id) ?? null;
      items.push({
        kind: "playable",
        matchId: m.id,
        teamA: slotA.team,
        teamB: slotB.team,
        resultWinnerId: m.resultWinnerTeamId,
        resultSets: m.resultSets as 2 | 3 | null,
        initialPrediction: pred
          ? {
              winnerTeamId: pred.predictedWinnerTeamId,
              sets: pred.predictedSets as 2 | 3,
            }
          : null,
      });
    }
    return {
      id: g.id,
      title: g.name,
      locked,
      items,
    };
  });

  return (
    <>
      <div className="text-xs text-muted-foreground">
        Ronda: {round.status === "abierta" ? "abierta" : "cerrada (read-only)"}
      </div>
      <PredictionsPanel tournamentId={tournamentId} sections={sections} />
    </>
  );
}

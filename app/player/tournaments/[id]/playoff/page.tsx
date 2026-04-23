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

export default async function PlayerPlayoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const [teamsRows, groupTeamsRows, playoffRounds, allMatches, userPredictions] =
    await Promise.all([
      db.select().from(teams).where(eq(teams.tournamentId, tournamentId)),
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
          and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "playoff"))
        )
        .orderBy(asc(rounds.order)),
      db
        .select()
        .from(matches)
        .innerJoin(rounds, eq(matches.roundId, rounds.id))
        .where(
          and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "playoff"))
        )
        .orderBy(asc(matches.order)),
      db
        .select()
        .from(predictions)
        .where(eq(predictions.userId, session.user.id)),
    ]);

  if (playoffRounds.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Aún no hay cuadro de playoff configurado.
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

  const sections: PanelSection[] = [];
  for (const round of playoffRounds) {
    if (round.status === "sin_abrir") {
      sections.push({
        id: round.id,
        title: round.name,
        subtitle: "Ronda sin abrir",
        locked: true,
        items: [],
      });
      continue;
    }

    const roundMatches = flatMatches
      .filter((m) => m.roundId === round.id)
      .sort((a, b) => a.order - b.order);
    const locked = round.status === "cerrada";

    const items: PanelItem[] = [];
    for (const m of roundMatches) {
      const slotA = resolveSlot({ type: m.slotAType, ref: m.slotARef }, ctx);
      const slotB = resolveSlot({ type: m.slotBType, ref: m.slotBRef }, ctx);
      if (slotA.isBye || slotB.isBye) continue;
      if (!slotA.team || !slotB.team) {
        items.push({
          kind: "pending",
          key: m.id,
          label: "Partido pendiente (esperando ronda anterior)",
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

    sections.push({
      id: round.id,
      title: round.name,
      subtitle: locked ? "Cerrada (read-only)" : "Abierta",
      locked,
      items,
    });
  }

  return <PredictionsPanel tournamentId={tournamentId} sections={sections} />;
}

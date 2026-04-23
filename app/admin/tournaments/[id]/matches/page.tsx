import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  groups,
  groupTeams,
  matches,
  rounds,
  teams,
} from "@/db/schema";
import { resolveSlot, type SlotResolverCtx } from "@/lib/slot-resolver";
import {
  ResultsPanel,
  type PanelMatchItem,
  type ResultsSection,
} from "./results-panel";

const ROUND_STATUS_LABEL: Record<"sin_abrir" | "abierta" | "cerrada", string> = {
  sin_abrir: "Ronda sin abrir",
  abierta: "Ronda abierta",
  cerrada: "Ronda cerrada",
};

export default async function TournamentMatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  const [teamsRows, groupsRows, groupTeamsRows, roundsRows, matchesRows] =
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
        .where(eq(rounds.tournamentId, tournamentId))
        .orderBy(asc(rounds.order)),
      db
        .select()
        .from(matches)
        .innerJoin(rounds, eq(matches.roundId, rounds.id))
        .where(eq(rounds.tournamentId, tournamentId))
        .orderBy(asc(matches.order)),
    ]);

  if (roundsRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No hay rondas todavía. Generá partidos desde &quot;Zonas&quot;.
      </div>
    );
  }

  const flatMatches = matchesRows.map((r) => r.matches);

  const ctx: SlotResolverCtx = {
    teamsById: new Map(teamsRows.map((t) => [t.id, { id: t.id, name: t.name }])),
    groupTeamsByPosition: new Map(
      groupTeamsRows
        .filter((gt) => gt.finalPosition != null)
        .map((gt) => [`${gt.groupId}:${gt.finalPosition}`, gt.teamId])
    ),
    matchesById: new Map(flatMatches.map((m) => [m.id, m])),
  };

  const roundById = new Map(roundsRows.map((r) => [r.id, r]));

  const matchesByGroup = new Map<string, typeof flatMatches>();
  const matchesByPlayoffRound = new Map<string, typeof flatMatches>();
  for (const m of flatMatches) {
    if (m.groupId) {
      const arr = matchesByGroup.get(m.groupId) ?? [];
      arr.push(m);
      matchesByGroup.set(m.groupId, arr);
    } else {
      const round = roundById.get(m.roundId);
      if (round?.kind === "playoff") {
        const arr = matchesByPlayoffRound.get(m.roundId) ?? [];
        arr.push(m);
        matchesByPlayoffRound.set(m.roundId, arr);
      }
    }
  }

  function itemsForMatches(ms: typeof flatMatches): PanelMatchItem[] {
    const items: PanelMatchItem[] = [];
    for (const m of ms.sort((a, b) => a.order - b.order)) {
      const slotA = resolveSlot({ type: m.slotAType, ref: m.slotARef }, ctx);
      const slotB = resolveSlot({ type: m.slotBType, ref: m.slotBRef }, ctx);
      const hasBye = slotA.isBye || slotB.isBye;
      if (hasBye) {
        items.push({
          kind: "bye",
          key: m.id,
          label: "Bye — sin resultado a cargar",
        });
        continue;
      }
      if (!slotA.team || !slotB.team) {
        items.push({
          kind: "pending",
          key: m.id,
          label: "Partido pendiente (esperando resultados previos)",
        });
        continue;
      }
      items.push({
        kind: "playable",
        matchId: m.id,
        teamA: slotA.team,
        teamB: slotB.team,
        initial: {
          winnerTeamId: m.resultWinnerTeamId,
          sets: m.resultSets as 2 | 3 | null,
        },
      });
    }
    return items;
  }

  const sections: ResultsSection[] = [];

  // Groups round: one section per group.
  const groupsRound = roundsRows.find((r) => r.kind === "groups");
  if (groupsRound) {
    const editable = groupsRound.status !== "sin_abrir";
    for (const g of groupsRows) {
      const gm = matchesByGroup.get(g.id) ?? [];
      if (gm.length === 0) continue;
      sections.push({
        id: `group-${g.id}`,
        title: g.name,
        subtitle: ROUND_STATUS_LABEL[groupsRound.status],
        editable,
        items: itemsForMatches(gm),
      });
    }
  }

  // Playoff rounds: one section per round.
  const playoffRounds = roundsRows.filter((r) => r.kind === "playoff");
  for (const round of playoffRounds) {
    const pm = matchesByPlayoffRound.get(round.id) ?? [];
    if (pm.length === 0) continue;
    sections.push({
      id: round.id,
      title: round.name,
      subtitle: ROUND_STATUS_LABEL[round.status],
      editable: round.status !== "sin_abrir",
      items: itemsForMatches(pm),
    });
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No hay partidos cargados todavía.
      </div>
    );
  }

  return <ResultsPanel tournamentId={tournamentId} sections={sections} />;
}

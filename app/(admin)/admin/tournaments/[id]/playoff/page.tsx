import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { groups, groupTeams, matches, rounds, teams } from "@/db/schema";
import { ensurePlayoffRoundAction } from "@/actions/playoff";
import { PlayoffBuilder } from "./playoff-builder";

export default async function TournamentPlayoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  await ensurePlayoffRoundAction(tournamentId);

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

  const playoffRounds = roundsRows.filter((r) => r.kind === "playoff");
  const flatMatches = matchesRows.map((r) => r.matches);
  const playoffRoundIds = new Set(playoffRounds.map((r) => r.id));
  const playoffMatches = flatMatches.filter((m) =>
    playoffRoundIds.has(m.roundId)
  );

  return (
    <PlayoffBuilder
      tournamentId={tournamentId}
      teams={teamsRows.map((t) => ({ id: t.id, name: t.name }))}
      groups={groupsRows.map((g) => ({ id: g.id, name: g.name }))}
      groupTeams={groupTeamsRows.map((gt) => ({
        groupId: gt.groupId,
        teamId: gt.teamId,
        finalPosition: gt.finalPosition,
      }))}
      rounds={playoffRounds.map((r) => ({
        id: r.id,
        name: r.name,
        order: r.order,
        status: r.status,
      }))}
      matches={playoffMatches.map((m) => ({
        id: m.id,
        roundId: m.roundId,
        order: m.order,
        slotAType: m.slotAType,
        slotARef: m.slotARef,
        slotBType: m.slotBType,
        slotBRef: m.slotBRef,
        resultWinnerTeamId: m.resultWinnerTeamId,
      }))}
    />
  );
}

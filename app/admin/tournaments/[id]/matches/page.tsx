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
import { MatchResultForm } from "./match-result-form";

export default async function TournamentMatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  const [teamsRows, groupsRows, groupTeamsRows, roundsRows, matchesRows] =
    await Promise.all([
      db.select().from(teams).where(eq(teams.tournamentId, tournamentId)),
      db.select().from(groups).where(eq(groups.tournamentId, tournamentId)),
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

  const matchesByRound = new Map<string, typeof flatMatches>();
  for (const m of flatMatches) {
    const arr = matchesByRound.get(m.roundId) ?? [];
    arr.push(m);
    matchesByRound.set(m.roundId, arr);
  }

  if (roundsRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No hay rondas todavía. Generá partidos desde &quot;Zonas&quot;.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {roundsRows.map((round) => {
        const roundMatches = matchesByRound.get(round.id) ?? [];
        return (
          <section key={round.id} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium">{round.name}</h2>
              <span className="text-xs text-muted-foreground">
                Estado: {round.status}
              </span>
            </div>

            {roundMatches.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin partidos.</p>
            )}

            <div className="space-y-2">
              {roundMatches.map((m) => {
                const slotA = resolveSlot(
                  { type: m.slotAType, ref: m.slotARef },
                  ctx
                );
                const slotB = resolveSlot(
                  { type: m.slotBType, ref: m.slotBRef },
                  ctx
                );
                const hasBye = slotA.isBye || slotB.isBye;
                const bothReady = !!slotA.team && !!slotB.team;

                return (
                  <div
                    key={m.id}
                    className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="text-sm">
                      <span className="font-medium">
                        {slotA.team?.name ??
                          (slotA.isBye ? "(bye)" : "Pendiente")}
                      </span>
                      <span className="text-muted-foreground mx-2">vs</span>
                      <span className="font-medium">
                        {slotB.team?.name ??
                          (slotB.isBye ? "(bye)" : "Pendiente")}
                      </span>
                    </div>
                    {hasBye ? (
                      <span className="text-xs text-muted-foreground">
                        Bye — sin pronóstico
                      </span>
                    ) : bothReady && round.status !== "sin_abrir" ? (
                      <MatchResultForm
                        tournamentId={tournamentId}
                        matchId={m.id}
                        teamA={slotA.team!}
                        teamB={slotB.team!}
                        currentWinnerId={m.resultWinnerTeamId}
                        currentSets={m.resultSets as 2 | 3 | null}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {round.status === "sin_abrir"
                          ? "Ronda sin abrir"
                          : "Pendiente"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

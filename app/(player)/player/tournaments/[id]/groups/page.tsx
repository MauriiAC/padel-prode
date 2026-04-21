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
import { MatchPrediction } from "./match-prediction";

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

  return (
    <div className="space-y-6">
      <div className="text-xs text-muted-foreground">
        Ronda: {round.status === "abierta" ? "abierta" : "cerrada (read-only)"}
      </div>
      {groupsRows.map((g) => {
        const grpMatches = (matchesByGroup.get(g.id) ?? []).sort(
          (a, b) => a.order - b.order
        );
        return (
          <section key={g.id} className="space-y-2">
            <h2 className="text-base font-semibold">{g.name}</h2>
            {grpMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin partidos.</p>
            ) : (
              <div className="space-y-2">
                {grpMatches.map((m) => {
                  const slotA = resolveSlot(
                    { type: m.slotAType, ref: m.slotARef },
                    ctx
                  );
                  const slotB = resolveSlot(
                    { type: m.slotBType, ref: m.slotBRef },
                    ctx
                  );
                  if (slotA.isBye || slotB.isBye) return null;
                  if (!slotA.team || !slotB.team) {
                    return (
                      <div
                        key={m.id}
                        className="rounded-lg border p-3 text-xs text-muted-foreground"
                      >
                        Partido pendiente (esperando resultados anteriores)
                      </div>
                    );
                  }
                  const pred = predictionByMatch.get(m.id) ?? null;
                  return (
                    <MatchPrediction
                      key={m.id}
                      tournamentId={tournamentId}
                      matchId={m.id}
                      teamA={slotA.team}
                      teamB={slotB.team}
                      resultWinnerId={m.resultWinnerTeamId}
                      resultSets={m.resultSets as 2 | 3 | null}
                      initialPrediction={
                        pred
                          ? {
                              winnerTeamId: pred.predictedWinnerTeamId,
                              sets: pred.predictedSets as 2 | 3,
                            }
                          : null
                      }
                      locked={locked}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

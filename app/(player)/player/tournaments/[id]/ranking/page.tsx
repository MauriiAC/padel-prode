import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, rounds, users } from "@/db/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeRanking } from "@/lib/scoring";

export default async function PlayerRankingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  const [usersRows, tournamentMatches, allPredictions] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users),
    db
      .select({
        id: matches.id,
        resultWinnerTeamId: matches.resultWinnerTeamId,
        resultSets: matches.resultSets,
      })
      .from(matches)
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .where(eq(rounds.tournamentId, tournamentId)),
    db
      .select({
        matchId: predictions.matchId,
        userId: predictions.userId,
        predictedWinnerTeamId: predictions.predictedWinnerTeamId,
        predictedSets: predictions.predictedSets,
      })
      .from(predictions)
      .innerJoin(matches, eq(predictions.matchId, matches.id))
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .where(eq(rounds.tournamentId, tournamentId)),
  ]);

  const ranking = computeRanking(
    usersRows,
    tournamentMatches.map((m) => ({
      id: m.id,
      resultWinnerTeamId: m.resultWinnerTeamId,
      resultSets: m.resultSets,
    })),
    allPredictions.map((p) => ({
      matchId: p.matchId,
      userId: p.userId,
      predictedWinnerTeamId: p.predictedWinnerTeamId,
      predictedSets: p.predictedSets,
    }))
  );

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Ranking</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[1%]">#</TableHead>
            <TableHead>Jugador</TableHead>
            <TableHead className="text-right">Puntos</TableHead>
            <TableHead className="text-right">Aciertos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.map((r, i) => (
            <TableRow key={r.userId}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell className="text-right font-medium">
                {r.points}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {r.correctWinners}
              </TableCell>
            </TableRow>
          ))}
          {ranking.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Sin datos todavía.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

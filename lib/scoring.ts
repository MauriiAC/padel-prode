export type MatchResult = {
  resultWinnerTeamId: string | null;
  resultSets: number | null;
};

export type Prediction = {
  predictedWinnerTeamId: string;
  predictedSets: number;
};

export function computeScore(
  prediction: Prediction | null,
  match: MatchResult
): 0 | 1 | 2 {
  if (!prediction) return 0;
  if (match.resultWinnerTeamId == null || match.resultSets == null) return 0;
  if (prediction.predictedWinnerTeamId !== match.resultWinnerTeamId) return 0;
  if (prediction.predictedSets !== match.resultSets) return 1;
  return 2;
}

export type RankingRow = {
  userId: string;
  name: string;
  points: number;
  correctWinners: number;
};

type UserRef = { id: string; name: string };
type MatchRef = { id: string } & MatchResult;
type PredictionRef = { matchId: string; userId: string } & Prediction;

export function computeRanking(
  users: UserRef[],
  matches: MatchRef[],
  predictions: PredictionRef[]
): RankingRow[] {
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const rows: RankingRow[] = users.map((u) => ({
    userId: u.id,
    name: u.name,
    points: 0,
    correctWinners: 0,
  }));
  const rowByUser = new Map(rows.map((r) => [r.userId, r]));

  for (const p of predictions) {
    const row = rowByUser.get(p.userId);
    const match = matchById.get(p.matchId);
    if (!row || !match) continue;

    const score = computeScore(p, match);
    row.points += score;
    if (score >= 1) row.correctWinners += 1;
  }

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.correctWinners !== a.correctWinners)
      return b.correctWinners - a.correctWinners;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

export type SlotType =
  | "team"
  | "bye"
  | "group_position"
  | "match_winner"
  | "match_loser";

export type PlannedMatch = {
  order: number;
  slotAType: SlotType;
  slotARef: string;
  slotBType: SlotType;
  slotBRef: string;
};

export type PlannedRound = {
  order: number;
  name: string;
  matches: PlannedMatch[];
};

export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

const ROUND_NAMES: Record<number, string> = {
  1: "Final",
  2: "Semifinales",
  4: "Cuartos de final",
  8: "Octavos de final",
  16: "16vos de final",
  32: "32vos de final",
  64: "64vos de final",
};

export function playoffRoundName(matchCount: number): string {
  return ROUND_NAMES[matchCount] ?? `Ronda de ${matchCount}`;
}

export function completePlayoffRounds(
  firstRoundMatches: { id: string; order: number }[],
  firstRoundOrder: number
): PlannedRound[] {
  if (!isPowerOfTwo(firstRoundMatches.length)) {
    throw new Error(
      `First round must have power-of-2 matches (got ${firstRoundMatches.length}). Use bye slots to balance.`
    );
  }
  if (firstRoundMatches.length === 1) return [];

  const rounds: PlannedRound[] = [];
  const sorted = [...firstRoundMatches].sort((a, b) => a.order - b.order);
  let previous: { id: string }[] = sorted;
  let currentOrder = firstRoundOrder + 1;

  while (previous.length > 1) {
    const matches: PlannedMatch[] = [];
    const nextMatchIds: string[] = [];
    for (let i = 0; i < previous.length; i += 2) {
      const a = previous[i];
      const b = previous[i + 1];
      const syntheticId = `round${currentOrder}-${i / 2}`;
      nextMatchIds.push(syntheticId);
      matches.push({
        order: i / 2,
        slotAType: "match_winner",
        slotARef: a.id,
        slotBType: "match_winner",
        slotBRef: b.id,
      });
    }
    rounds.push({
      order: currentOrder,
      name: playoffRoundName(matches.length),
      matches,
    });
    previous = nextMatchIds.map((id) => ({ id }));
    currentOrder += 1;
  }

  return rounds;
}

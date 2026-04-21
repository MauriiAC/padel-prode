import { describe, it, expect } from "vitest";
import { computeScore, computeRanking } from "./scoring";

describe("computeScore", () => {
  const baseMatch = {
    resultWinnerTeamId: "A",
    resultSets: 2 as 2 | 3,
  };

  it("returns 0 when no prediction", () => {
    expect(computeScore(null, baseMatch)).toBe(0);
  });

  it("returns 0 when match has no result", () => {
    const p = { predictedWinnerTeamId: "A", predictedSets: 2 as 2 | 3 };
    expect(
      computeScore(p, { resultWinnerTeamId: null, resultSets: null })
    ).toBe(0);
  });

  it("returns 0 when winner wrong", () => {
    const p = { predictedWinnerTeamId: "B", predictedSets: 2 as 2 | 3 };
    expect(computeScore(p, baseMatch)).toBe(0);
  });

  it("returns 1 when winner correct but sets wrong", () => {
    const p = { predictedWinnerTeamId: "A", predictedSets: 3 as 2 | 3 };
    expect(computeScore(p, baseMatch)).toBe(1);
  });

  it("returns 2 when winner correct and sets correct", () => {
    const p = { predictedWinnerTeamId: "A", predictedSets: 2 as 2 | 3 };
    expect(computeScore(p, baseMatch)).toBe(2);
  });
});

describe("computeRanking", () => {
  const userA = { id: "u1", name: "Alice" };
  const userB = { id: "u2", name: "Bob" };
  const userC = { id: "u3", name: "Carla" };

  it("returns empty for no users", () => {
    expect(computeRanking([], [], [])).toEqual([]);
  });

  it("sums scores across matches per user", () => {
    const users = [userA, userB];
    const matches = [
      { id: "m1", resultWinnerTeamId: "T1", resultSets: 2 as 2 | 3 },
      { id: "m2", resultWinnerTeamId: "T2", resultSets: 3 as 2 | 3 },
    ];
    const predictions = [
      {
        matchId: "m1",
        userId: "u1",
        predictedWinnerTeamId: "T1",
        predictedSets: 2 as 2 | 3,
      },
      {
        matchId: "m2",
        userId: "u1",
        predictedWinnerTeamId: "T2",
        predictedSets: 2 as 2 | 3,
      },
      {
        matchId: "m1",
        userId: "u2",
        predictedWinnerTeamId: "T2",
        predictedSets: 2 as 2 | 3,
      },
    ];
    const ranking = computeRanking(users, matches, predictions);
    expect(ranking[0].userId).toBe("u1");
    expect(ranking[0].points).toBe(3);
    expect(ranking[1].userId).toBe("u2");
    expect(ranking[1].points).toBe(0);
  });

  it("ties break by number of correct winners", () => {
    const users = [userA, userB];
    const matches = [
      { id: "m1", resultWinnerTeamId: "T1", resultSets: 2 as 2 | 3 },
      { id: "m2", resultWinnerTeamId: "T2", resultSets: 2 as 2 | 3 },
    ];
    const predictions = [
      {
        matchId: "m1",
        userId: "u1",
        predictedWinnerTeamId: "T1",
        predictedSets: 2 as 2 | 3,
      },
      {
        matchId: "m1",
        userId: "u2",
        predictedWinnerTeamId: "T1",
        predictedSets: 3 as 2 | 3,
      },
      {
        matchId: "m2",
        userId: "u2",
        predictedWinnerTeamId: "T2",
        predictedSets: 3 as 2 | 3,
      },
    ];
    const ranking = computeRanking(users, matches, predictions);
    expect(ranking[0].userId).toBe("u2");
    expect(ranking[1].userId).toBe("u1");
  });

  it("alphabetical tiebreak when points and correct winners equal", () => {
    const users = [userC, userA, userB];
    const ranking = computeRanking(users, [], []);
    expect(ranking.map((r) => r.name)).toEqual(["Alice", "Bob", "Carla"]);
  });
});

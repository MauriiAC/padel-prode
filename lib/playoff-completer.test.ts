import { describe, it, expect } from "vitest";
import {
  completePlayoffRounds,
  playoffRoundName,
  isPowerOfTwo,
} from "./playoff-completer";

describe("isPowerOfTwo", () => {
  it("returns true for 1, 2, 4, 8, 16", () => {
    expect(isPowerOfTwo(1)).toBe(true);
    expect(isPowerOfTwo(2)).toBe(true);
    expect(isPowerOfTwo(4)).toBe(true);
    expect(isPowerOfTwo(8)).toBe(true);
    expect(isPowerOfTwo(16)).toBe(true);
  });
  it("returns false for 0, 3, 5, 6, 7", () => {
    expect(isPowerOfTwo(0)).toBe(false);
    expect(isPowerOfTwo(3)).toBe(false);
    expect(isPowerOfTwo(5)).toBe(false);
    expect(isPowerOfTwo(6)).toBe(false);
    expect(isPowerOfTwo(7)).toBe(false);
  });
});

describe("playoffRoundName", () => {
  it("maps counts to Spanish names", () => {
    expect(playoffRoundName(1)).toBe("Final");
    expect(playoffRoundName(2)).toBe("Semifinales");
    expect(playoffRoundName(4)).toBe("Cuartos de final");
    expect(playoffRoundName(8)).toBe("Octavos de final");
    expect(playoffRoundName(16)).toBe("16vos de final");
    expect(playoffRoundName(32)).toBe("32vos de final");
  });
  it("falls back for unusual sizes", () => {
    expect(playoffRoundName(7)).toBe("Ronda de 7");
  });
});

describe("completePlayoffRounds", () => {
  it("throws if firstRound count is not a power of 2", () => {
    expect(() =>
      completePlayoffRounds(
        [
          { id: "a", order: 0 },
          { id: "b", order: 1 },
          { id: "c", order: 2 },
        ],
        1
      )
    ).toThrow();
  });

  it("returns no new rounds when firstRound has 1 match", () => {
    expect(completePlayoffRounds([{ id: "a", order: 0 }], 1)).toEqual([]);
  });

  it("generates one new round when firstRound has 2 matches", () => {
    const result = completePlayoffRounds(
      [
        { id: "a", order: 0 },
        { id: "b", order: 1 },
      ],
      1
    );
    expect(result).toHaveLength(1);
    expect(result[0].order).toBe(2);
    expect(result[0].name).toBe("Final");
    expect(result[0].matches).toHaveLength(1);
    expect(result[0].matches[0]).toEqual({
      order: 0,
      slotAType: "match_winner",
      slotARef: "a",
      slotBType: "match_winner",
      slotBRef: "b",
    });
  });

  it("generates rounds all the way down from 8 matches to final", () => {
    const first = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      order: i,
    }));
    const result = completePlayoffRounds(first, 1);
    expect(result.map((r) => r.matches.length)).toEqual([4, 2, 1]);
    expect(result.map((r) => r.name)).toEqual([
      "Cuartos de final",
      "Semifinales",
      "Final",
    ]);
    expect(result.map((r) => r.order)).toEqual([2, 3, 4]);
    expect(result[0].matches[0]).toEqual({
      order: 0,
      slotAType: "match_winner",
      slotARef: "m0",
      slotBType: "match_winner",
      slotBRef: "m1",
    });
    expect(result[0].matches[1]).toEqual({
      order: 1,
      slotAType: "match_winner",
      slotARef: "m2",
      slotBType: "match_winner",
      slotBRef: "m3",
    });
  });

  it("respects firstRoundOrder parameter for subsequent orders", () => {
    const first = Array.from({ length: 4 }, (_, i) => ({
      id: `m${i}`,
      order: i,
    }));
    const result = completePlayoffRounds(first, 3);
    expect(result.map((r) => r.order)).toEqual([4, 5]);
  });
});

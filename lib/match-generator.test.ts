import { describe, it, expect } from "vitest";
import { generateMatchesForGroup, type GeneratedMatch } from "./match-generator";

describe("generateMatchesForGroup", () => {
  describe("3-team group", () => {
    const teams = ["A", "B", "C"];

    it("generates 3 matches (round-robin)", () => {
      const matches = generateMatchesForGroup(teams);
      expect(matches).toHaveLength(3);
    });

    it("all matches are team-vs-team", () => {
      const matches = generateMatchesForGroup(teams);
      for (const m of matches) {
        expect(m.slotAType).toBe("team");
        expect(m.slotBType).toBe("team");
      }
    });

    it("covers each pair exactly once", () => {
      const matches = generateMatchesForGroup(teams);
      const pairs = matches.map((m) =>
        [m.slotARef, m.slotBRef].sort().join("-")
      );
      expect(new Set(pairs).size).toBe(3);
      expect(pairs.sort()).toEqual(["A-B", "A-C", "B-C"].sort());
    });

    it("assigns sequential order 0,1,2", () => {
      const matches = generateMatchesForGroup(teams);
      expect(matches.map((m) => m.order).sort()).toEqual([0, 1, 2]);
    });
  });

  describe("4-team group", () => {
    const teams = ["A", "B", "C", "D"];

    it("generates 4 matches", () => {
      const matches = generateMatchesForGroup(teams);
      expect(matches).toHaveLength(4);
    });

    it("first two matches are team-vs-team: A-B and C-D", () => {
      const matches = generateMatchesForGroup(teams);
      const [m1, m2] = matches;
      expect(m1.slotAType).toBe("team");
      expect(m1.slotBType).toBe("team");
      expect([m1.slotARef, m1.slotBRef].sort()).toEqual(["A", "B"]);
      expect(m2.slotAType).toBe("team");
      expect(m2.slotBType).toBe("team");
      expect([m2.slotARef, m2.slotBRef].sort()).toEqual(["C", "D"]);
    });

    it("last two matches use match_winner/match_loser slots referencing first two matches", () => {
      const matches = generateMatchesForGroup(teams);
      const [m1, m2, m3, m4] = matches;
      expect(m3.slotAType).toBe("match_winner");
      expect(m3.slotARef).toBe(m1.tempId);
      expect(m3.slotBType).toBe("match_loser");
      expect(m3.slotBRef).toBe(m2.tempId);
      expect(m4.slotAType).toBe("match_loser");
      expect(m4.slotARef).toBe(m1.tempId);
      expect(m4.slotBType).toBe("match_winner");
      expect(m4.slotBRef).toBe(m2.tempId);
    });

    it("matches have order 0,1,2,3", () => {
      const matches = generateMatchesForGroup(teams);
      expect(matches.map((m) => m.order)).toEqual([0, 1, 2, 3]);
    });
  });

  describe("invalid groups", () => {
    it("throws for fewer than 3 teams", () => {
      expect(() => generateMatchesForGroup(["A", "B"])).toThrow();
    });

    it("throws for more than 4 teams", () => {
      expect(() => generateMatchesForGroup(["A", "B", "C", "D", "E"])).toThrow();
    });
  });
});

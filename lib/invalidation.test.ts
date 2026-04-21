import { describe, it, expect } from "vitest";
import {
  computeAffectedMatches,
  type InvalidationCtx,
  type ProposedChange,
} from "./invalidation";

function teams(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`,
    name: `Team ${i + 1}`,
  }));
}

describe("computeAffectedMatches", () => {
  it("returns no affected matches when change is no-op", () => {
    const ctx: InvalidationCtx = {
      teamsById: new Map(teams(2).map((t) => [t.id, t])),
      groupTeamsByPosition: new Map([["g1:1", "t1"]]),
      matchesById: new Map(),
    };
    const change: ProposedChange = {
      kind: "group_position",
      groupId: "g1",
      position: 1,
      newTeamId: "t1",
    };
    expect(computeAffectedMatches(ctx, change)).toEqual([]);
  });

  it("returns matches using changed group_position slot", () => {
    const [t1, t2] = teams(2);
    const ctx: InvalidationCtx = {
      teamsById: new Map([t1, t2].map((t) => [t.id, t])),
      groupTeamsByPosition: new Map([["g1:1", "t1"]]),
      matchesById: new Map([
        [
          "m1",
          {
            id: "m1",
            slotAType: "group_position",
            slotARef: "g1:1",
            slotBType: "bye",
            slotBRef: null,
            resultWinnerTeamId: null,
          },
        ],
      ]),
    };
    const change: ProposedChange = {
      kind: "group_position",
      groupId: "g1",
      position: 1,
      newTeamId: "t2",
    };
    expect(computeAffectedMatches(ctx, change)).toEqual(["m1"]);
  });

  it("propagates transitively through match_winner refs", () => {
    const [t1, t2, t3, t4] = teams(4);
    const ctx: InvalidationCtx = {
      teamsById: new Map([t1, t2, t3, t4].map((t) => [t.id, t])),
      groupTeamsByPosition: new Map(),
      matchesById: new Map([
        [
          "m1",
          {
            id: "m1",
            slotAType: "team",
            slotARef: "t1",
            slotBType: "team",
            slotBRef: "t2",
            resultWinnerTeamId: "t1",
          },
        ],
        [
          "m2",
          {
            id: "m2",
            slotAType: "team",
            slotARef: "t3",
            slotBType: "team",
            slotBRef: "t4",
            resultWinnerTeamId: "t3",
          },
        ],
        [
          "m3",
          {
            id: "m3",
            slotAType: "match_winner",
            slotARef: "m1",
            slotBType: "match_winner",
            slotBRef: "m2",
            resultWinnerTeamId: "t1",
          },
        ],
        [
          "m4",
          {
            id: "m4",
            slotAType: "match_winner",
            slotARef: "m3",
            slotBType: "bye",
            slotBRef: null,
            resultWinnerTeamId: null,
          },
        ],
      ]),
    };
    const change: ProposedChange = {
      kind: "match_winner",
      matchId: "m1",
      newWinnerTeamId: "t2",
    };
    const affected = computeAffectedMatches(ctx, change);
    expect(affected.sort()).toEqual(["m3", "m4"].sort());
  });

  it("does not propagate beyond where resolution still yields same team", () => {
    const [t1, t2] = teams(2);
    const ctx: InvalidationCtx = {
      teamsById: new Map([t1, t2].map((t) => [t.id, t])),
      groupTeamsByPosition: new Map([["g1:1", "t1"]]),
      matchesById: new Map([
        [
          "m1",
          {
            id: "m1",
            slotAType: "group_position",
            slotARef: "g1:1",
            slotBType: "team",
            slotBRef: "t2",
            resultWinnerTeamId: null,
          },
        ],
      ]),
    };
    const change: ProposedChange = {
      kind: "group_position",
      groupId: "g1",
      position: 1,
      newTeamId: "t1",
    };
    expect(computeAffectedMatches(ctx, change)).toEqual([]);
  });

  it("handles match_winner change when match result changes winner", () => {
    const [t1, t2] = teams(2);
    const ctx: InvalidationCtx = {
      teamsById: new Map([t1, t2].map((t) => [t.id, t])),
      groupTeamsByPosition: new Map(),
      matchesById: new Map([
        [
          "m1",
          {
            id: "m1",
            slotAType: "team",
            slotARef: "t1",
            slotBType: "team",
            slotBRef: "t2",
            resultWinnerTeamId: "t1",
          },
        ],
        [
          "m2",
          {
            id: "m2",
            slotAType: "match_winner",
            slotARef: "m1",
            slotBType: "bye",
            slotBRef: null,
            resultWinnerTeamId: null,
          },
        ],
      ]),
    };
    const change: ProposedChange = {
      kind: "match_winner",
      matchId: "m1",
      newWinnerTeamId: "t2",
    };
    expect(computeAffectedMatches(ctx, change)).toEqual(["m2"]);
  });
});

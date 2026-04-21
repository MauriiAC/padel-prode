import { describe, it, expect } from "vitest";
import { resolveSlot, type SlotResolverCtx } from "./slot-resolver";

describe("resolveSlot", () => {
  const ctx: SlotResolverCtx = {
    teamsById: new Map([
      ["team-a", { id: "team-a", name: "A" }],
      ["team-b", { id: "team-b", name: "B" }],
    ]),
    groupTeamsByPosition: new Map([
      ["group-1:1", "team-a"],
      ["group-1:2", "team-b"],
    ]),
    matchesById: new Map([
      [
        "match-1",
        {
          id: "match-1",
          slotAType: "team" as const,
          slotARef: "team-a",
          slotBType: "team" as const,
          slotBRef: "team-b",
          resultWinnerTeamId: "team-a",
        },
      ],
      [
        "match-bye",
        {
          id: "match-bye",
          slotAType: "team" as const,
          slotARef: "team-a",
          slotBType: "bye" as const,
          slotBRef: null,
          resultWinnerTeamId: null,
        },
      ],
    ]),
  };

  it("resolves team slot", () => {
    expect(resolveSlot({ type: "team", ref: "team-a" }, ctx)).toEqual({
      team: { id: "team-a", name: "A" },
      isBye: false,
      isPending: false,
    });
  });

  it("resolves bye slot", () => {
    expect(resolveSlot({ type: "bye", ref: null }, ctx)).toEqual({
      team: null,
      isBye: true,
      isPending: false,
    });
  });

  it("resolves group_position when assigned", () => {
    expect(
      resolveSlot({ type: "group_position", ref: "group-1:1" }, ctx)
    ).toEqual({
      team: { id: "team-a", name: "A" },
      isBye: false,
      isPending: false,
    });
  });

  it("returns pending when group_position not assigned", () => {
    expect(
      resolveSlot({ type: "group_position", ref: "group-1:3" }, ctx)
    ).toEqual({ team: null, isBye: false, isPending: true });
  });

  it("resolves match_winner from match result", () => {
    expect(
      resolveSlot({ type: "match_winner", ref: "match-1" }, ctx)
    ).toEqual({
      team: { id: "team-a", name: "A" },
      isBye: false,
      isPending: false,
    });
  });

  it("resolves match_loser from match result", () => {
    expect(
      resolveSlot({ type: "match_loser", ref: "match-1" }, ctx)
    ).toEqual({
      team: { id: "team-b", name: "B" },
      isBye: false,
      isPending: false,
    });
  });

  it("returns pending when match_winner source has no result", () => {
    const ctxNoResult: SlotResolverCtx = {
      ...ctx,
      matchesById: new Map([
        [
          "match-pending",
          {
            id: "match-pending",
            slotAType: "team" as const,
            slotARef: "team-a",
            slotBType: "team" as const,
            slotBRef: "team-b",
            resultWinnerTeamId: null,
          },
        ],
      ]),
    };
    expect(
      resolveSlot({ type: "match_winner", ref: "match-pending" }, ctxNoResult)
    ).toEqual({ team: null, isBye: false, isPending: true });
  });

  it("match_winner of bye match resolves to the non-bye team", () => {
    expect(
      resolveSlot({ type: "match_winner", ref: "match-bye" }, ctx)
    ).toEqual({
      team: { id: "team-a", name: "A" },
      isBye: false,
      isPending: false,
    });
  });
});

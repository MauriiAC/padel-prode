export type SlotType =
  | "team"
  | "bye"
  | "group_position"
  | "match_winner"
  | "match_loser";

type TeamRef = { id: string; name: string };

type MatchRef = {
  id: string;
  slotAType: SlotType;
  slotARef: string | null;
  slotBType: SlotType;
  slotBRef: string | null;
  resultWinnerTeamId: string | null;
};

export type SlotResolverCtx = {
  teamsById: Map<string, TeamRef>;
  groupTeamsByPosition: Map<string, string>;
  matchesById: Map<string, MatchRef>;
};

export type ResolvedSlot = {
  team: TeamRef | null;
  isBye: boolean;
  isPending: boolean;
};

export function resolveSlot(
  slot: { type: SlotType; ref: string | null },
  ctx: SlotResolverCtx
): ResolvedSlot {
  switch (slot.type) {
    case "team":
      return resolveTeam(slot.ref, ctx);
    case "bye":
      return { team: null, isBye: true, isPending: false };
    case "group_position":
      return resolveGroupPosition(slot.ref, ctx);
    case "match_winner":
    case "match_loser":
      return resolveFromMatch(slot.type, slot.ref, ctx);
  }
}

function resolveTeam(ref: string | null, ctx: SlotResolverCtx): ResolvedSlot {
  if (!ref) return pending();
  const team = ctx.teamsById.get(ref) ?? null;
  if (!team) return pending();
  return { team, isBye: false, isPending: false };
}

function resolveGroupPosition(
  ref: string | null,
  ctx: SlotResolverCtx
): ResolvedSlot {
  if (!ref) return pending();
  const teamId = ctx.groupTeamsByPosition.get(ref);
  if (!teamId) return pending();
  const team = ctx.teamsById.get(teamId) ?? null;
  if (!team) return pending();
  return { team, isBye: false, isPending: false };
}

function resolveFromMatch(
  kind: "match_winner" | "match_loser",
  ref: string | null,
  ctx: SlotResolverCtx
): ResolvedSlot {
  if (!ref) return pending();
  const match = ctx.matchesById.get(ref);
  if (!match) return pending();

  const slotA = resolveSlot(
    { type: match.slotAType, ref: match.slotARef },
    ctx
  );
  const slotB = resolveSlot(
    { type: match.slotBType, ref: match.slotBRef },
    ctx
  );

  if (slotA.isBye && slotB.team) {
    return kind === "match_winner"
      ? slotB
      : { team: null, isBye: true, isPending: false };
  }
  if (slotB.isBye && slotA.team) {
    return kind === "match_winner"
      ? slotA
      : { team: null, isBye: true, isPending: false };
  }

  if (!match.resultWinnerTeamId) return pending();

  const winnerTeam = ctx.teamsById.get(match.resultWinnerTeamId) ?? null;
  if (!winnerTeam) return pending();

  if (kind === "match_winner") {
    return { team: winnerTeam, isBye: false, isPending: false };
  }

  const other =
    slotA.team && slotA.team.id !== winnerTeam.id
      ? slotA.team
      : slotB.team && slotB.team.id !== winnerTeam.id
      ? slotB.team
      : null;
  if (!other) return pending();
  return { team: other, isBye: false, isPending: false };
}

function pending(): ResolvedSlot {
  return { team: null, isBye: false, isPending: true };
}

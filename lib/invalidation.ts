import { resolveSlot, type SlotResolverCtx, type SlotType } from "./slot-resolver";

type MatchRef = {
  id: string;
  slotAType: SlotType;
  slotARef: string | null;
  slotBType: SlotType;
  slotBRef: string | null;
  resultWinnerTeamId: string | null;
};

export type InvalidationCtx = SlotResolverCtx;

export type ProposedChange =
  | {
      kind: "group_position";
      groupId: string;
      position: number;
      newTeamId: string | null;
    }
  | {
      kind: "match_winner";
      matchId: string;
      newWinnerTeamId: string | null;
    };

export function computeAffectedMatches(
  ctx: InvalidationCtx,
  change: ProposedChange
): string[] {
  const matches = Array.from(ctx.matchesById.values());
  const before = new Map<string, [string | null, string | null]>();
  for (const m of matches) {
    before.set(m.id, resolvePair(m, ctx));
  }

  const nextCtx = applyChange(ctx, change);

  // First pass: find directly affected matches (resolved slots differ)
  const directlyAffected = new Set<string>();
  for (const m of matches) {
    const next = resolvePair(m, nextCtx);
    const prev = before.get(m.id)!;
    if (next[0] !== prev[0] || next[1] !== prev[1]) {
      directlyAffected.add(m.id);
    }
  }

  // BFS: propagate to any match whose slot references an already-affected match
  const affected = new Set<string>(directlyAffected);
  const queue = Array.from(directlyAffected);
  while (queue.length > 0) {
    const affectedId = queue.shift()!;
    for (const m of matches) {
      if (affected.has(m.id)) continue;
      const refsAffected =
        (m.slotAType === "match_winner" || m.slotAType === "match_loser") &&
        m.slotARef === affectedId ||
        (m.slotBType === "match_winner" || m.slotBType === "match_loser") &&
        m.slotBRef === affectedId;
      if (refsAffected) {
        affected.add(m.id);
        queue.push(m.id);
      }
    }
  }

  return Array.from(affected);
}

function resolvePair(
  m: MatchRef,
  ctx: SlotResolverCtx
): [string | null, string | null] {
  const a = resolveSlot({ type: m.slotAType, ref: m.slotARef }, ctx);
  const b = resolveSlot({ type: m.slotBType, ref: m.slotBRef }, ctx);
  return [a.team?.id ?? null, b.team?.id ?? null];
}

function applyChange(
  ctx: InvalidationCtx,
  change: ProposedChange
): InvalidationCtx {
  if (change.kind === "group_position") {
    const next = new Map(ctx.groupTeamsByPosition);
    const key = `${change.groupId}:${change.position}`;
    if (change.newTeamId == null) next.delete(key);
    else next.set(key, change.newTeamId);
    return { ...ctx, groupTeamsByPosition: next };
  }

  const nextMatches = new Map(ctx.matchesById);
  const existing = nextMatches.get(change.matchId);
  if (existing) {
    nextMatches.set(change.matchId, {
      ...existing,
      resultWinnerTeamId: change.newWinnerTeamId,
    });
  }
  return { ...ctx, matchesById: nextMatches };
}

# Fase 4 — Playoff & invalidación de pronósticos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps usan checkbox (`- [ ]`).

**Goal:** Builder del cuadro de playoff con slots `group_position` / `match_winner` / `bye`, auto-completar rondas, flujo de pronósticos en playoff, y flujo de **invalidación** cuando se cambia una posición de grupo o un ganador (detectar partidos afectados, confirmación del admin, borrado de pronósticos impactados).

**Architecture:** Dos funciones puras críticas con TDD: `playoff-completer` (genera rondas siguientes desde la primera) y `invalidation` / `computeAffectedMatches` (diff de slots resueltos antes/después de un cambio, con propagación transitiva vía `match_winner`/`match_loser`). Server Actions extendidos para recibir un flag `confirm` y retornar `requiresConfirmation` cuando haya pronósticos a invalidar.

**Tech Stack:** Mismo stack de Fase 1-3. Sin librerías nuevas.

---

## Reference

- Spec: [docs/superpowers/specs/2026-04-21-padel-prode-design.md](../specs/2026-04-21-padel-prode-design.md) §5 (resolución + invalidación), §6 (flujo 3/6), §8 (Playoff UI), §9.
- Fase 3 plan: [plans/2026-04-21-phase-3-groups-matches-predictions.md](2026-04-21-phase-3-groups-matches-predictions.md) para patrones y contexto.

---

## File Structure — delta sobre Fase 3

```
lib/
  playoff-completer.ts                        (nuevo, TDD)
  playoff-completer.test.ts                   (nuevo)
  invalidation.ts                             (nuevo, TDD)
  invalidation.test.ts                        (nuevo)
actions/
  playoff.ts                                  (nuevo)
  groups.ts                                   (modify: setTeamPositionAction admite confirm)
  matches.ts                                  (modify: setMatchResultAction admite confirm)
app/(admin)/admin/tournaments/[id]/
  playoff/page.tsx                            (reemplaza stub)
  playoff/playoff-builder.tsx                 (nuevo, Client)
  playoff/match-card.tsx                      (nuevo, Client)
  groups/edit-positions-dialog.tsx            (modify: confirmación si hay invalidación)
  matches/match-result-form.tsx               (modify: confirmación si hay invalidación)
app/(player)/player/tournaments/[id]/
  playoff/page.tsx                            (reemplaza stub)
components/
  confirm-invalidation-dialog.tsx             (nuevo — reutilizable entre positions y results)
```

---

## Task 1: `lib/playoff-completer.ts` con TDD

**Contexto:** Dada una primera ronda de playoff con N partidos (N = potencia de 2), genera las rondas siguientes hasta llegar a 1 (final). Cada partido de la ronda siguiente tiene slots `match_winner` apuntando a dos partidos consecutivos de la ronda previa.

Función pura. No toca DB.

**Files:** `lib/playoff-completer.ts`, `lib/playoff-completer.test.ts`

- [ ] **Step 1: Tests**

```ts
// lib/playoff-completer.test.ts
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
    expect(playoffRoundName(64)).toBe("64vos de final");
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

  it("returns no new rounds when firstRound has 1 match (it's already the final)", () => {
    expect(
      completePlayoffRounds([{ id: "a", order: 0 }], 1)
    ).toEqual([]);
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
    // 8 -> 4 -> 2 -> 1
    expect(result.map((r) => r.matches.length)).toEqual([4, 2, 1]);
    expect(result.map((r) => r.name)).toEqual([
      "Cuartos de final",
      "Semifinales",
      "Final",
    ]);
    // Each round's order sequential (first round was order=1)
    expect(result.map((r) => r.order)).toEqual([2, 3, 4]);
    // First generated round's first match references first two matches of round 1
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

  it("respects firstRoundOrder parameter for naming subsequent orders", () => {
    const first = Array.from({ length: 4 }, (_, i) => ({
      id: `m${i}`,
      order: i,
    }));
    const result = completePlayoffRounds(first, 3); // first round was order=3
    expect(result.map((r) => r.order)).toEqual([4, 5]);
  });
});
```

- [ ] **Step 2: Implementación**

```ts
// lib/playoff-completer.ts

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

/**
 * Generate subsequent rounds from a first playoff round.
 *
 * @param firstRoundMatches Matches already created for the first playoff
 *   round, ordered by `order` (0-indexed, sequential).
 * @param firstRoundOrder The `order` value assigned to the first playoff
 *   round (typically 1 when groups is 0).
 * @returns Rounds 2..N with planned matches referencing previous-round
 *   winners via `match_winner` slots. Does NOT include the first round.
 */
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
      // Synthetic ID for next-round reference chain; real UUID assigned by caller
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
```

**Nota:** El `syntheticId` dentro del algoritmo es interno; el caller tiene que resolverlos al insertar (mapear synthetic → real UUID). Esto se maneja en el server action (Task 3).

- [ ] **Step 3: Tests pass** → **Step 4: Commit**

```bash
git add lib/playoff-completer.ts lib/playoff-completer.test.ts
git commit -m "feat(lib): playoff round completer with TDD"
```

---

## Task 2: `lib/invalidation.ts` con TDD — `computeAffectedMatches`

**Contexto:** Dada una lista de matches de un torneo y un "cambio propuesto" (cambio de `final_position` en un grupo, o cambio de `result_winner_team_id` en un match), retornar la lista de IDs de matches cuyo "equipo resuelto" en cualquiera de los dos slots cambió. Propagación transitiva.

**Files:** `lib/invalidation.ts`, `lib/invalidation.test.ts`

- [ ] **Step 1: Tests**

```ts
// lib/invalidation.test.ts
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
      newTeamId: "t1", // same team
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
    // Change winner of m1 from t1 to t2 — propagates to m3 and m4
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
    // Change position: t1 stays at 1 (no-op)
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
```

- [ ] **Step 2: Implementación**

```ts
// lib/invalidation.ts
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
      newTeamId: string | null; // null to unset
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
  // Build snapshot of current resolved team for each match (slotA, slotB pair)
  const matches = Array.from(ctx.matchesById.values());
  const before = new Map<string, [string | null, string | null]>();
  for (const m of matches) {
    before.set(m.id, resolvePair(m, ctx));
  }

  // Build a new context with the proposed change applied
  const nextCtx = applyChange(ctx, change);

  // Compare after vs before
  const affected: string[] = [];
  for (const m of matches) {
    const next = resolvePair(m, nextCtx);
    const prev = before.get(m.id)!;
    if (next[0] !== prev[0] || next[1] !== prev[1]) {
      affected.push(m.id);
    }
  }
  return affected;
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

  // match_winner change
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
```

- [ ] **Step 3: Tests pass** → **Step 4: Commit**

```bash
git add lib/invalidation.ts lib/invalidation.test.ts
git commit -m "feat(lib): computeAffectedMatches with transitive propagation (TDD)"
```

---

## Task 3: `actions/playoff.ts` — construcción del cuadro

**Files:** `actions/playoff.ts`

Soporta:
- `ensurePlayoffRoundAction(tournamentId)` — si no hay ronda `kind='playoff'` para ese torneo, crea la primera (order=1, name="Primera ronda", status="sin_abrir"). Idempotente.
- `addPlayoffMatchAction(roundId, tournamentId)` — agrega un partido con slots vacíos (usando defaults: slotAType="group_position", slotBType="group_position", refs null).
- `updatePlayoffSlotAction(matchId, slotSide, slotType, slotRef, tournamentId)` — modifica un slot de un match (solo permitido si la ronda está `sin_abrir`).
- `deletePlayoffMatchAction(matchId, tournamentId)` — borra (solo si la ronda está `sin_abrir`).
- `completePlayoffRoundsAction(tournamentId)` — toma la primera ronda de playoff, valida potencia de 2 (contando byes como partidos), llama a `completePlayoffRounds`, inserta las rondas generadas. Si ya hay rondas posteriores, rechaza (admin debe borrarlas primero; fuera de scope para MVP).

- [ ] **Step 1: Implementación**

```ts
"use server";

import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { matches, rounds } from "@/db/schema";
import {
  completePlayoffRounds,
  isPowerOfTwo,
} from "@/lib/playoff-completer";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type PlayoffActionResult = { ok: true } | { ok: false; error: string };

export async function ensurePlayoffRoundAction(
  tournamentId: string
): Promise<PlayoffActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(tournamentId).success) {
    return { ok: false, error: "ID inválido" };
  }

  const existing = await db
    .select()
    .from(rounds)
    .where(
      and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "playoff"))
    )
    .limit(1);

  if (existing.length > 0) return { ok: true };

  await db.insert(rounds).values({
    tournamentId,
    kind: "playoff",
    order: 1,
    name: "Primera ronda",
    status: "sin_abrir",
  });

  revalidatePath(`/admin/tournaments/${tournamentId}/playoff`);
  return { ok: true };
}

const addMatchSchema = z.object({
  roundId: z.string().uuid(),
  tournamentId: z.string().uuid(),
});

export async function addPlayoffMatchAction(
  roundId: string,
  tournamentId: string
): Promise<PlayoffActionResult> {
  await requireAdmin();
  const parsed = addMatchSchema.safeParse({ roundId, tournamentId });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  const [round] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, parsed.data.roundId))
    .limit(1);
  if (!round || round.kind !== "playoff") {
    return { ok: false, error: "Ronda no es de playoff" };
  }
  if (round.status !== "sin_abrir") {
    return { ok: false, error: "La ronda debe estar sin abrir" };
  }

  const [maxRow] = await db
    .select({ max: matches.order })
    .from(matches)
    .where(eq(matches.roundId, parsed.data.roundId))
    .orderBy(desc(matches.order))
    .limit(1);
  const nextOrder = (maxRow?.max ?? -1) + 1;

  await db.insert(matches).values({
    roundId: parsed.data.roundId,
    groupId: null,
    order: nextOrder,
    slotAType: "group_position",
    slotARef: null,
    slotBType: "group_position",
    slotBRef: null,
  });

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/playoff`);
  return { ok: true };
}

const updateSlotSchema = z.object({
  matchId: z.string().uuid(),
  side: z.enum(["a", "b"]),
  slotType: z.enum(["group_position", "bye"]),
  slotRef: z.string().nullable(), // formato "groupId:position" o null para bye
  tournamentId: z.string().uuid(),
});

export async function updatePlayoffSlotAction(
  matchId: string,
  side: "a" | "b",
  slotType: "group_position" | "bye",
  slotRef: string | null,
  tournamentId: string
): Promise<PlayoffActionResult> {
  await requireAdmin();
  const parsed = updateSlotSchema.safeParse({
    matchId,
    side,
    slotType,
    slotRef,
    tournamentId,
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  const [row] = await db
    .select({
      match: matches,
      roundStatus: rounds.status,
    })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, parsed.data.matchId))
    .limit(1);

  if (!row) return { ok: false, error: "Partido no encontrado" };
  if (row.roundStatus !== "sin_abrir") {
    return { ok: false, error: "La ronda no está sin abrir" };
  }

  const updateData =
    parsed.data.side === "a"
      ? {
          slotAType: parsed.data.slotType,
          slotARef: parsed.data.slotType === "bye" ? null : parsed.data.slotRef,
        }
      : {
          slotBType: parsed.data.slotType,
          slotBRef: parsed.data.slotType === "bye" ? null : parsed.data.slotRef,
        };

  await db.update(matches).set(updateData).where(eq(matches.id, parsed.data.matchId));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/playoff`);
  return { ok: true };
}

export async function deletePlayoffMatchAction(
  matchId: string,
  tournamentId: string
): Promise<PlayoffActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(matchId).success) {
    return { ok: false, error: "ID inválido" };
  }

  const [row] = await db
    .select({ roundStatus: rounds.status })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) return { ok: false, error: "Partido no encontrado" };
  if (row.roundStatus !== "sin_abrir") {
    return { ok: false, error: "La ronda no está sin abrir" };
  }

  await db.delete(matches).where(eq(matches.id, matchId));

  revalidatePath(`/admin/tournaments/${tournamentId}/playoff`);
  return { ok: true };
}

export async function completePlayoffRoundsAction(
  tournamentId: string
): Promise<PlayoffActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(tournamentId).success) {
    return { ok: false, error: "ID inválido" };
  }

  const playoffRounds = await db
    .select()
    .from(rounds)
    .where(
      and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "playoff"))
    )
    .orderBy(asc(rounds.order));

  if (playoffRounds.length === 0) {
    return { ok: false, error: "No hay rondas de playoff" };
  }
  if (playoffRounds.length > 1) {
    return {
      ok: false,
      error: "Ya hay rondas posteriores. Borrá las generadas primero.",
    };
  }

  const firstRound = playoffRounds[0];
  const firstMatches = await db
    .select({ id: matches.id, order: matches.order })
    .from(matches)
    .where(eq(matches.roundId, firstRound.id))
    .orderBy(asc(matches.order));

  if (!isPowerOfTwo(firstMatches.length)) {
    return {
      ok: false,
      error: `La primera ronda tiene ${firstMatches.length} partidos. Debe ser potencia de 2 (usá byes para balancear).`,
    };
  }

  if (firstMatches.length === 1) {
    return {
      ok: false,
      error: "Ya es la final; no hay rondas siguientes que generar.",
    };
  }

  const planned = completePlayoffRounds(firstMatches, firstRound.order);

  // Para cada PlannedRound, insertar la ronda, crear matches con UUIDs
  // y resolver syntheticIds a UUIDs reales usando mapa acumulativo.
  const syntheticToUuid = new Map<string, string>();
  for (const pr of planned) {
    const [insertedRound] = await db
      .insert(rounds)
      .values({
        tournamentId,
        kind: "playoff",
        order: pr.order,
        name: pr.name,
        status: "sin_abrir",
      })
      .returning({ id: rounds.id });

    const matchValues = pr.matches.map((m) => {
      const uuid = crypto.randomUUID();
      const syntheticId = `round${pr.order}-${m.order}`;
      syntheticToUuid.set(syntheticId, uuid);

      const slotARef =
        m.slotARef.startsWith("round") && syntheticToUuid.has(m.slotARef)
          ? syntheticToUuid.get(m.slotARef)!
          : m.slotARef;
      const slotBRef =
        m.slotBRef.startsWith("round") && syntheticToUuid.has(m.slotBRef)
          ? syntheticToUuid.get(m.slotBRef)!
          : m.slotBRef;

      return {
        id: uuid,
        roundId: insertedRound.id,
        groupId: null,
        order: m.order,
        slotAType: m.slotAType,
        slotARef,
        slotBType: m.slotBType,
        slotBRef,
      };
    });

    await db.insert(matches).values(matchValues);
  }

  revalidatePath(`/admin/tournaments/${tournamentId}/playoff`);
  revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
  revalidatePath(`/admin/tournaments/${tournamentId}/rounds`);
  revalidatePath(`/player/tournaments/${tournamentId}/playoff`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar build** + **Step 3: Commit**

```bash
git add actions/playoff.ts
git commit -m "feat(playoff): server actions for building and completing playoff rounds"
```

---

## Task 4: Extender `actions/groups.ts` — invalidación en `setTeamPositionAction`

**Files:** `actions/groups.ts` (modify)

- [ ] **Step 1: Agregar flag `confirm` + lógica de invalidación**

Reemplazar `setTeamPositionAction`:

```ts
import { predictions, matches as matchesTable, rounds } from "@/db/schema";
import { computeAffectedMatches } from "@/lib/invalidation";
import type { SlotResolverCtx } from "@/lib/slot-resolver";

// ... mantener el resto del archivo

export type GroupActionResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; requiresConfirmation: true; affectedCount: number };

export async function setTeamPositionAction(
  groupId: string,
  teamId: string,
  position: number | null,
  tournamentId: string,
  confirm: boolean = false
): Promise<GroupActionResult> {
  await requireAdmin();
  const parsed = positionSchema.safeParse({
    groupId,
    teamId,
    position,
    tournamentId,
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  // Cargar contexto para computeAffectedMatches
  const ctx = await buildInvalidationContext(tournamentId);

  // Determinar el cambio: si hay otro team en esta posición, se desplaza; asumimos
  // que el admin ya limpió la posición previa (por flujo de UI con onBlur). Aquí
  // modelamos el cambio como "nueva asignación para (groupId, position) → teamId".
  const change =
    parsed.data.position == null
      ? null
      : ({
          kind: "group_position" as const,
          groupId: parsed.data.groupId,
          position: parsed.data.position,
          newTeamId: parsed.data.teamId,
        });

  if (change) {
    const affected = computeAffectedMatches(ctx, change);
    const affectedWithPreds = await filterMatchesWithPredictionsInActiveRounds(
      affected
    );
    if (affectedWithPreds.length > 0 && !confirm) {
      return {
        ok: false,
        requiresConfirmation: true,
        affectedCount: affectedWithPreds.length,
      };
    }
    if (affectedWithPreds.length > 0 && confirm) {
      await db
        .delete(predictions)
        .where(inArray(predictions.matchId, affectedWithPreds));
    }
  }

  await db
    .update(groupTeams)
    .set({ finalPosition: parsed.data.position })
    .where(
      and(
        eq(groupTeams.groupId, parsed.data.groupId),
        eq(groupTeams.teamId, parsed.data.teamId)
      )
    );

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/groups`);
  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/playoff`);
  return { ok: true };
}

async function buildInvalidationContext(
  tournamentId: string
): Promise<SlotResolverCtx> {
  const [teamsRows, groupTeamsRows, matchesRows] = await Promise.all([
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.tournamentId, tournamentId)),
    db
      .select({
        groupId: groupTeams.groupId,
        teamId: groupTeams.teamId,
        finalPosition: groupTeams.finalPosition,
      })
      .from(groupTeams)
      .innerJoin(groups, eq(groupTeams.groupId, groups.id))
      .where(eq(groups.tournamentId, tournamentId)),
    db
      .select()
      .from(matchesTable)
      .innerJoin(rounds, eq(matchesTable.roundId, rounds.id))
      .where(eq(rounds.tournamentId, tournamentId)),
  ]);

  const flatMatches = matchesRows.map((r) => r.matches);

  return {
    teamsById: new Map(teamsRows.map((t) => [t.id, t])),
    groupTeamsByPosition: new Map(
      groupTeamsRows
        .filter((gt) => gt.finalPosition != null)
        .map((gt) => [`${gt.groupId}:${gt.finalPosition}`, gt.teamId])
    ),
    matchesById: new Map(
      flatMatches.map((m) => [
        m.id,
        {
          id: m.id,
          slotAType: m.slotAType,
          slotARef: m.slotARef,
          slotBType: m.slotBType,
          slotBRef: m.slotBRef,
          resultWinnerTeamId: m.resultWinnerTeamId,
        },
      ])
    ),
  };
}

async function filterMatchesWithPredictionsInActiveRounds(
  matchIds: string[]
): Promise<string[]> {
  if (matchIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ matchId: predictions.matchId })
    .from(predictions)
    .innerJoin(matchesTable, eq(predictions.matchId, matchesTable.id))
    .innerJoin(rounds, eq(matchesTable.roundId, rounds.id))
    .where(
      and(
        inArray(predictions.matchId, matchIds),
        inArray(rounds.status, ["abierta", "cerrada"])
      )
    );
  return rows.map((r) => r.matchId);
}
```

Nota: necesitás importar `inArray` desde `drizzle-orm` y agregar imports faltantes al top del archivo.

- [ ] **Step 2: Build** + **Step 3: Commit**

```bash
git add actions/groups.ts
git commit -m "feat(groups): setTeamPosition checks and invalidates affected predictions"
```

---

## Task 5: Extender `actions/matches.ts` — invalidación en `setMatchResultAction`

**Files:** `actions/matches.ts` (modify)

Misma lógica que Task 4 pero con `change.kind = "match_winner"`.

- [ ] **Step 1: Modificar `setMatchResultAction`**

Reemplazar la función con:

```ts
import { predictions } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { computeAffectedMatches } from "@/lib/invalidation";
import type { SlotResolverCtx } from "@/lib/slot-resolver";
import { teams as teamsTable, groups, groupTeams } from "@/db/schema";

// Reemplazar el export type:
export type MatchActionResult =
  | { ok: true; regenerated: string[]; skipped: string[]; invalid: string[] }
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; requiresConfirmation: true; affectedCount: number };

export async function setMatchResultAction(
  matchId: string,
  tournamentId: string,
  winnerTeamId: string | null,
  sets: 2 | 3 | null,
  confirm: boolean = false
): Promise<MatchActionResult> {
  await requireAdmin();
  const parsed = resultSchema.safeParse({
    matchId,
    tournamentId,
    winnerTeamId,
    sets,
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  const [row] = await db
    .select({ matchId: matches.id, roundStatus: rounds.status })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, parsed.data.matchId))
    .limit(1);

  if (!row) return { ok: false, error: "Partido no encontrado" };
  if (row.roundStatus === "sin_abrir") {
    return {
      ok: false,
      error: "No se puede cargar resultado con la ronda sin abrir",
    };
  }

  // Invalidation check
  const ctx = await buildInvalidationContextForMatches(tournamentId);
  const change = {
    kind: "match_winner" as const,
    matchId: parsed.data.matchId,
    newWinnerTeamId: parsed.data.winnerTeamId,
  };
  const affected = computeAffectedMatches(ctx, change);
  const affectedWithPreds = await filterMatchesWithPredictionsInActiveRounds(
    affected
  );

  if (affectedWithPreds.length > 0 && !confirm) {
    return {
      ok: false,
      requiresConfirmation: true,
      affectedCount: affectedWithPreds.length,
    };
  }

  if (affectedWithPreds.length > 0 && confirm) {
    await db
      .delete(predictions)
      .where(inArray(predictions.matchId, affectedWithPreds));
  }

  await db
    .update(matches)
    .set({
      resultWinnerTeamId: parsed.data.winnerTeamId,
      resultSets: parsed.data.sets,
    })
    .where(eq(matches.id, parsed.data.matchId));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/matches`);
  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/playoff`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/ranking`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/groups`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/playoff`);
  return { ok: true };
}

async function buildInvalidationContextForMatches(
  tournamentId: string
): Promise<SlotResolverCtx> {
  const [teamsRows, groupTeamsRows, matchesRows] = await Promise.all([
    db
      .select({ id: teamsTable.id, name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.tournamentId, tournamentId)),
    db
      .select({
        groupId: groupTeams.groupId,
        teamId: groupTeams.teamId,
        finalPosition: groupTeams.finalPosition,
      })
      .from(groupTeams)
      .innerJoin(groups, eq(groupTeams.groupId, groups.id))
      .where(eq(groups.tournamentId, tournamentId)),
    db
      .select()
      .from(matches)
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .where(eq(rounds.tournamentId, tournamentId)),
  ]);

  const flatMatches = matchesRows.map((r) => r.matches);

  return {
    teamsById: new Map(teamsRows.map((t) => [t.id, t])),
    groupTeamsByPosition: new Map(
      groupTeamsRows
        .filter((gt) => gt.finalPosition != null)
        .map((gt) => [`${gt.groupId}:${gt.finalPosition}`, gt.teamId])
    ),
    matchesById: new Map(
      flatMatches.map((m) => [
        m.id,
        {
          id: m.id,
          slotAType: m.slotAType,
          slotARef: m.slotARef,
          slotBType: m.slotBType,
          slotBRef: m.slotBRef,
          resultWinnerTeamId: m.resultWinnerTeamId,
        },
      ])
    ),
  };
}

async function filterMatchesWithPredictionsInActiveRounds(
  matchIds: string[]
): Promise<string[]> {
  if (matchIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ matchId: predictions.matchId })
    .from(predictions)
    .innerJoin(matches, eq(predictions.matchId, matches.id))
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(
      and(
        inArray(predictions.matchId, matchIds),
        inArray(rounds.status, ["abierta", "cerrada"])
      )
    );
  return rows.map((r) => r.matchId);
}
```

- [ ] **Step 2: Build** + **Step 3: Commit**

```bash
git add actions/matches.ts
git commit -m "feat(matches): setMatchResult detects and invalidates affected predictions"
```

---

## Task 6: Componente compartido de confirmación

**Files:** `components/confirm-invalidation-dialog.tsx`

- [ ] **Step 1: Dialog reutilizable**

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmInvalidationDialog({
  open,
  affectedCount,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  affectedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar cambio</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Este cambio afecta <strong>{affectedCount}</strong> partido(s) con pronósticos
          ya cargados. Si continuás, los pronósticos de esos partidos se borran.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Confirmar y borrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/confirm-invalidation-dialog.tsx
git commit -m "feat(ui): shared invalidation confirmation dialog"
```

---

## Task 7: Integrar confirmación en `edit-positions-dialog.tsx` y `match-result-form.tsx`

**Files:** `app/(admin)/admin/tournaments/[id]/groups/edit-positions-dialog.tsx` (modify), `app/(admin)/admin/tournaments/[id]/matches/match-result-form.tsx` (modify)

- [ ] **Step 1: edit-positions-dialog — manejar `requiresConfirmation`**

Reemplazar la función `onChange` para capturar el caso de confirmación:

```tsx
// state nuevo al tope del componente
const [pendingConfirm, setPendingConfirm] = useState<
  | null
  | {
      groupId: string;
      teamId: string;
      position: number | null;
      affectedCount: number;
    }
>(null);

async function onChange(groupId: string, teamId: string, value: string) {
  const parsed = value === "" ? null : parseInt(value, 10);
  if (parsed !== null && (Number.isNaN(parsed) || parsed < 1 || parsed > 4)) return;

  startTransition(async () => {
    const res = await setTeamPositionAction(
      groupId,
      teamId,
      parsed,
      tournamentId
    );
    if (res.ok) return;
    if ("requiresConfirmation" in res) {
      setPendingConfirm({ groupId, teamId, position: parsed, affectedCount: res.affectedCount });
      return;
    }
    toast.error(res.error);
  });
}

function confirmInvalidation() {
  if (!pendingConfirm) return;
  const { groupId, teamId, position } = pendingConfirm;
  startTransition(async () => {
    const res = await setTeamPositionAction(
      groupId,
      teamId,
      position,
      tournamentId,
      true
    );
    if (res.ok) toast.success("Posición actualizada");
    else if (!("requiresConfirmation" in res)) toast.error(res.error);
    setPendingConfirm(null);
  });
}
```

Renderizar al final (dentro del return, fuera del `<DialogContent>` principal o después del Dialog):

```tsx
<ConfirmInvalidationDialog
  open={!!pendingConfirm}
  affectedCount={pendingConfirm?.affectedCount ?? 0}
  onConfirm={confirmInvalidation}
  onCancel={() => setPendingConfirm(null)}
/>
```

- [ ] **Step 2: match-result-form — mismo patrón**

Agregar state `pendingConfirm: { winnerId, sets, affectedCount } | null`, modificar `save` para manejar `requiresConfirmation`, agregar `confirmInvalidation` y el `<ConfirmInvalidationDialog>`.

```tsx
// En match-result-form.tsx

import { useState } from "react";
import { ConfirmInvalidationDialog } from "@/components/confirm-invalidation-dialog";

// Dentro del componente:
const [pendingConfirm, setPendingConfirm] = useState<
  | null
  | { winnerId: string | null; sets: 2 | 3 | null; affectedCount: number }
>(null);

function save(winnerId: string | null, sets: 2 | 3 | null, confirm = false) {
  startTransition(async () => {
    const res = await setMatchResultAction(
      matchId,
      tournamentId,
      winnerId,
      sets,
      confirm
    );
    if (res.ok) {
      toast.success("Resultado guardado");
      setPendingConfirm(null);
      return;
    }
    if ("requiresConfirmation" in res) {
      setPendingConfirm({ winnerId, sets, affectedCount: res.affectedCount });
      return;
    }
    toast.error(res.error);
  });
}

function confirmInvalidation() {
  if (!pendingConfirm) return;
  save(pendingConfirm.winnerId, pendingConfirm.sets, true);
}

// En el JSX después del último </div>:
return (
  <>
    {/* ... markup existente ... */}
    <ConfirmInvalidationDialog
      open={!!pendingConfirm}
      affectedCount={pendingConfirm?.affectedCount ?? 0}
      onConfirm={confirmInvalidation}
      onCancel={() => setPendingConfirm(null)}
    />
  </>
);
```

- [ ] **Step 3: Build** + **Step 4: Commit**

```bash
git add app/\(admin\)/admin/tournaments/\[id\]/groups/edit-positions-dialog.tsx app/\(admin\)/admin/tournaments/\[id\]/matches/match-result-form.tsx
git commit -m "feat(ui): confirmation modal for invalidating predictions on edit"
```

---

## Task 8: Admin — página y builder del playoff

**Files:**
- Modify: `app/(admin)/admin/tournaments/[id]/playoff/page.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/playoff/playoff-builder.tsx` (Client)
- Create: `app/(admin)/admin/tournaments/[id]/playoff/match-card.tsx` (Client)

Decisión de UX simple para Fase 4 (iterable después):
- Server Component carga rondas + matches + groups (para poblar los dropdowns).
- Al entrar, ensurePlayoffRound es llamado server-side.
- Builder client component renderea las rondas como columnas horizontales scrolleables.
- En la primera ronda, cada match tiene dos dropdowns (slotA, slotB) con opciones `group_position` (todas las posiciones marcables de todas las zonas) o `bye`.
- Primera ronda: botón "+ Agregar partido" al final; botón "Completar rondas" al tope.
- Rondas siguientes: solo read-only (generadas por "Completar rondas").

- [ ] **Step 1: Page (Server)**

```tsx
// app/(admin)/admin/tournaments/[id]/playoff/page.tsx
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { groups, groupTeams, matches, rounds, teams } from "@/db/schema";
import { ensurePlayoffRoundAction } from "@/actions/playoff";
import { PlayoffBuilder } from "./playoff-builder";

export default async function TournamentPlayoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  // Idempotente — crea la primera ronda si no existe.
  await ensurePlayoffRoundAction(tournamentId);

  const [teamsRows, groupsRows, groupTeamsRows, roundsRows, matchesRows] =
    await Promise.all([
      db.select().from(teams).where(eq(teams.tournamentId, tournamentId)),
      db
        .select()
        .from(groups)
        .where(eq(groups.tournamentId, tournamentId))
        .orderBy(asc(groups.order)),
      db
        .select({
          groupId: groupTeams.groupId,
          teamId: groupTeams.teamId,
          finalPosition: groupTeams.finalPosition,
        })
        .from(groupTeams)
        .innerJoin(groups, eq(groupTeams.groupId, groups.id))
        .where(eq(groups.tournamentId, tournamentId)),
      db
        .select()
        .from(rounds)
        .where(eq(rounds.tournamentId, tournamentId))
        .orderBy(asc(rounds.order)),
      db
        .select()
        .from(matches)
        .innerJoin(rounds, eq(matches.roundId, rounds.id))
        .where(eq(rounds.tournamentId, tournamentId))
        .orderBy(asc(matches.order)),
    ]);

  const playoffRounds = roundsRows.filter((r) => r.kind === "playoff");
  const flatMatches = matchesRows.map((r) => r.matches);

  // Filtrar matches de playoff
  const playoffRoundIds = new Set(playoffRounds.map((r) => r.id));
  const playoffMatches = flatMatches.filter((m) => playoffRoundIds.has(m.roundId));

  return (
    <PlayoffBuilder
      tournamentId={tournamentId}
      teams={teamsRows.map((t) => ({ id: t.id, name: t.name }))}
      groups={groupsRows.map((g) => ({ id: g.id, name: g.name }))}
      groupTeams={groupTeamsRows.map((gt) => ({
        groupId: gt.groupId,
        teamId: gt.teamId,
        finalPosition: gt.finalPosition,
      }))}
      rounds={playoffRounds.map((r) => ({
        id: r.id,
        name: r.name,
        order: r.order,
        status: r.status,
      }))}
      matches={playoffMatches.map((m) => ({
        id: m.id,
        roundId: m.roundId,
        order: m.order,
        slotAType: m.slotAType,
        slotARef: m.slotARef,
        slotBType: m.slotBType,
        slotBRef: m.slotBRef,
        resultWinnerTeamId: m.resultWinnerTeamId,
      }))}
    />
  );
}
```

- [ ] **Step 2: PlayoffBuilder (Client)**

```tsx
// app/(admin)/admin/tournaments/[id]/playoff/playoff-builder.tsx
"use client";

import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  addPlayoffMatchAction,
  completePlayoffRoundsAction,
} from "@/actions/playoff";
import { resolveSlot, type SlotResolverCtx, type SlotType } from "@/lib/slot-resolver";
import { MatchCard } from "./match-card";

type Team = { id: string; name: string };
type Group = { id: string; name: string };
type GroupTeam = { groupId: string; teamId: string; finalPosition: number | null };
type Round = { id: string; name: string; order: number; status: "sin_abrir" | "abierta" | "cerrada" };
type Match = {
  id: string;
  roundId: string;
  order: number;
  slotAType: SlotType;
  slotARef: string | null;
  slotBType: SlotType;
  slotBRef: string | null;
  resultWinnerTeamId: string | null;
};

export function PlayoffBuilder({
  tournamentId,
  teams,
  groups,
  groupTeams,
  rounds,
  matches,
}: {
  tournamentId: string;
  teams: Team[];
  groups: Group[];
  groupTeams: GroupTeam[];
  rounds: Round[];
  matches: Match[];
}) {
  const [pending, startTransition] = useTransition();

  const ctx: SlotResolverCtx = useMemo(
    () => ({
      teamsById: new Map(teams.map((t) => [t.id, t])),
      groupTeamsByPosition: new Map(
        groupTeams
          .filter((gt) => gt.finalPosition != null)
          .map((gt) => [`${gt.groupId}:${gt.finalPosition}`, gt.teamId])
      ),
      matchesById: new Map(matches.map((m) => [m.id, m])),
    }),
    [teams, groupTeams, matches]
  );

  const groupPositionOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (const g of groups) {
      for (let p = 1; p <= 4; p++) {
        out.push({
          value: `${g.id}:${p}`,
          label: `${p}º de ${g.name}`,
        });
      }
    }
    return out;
  }, [groups]);

  const firstRound = rounds[0];
  const canAddMatches = firstRound?.status === "sin_abrir";
  const hasSubsequentRounds = rounds.length > 1;

  const matchesByRound = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const r of rounds) map.set(r.id, []);
    for (const m of matches) {
      const arr = map.get(m.roundId) ?? [];
      arr.push(m);
      map.set(m.roundId, arr);
    }
    return map;
  }, [rounds, matches]);

  function onAddMatch() {
    if (!firstRound) return;
    startTransition(async () => {
      const res = await addPlayoffMatchAction(firstRound.id, tournamentId);
      if (!res.ok) toast.error(res.error);
    });
  }

  function onCompleteRounds() {
    startTransition(async () => {
      const res = await completePlayoffRoundsAction(tournamentId);
      if (res.ok) toast.success("Rondas generadas");
      else toast.error(res.error);
    });
  }

  if (!firstRound) {
    return (
      <p className="text-sm text-muted-foreground">Cargando primera ronda...</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h2 className="text-lg font-medium">Playoff</h2>
        <div className="flex gap-2">
          {canAddMatches && (
            <Button onClick={onAddMatch} disabled={pending}>
              + Agregar partido (primera ronda)
            </Button>
          )}
          {!hasSubsequentRounds && (
            <Button
              variant="outline"
              onClick={onCompleteRounds}
              disabled={pending}
            >
              Completar rondas
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-2">
        {rounds.map((round) => {
          const isFirst = round.order === firstRound.order;
          const roundMatches = (matchesByRound.get(round.id) ?? []).sort(
            (a, b) => a.order - b.order
          );
          return (
            <section
              key={round.id}
              className="min-w-[240px] space-y-3 flex-shrink-0"
            >
              <div>
                <h3 className="font-medium">{round.name}</h3>
                <p className="text-xs text-muted-foreground">
                  Estado: {round.status}
                </p>
              </div>
              <div className="space-y-3">
                {roundMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    tournamentId={tournamentId}
                    match={m}
                    editable={isFirst && round.status === "sin_abrir"}
                    groupPositionOptions={groupPositionOptions}
                    ctx={ctx}
                  />
                ))}
                {roundMatches.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin partidos.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: MatchCard (Client)**

```tsx
// app/(admin)/admin/tournaments/[id]/playoff/match-card.tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  deletePlayoffMatchAction,
  updatePlayoffSlotAction,
} from "@/actions/playoff";
import {
  resolveSlot,
  type SlotResolverCtx,
  type SlotType,
} from "@/lib/slot-resolver";

type Match = {
  id: string;
  roundId: string;
  order: number;
  slotAType: SlotType;
  slotARef: string | null;
  slotBType: SlotType;
  slotBRef: string | null;
  resultWinnerTeamId: string | null;
};

export function MatchCard({
  tournamentId,
  match,
  editable,
  groupPositionOptions,
  ctx,
}: {
  tournamentId: string;
  match: Match;
  editable: boolean;
  groupPositionOptions: { value: string; label: string }[];
  ctx: SlotResolverCtx;
}) {
  const [pending, startTransition] = useTransition();

  const slotA = resolveSlot({ type: match.slotAType, ref: match.slotARef }, ctx);
  const slotB = resolveSlot({ type: match.slotBType, ref: match.slotBRef }, ctx);

  function onSlotChange(side: "a" | "b", value: string) {
    const slotType = value === "bye" ? "bye" : "group_position";
    const slotRef = value === "bye" ? null : value;
    startTransition(async () => {
      const res = await updatePlayoffSlotAction(
        match.id,
        side,
        slotType,
        slotRef,
        tournamentId
      );
      if (!res.ok) toast.error(res.error);
    });
  }

  function onDelete() {
    if (!confirm("¿Borrar partido?")) return;
    startTransition(async () => {
      const res = await deletePlayoffMatchAction(match.id, tournamentId);
      if (!res.ok) toast.error(res.error);
    });
  }

  function SlotEditor({ side, type, ref }: { side: "a" | "b"; type: SlotType; ref: string | null }) {
    const currentValue =
      type === "bye" ? "bye" : type === "group_position" ? ref ?? "" : "";

    return (
      <select
        value={currentValue}
        onChange={(e) => onSlotChange(side, e.target.value)}
        disabled={pending}
        className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">— elegir —</option>
        <option value="bye">Bye</option>
        {groupPositionOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  function SlotDisplay({ isBye, team, isPending }: { isBye: boolean; team: { name: string } | null; isPending: boolean }) {
    if (isBye) return <span className="italic text-muted-foreground">bye</span>;
    if (team) return <span className="font-medium">{team.name}</span>;
    return <span className="text-muted-foreground">Pendiente</span>;
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 text-sm">
      <div className="space-y-1">
        {editable ? (
          <SlotEditor side="a" type={match.slotAType} ref={match.slotARef} />
        ) : (
          <SlotDisplay {...slotA} />
        )}
        <span className="block text-xs text-muted-foreground text-center">vs</span>
        {editable ? (
          <SlotEditor side="b" type={match.slotBType} ref={match.slotBRef} />
        ) : (
          <SlotDisplay {...slotB} />
        )}
      </div>

      {match.resultWinnerTeamId && (
        <div className="text-xs text-muted-foreground">
          Ganador:{" "}
          {ctx.teamsById.get(match.resultWinnerTeamId)?.name ?? "?"}
        </div>
      )}

      {editable && (
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-destructive hover:underline"
          disabled={pending}
        >
          Borrar
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build** + **Step 5: Commit**

```bash
git add app/\(admin\)/admin/tournaments/\[id\]/playoff
git commit -m "feat(playoff): admin builder page with bracket columns and slot editors"
```

---

## Task 9: Player — vista de playoff + pronósticos

**Files:** `app/(player)/player/tournaments/[id]/playoff/page.tsx` (replace stub)

Por simplicidad reutilizamos el `MatchPrediction` existente de fase de grupos (ya es generic).

- [ ] **Step 1: Page (Server)**

```tsx
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  groups,
  groupTeams,
  matches,
  predictions,
  rounds,
  teams,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { resolveSlot, type SlotResolverCtx } from "@/lib/slot-resolver";
import { MatchPrediction } from "../groups/match-prediction";

export default async function PlayerPlayoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const [teamsRows, groupTeamsRows, playoffRounds, allMatches, userPredictions] =
    await Promise.all([
      db.select().from(teams).where(eq(teams.tournamentId, tournamentId)),
      db
        .select({
          groupId: groupTeams.groupId,
          teamId: groupTeams.teamId,
          finalPosition: groupTeams.finalPosition,
        })
        .from(groupTeams)
        .innerJoin(groups, eq(groupTeams.groupId, groups.id))
        .where(eq(groups.tournamentId, tournamentId)),
      db
        .select()
        .from(rounds)
        .where(
          and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "playoff"))
        )
        .orderBy(asc(rounds.order)),
      db
        .select()
        .from(matches)
        .innerJoin(rounds, eq(matches.roundId, rounds.id))
        .where(
          and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "playoff"))
        )
        .orderBy(asc(matches.order)),
      db
        .select()
        .from(predictions)
        .where(eq(predictions.userId, session.user.id)),
    ]);

  if (playoffRounds.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Aún no hay cuadro de playoff configurado.
      </div>
    );
  }

  const flatMatches = allMatches.map((r) => r.matches);

  const ctx: SlotResolverCtx = {
    teamsById: new Map(teamsRows.map((t) => [t.id, { id: t.id, name: t.name }])),
    groupTeamsByPosition: new Map(
      groupTeamsRows
        .filter((gt) => gt.finalPosition != null)
        .map((gt) => [`${gt.groupId}:${gt.finalPosition}`, gt.teamId])
    ),
    matchesById: new Map(flatMatches.map((m) => [m.id, m])),
  };

  const predictionByMatch = new Map(userPredictions.map((p) => [p.matchId, p]));

  return (
    <div className="space-y-6">
      {playoffRounds.map((round) => {
        if (round.status === "sin_abrir") {
          return (
            <section key={round.id} className="space-y-2">
              <h3 className="font-semibold text-base">{round.name}</h3>
              <p className="text-xs text-muted-foreground">
                Ronda sin abrir.
              </p>
            </section>
          );
        }

        const roundMatches = flatMatches
          .filter((m) => m.roundId === round.id)
          .sort((a, b) => a.order - b.order);
        const locked = round.status === "cerrada";

        return (
          <section key={round.id} className="space-y-2">
            <h3 className="font-semibold text-base">{round.name}</h3>
            <p className="text-xs text-muted-foreground">
              {locked ? "Cerrada (read-only)" : "Abierta"}
            </p>
            <div className="space-y-2">
              {roundMatches.map((m) => {
                const slotA = resolveSlot(
                  { type: m.slotAType, ref: m.slotARef },
                  ctx
                );
                const slotB = resolveSlot(
                  { type: m.slotBType, ref: m.slotBRef },
                  ctx
                );
                if (slotA.isBye || slotB.isBye) return null;
                if (!slotA.team || !slotB.team) {
                  return (
                    <div
                      key={m.id}
                      className="rounded-lg border p-3 text-xs text-muted-foreground"
                    >
                      Partido pendiente (esperando ronda anterior)
                    </div>
                  );
                }
                const pred = predictionByMatch.get(m.id) ?? null;
                return (
                  <MatchPrediction
                    key={m.id}
                    tournamentId={tournamentId}
                    matchId={m.id}
                    teamA={slotA.team}
                    teamB={slotB.team}
                    resultWinnerId={m.resultWinnerTeamId}
                    resultSets={m.resultSets as 2 | 3 | null}
                    initialPrediction={
                      pred
                        ? {
                            winnerTeamId: pred.predictedWinnerTeamId,
                            sets: pred.predictedSets as 2 | 3,
                          }
                        : null
                    }
                    locked={locked}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Build** + **Step 3: Commit**

```bash
git add app/\(player\)/player/tournaments/\[id\]/playoff
git commit -m "feat(player): playoff view reusing MatchPrediction component"
```

---

## Task 10: Smoke test Fase 4

- [ ] **Step 1: Flow admin — construir playoff**

1. Torneo con 2 zonas ya configuradas y partidos/resultados cargados (Fase 3).
2. Marcar posiciones finales en las 2 zonas.
3. Ir a tab **"Playoff"** → debería crear la primera ronda automáticamente.
4. Click "+ Agregar partido" 4 veces → 4 cajitas aparecen.
5. En cada cajita, seleccionar slotA = "1º de Grupo A" y slotB = "2º de Grupo B" (u otras combinaciones); también probar una con "bye".
6. Click "Completar rondas" → se generan Cuartos (?) / Semifinales / Final según cuente.
   - Si metiste 4 matches → esperado: 2 rondas más (Semifinales + Final).
7. Ir a tab "Rondas" → ver las rondas creadas.
8. Abrir la primera ronda → cargar resultado en algún partido → ver toast. Navegar al builder y ver que los partidos siguientes muestran el equipo resuelto.

- [ ] **Step 2: Flow invalidación**

1. Con la primera ronda **abierta** y pronósticos ya cargados (como player) en algún partido:
2. Como admin, en tab "Zonas" → "Editar posiciones" → cambiar una posición que afecte al partido pronosticado.
3. Debería aparecer el modal "Este cambio afecta N partidos con pronósticos..."
4. Confirmar → pronóstico del jugador se borra (comprobar en Drizzle Studio o volviendo como player).
5. Hacer lo mismo con el resultado de un match anterior → mismo modal.

- [ ] **Step 3: Flow player**

1. Como player, ir a `/player/tournaments/<id>/playoff`.
2. Ver los partidos agrupados por ronda.
3. Cargar pronósticos en los partidos de la primera ronda (si está abierta).
4. Si una ronda siguiente está `sin_abrir`, ver el mensaje correspondiente.

- [ ] **Step 4: Tests + build**

```bash
pnpm test
pnpm build
```

Esperar todos los tests (cn, password, tokens, match-generator, scoring, slot-resolver, playoff-completer, invalidation) verdes.

- [ ] **Step 5: Tag**

```bash
git tag phase-4-playoff-invalidation
```

---

## Criterios de aceptación Fase 4

- [x] Primera ronda de playoff se crea automáticamente al entrar al builder.
- [x] Admin puede agregar/borrar partidos en la primera ronda.
- [x] Admin puede configurar slots de cada partido: `group_position` (con dropdown de `posicion de grupo`) o `bye`.
- [x] Botón "Completar rondas" genera rondas siguientes hasta la final (valida potencia de 2, rechaza con mensaje útil si no).
- [x] Cambio de posición de grupo o ganador de match dispara detección de partidos afectados, modal de confirmación cuando hay pronósticos, borrado de pronósticos al confirmar.
- [x] Player ve el cuadro de playoff y puede pronosticar partidos en rondas abiertas.
- [x] Tests de lib verdes (incluyen `playoff-completer` y `invalidation`).

## Deferido a Fase 5

- Deploy a Vercel + configuración de Neon `main` branch.
- Verificación de dominio en Resend.
- Pulido visual (loading states, empty states, accesibilidad).
- Borrar rondas generadas (actualmente `completePlayoffRoundsAction` rechaza si ya existen).
- UI para playoff en mobile (actualmente scroll horizontal funciona pero podría mejorarse).

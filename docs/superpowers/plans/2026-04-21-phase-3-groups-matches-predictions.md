# Fase 3 — Zonas, Partidos de grupo, Pronósticos & Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el ciclo completo de fase de grupos: drag-and-drop de equipos a zonas, generación idempotente de partidos (3/4 equipos con slots polimórficos), estados de ronda (`sin_abrir` → `abierta` → `cerrada`), pronósticos por jugador, carga de resultados y ranking básico por torneo.

**Architecture:** Nueva columna `group_id` en `matches` para queries triviales por zona. Lógica de generación y scoring en `lib/` como funciones puras con TDD. Mutaciones vía Server Actions. UI admin con `dnd-kit`; UI player autosave optimista.

**Tech Stack:** Next.js 15 + Drizzle + dnd-kit (nuevo), Vitest para TDD.

---

## Reference

- Spec: [docs/superpowers/specs/2026-04-21-padel-prode-design.md](../specs/2026-04-21-padel-prode-design.md) §3 (modelo), §5 (resolución slots), §6 (flujos 2/4/5), §7 (scoring), §8 (UI), §9 (casos borde).
- Fase 1: [plans/2026-04-21-phase-1-foundation.md](2026-04-21-phase-1-foundation.md)
- Fase 2: [plans/2026-04-21-phase-2-tournaments-teams-layouts.md](2026-04-21-phase-2-tournaments-teams-layouts.md)

---

## File Structure — delta sobre Fase 2

```
db/
  schema.ts                              (modify: add matches.groupId)
  migrations/0001_add_match_group.sql    (nuevo)
lib/
  match-generator.ts                     (nuevo, TDD)
  match-generator.test.ts                (nuevo)
  scoring.ts                             (nuevo, TDD)
  scoring.test.ts                        (nuevo)
  slot-resolver.ts                       (nuevo, TDD — para resolver slots match_winner/match_loser)
  slot-resolver.test.ts                  (nuevo)
actions/
  groups.ts                              (nuevo)
  matches.ts                             (nuevo)
  rounds.ts                              (nuevo)
  predictions.ts                         (nuevo)
app/
  (admin)/admin/tournaments/[id]/
    groups/page.tsx                      (reemplaza stub)
    groups/groups-editor.tsx             (nuevo — client dnd-kit)
    groups/edit-positions-dialog.tsx     (nuevo)
    matches/page.tsx                     (reemplaza stub)
    matches/match-result-form.tsx        (nuevo)
    rounds/page.tsx                      (reemplaza stub)
    rounds/round-status-control.tsx      (nuevo)
  (player)/player/tournaments/[id]/
    groups/page.tsx                      (reemplaza stub)
    groups/match-prediction.tsx          (nuevo — autosave)
    ranking/page.tsx                     (reemplaza stub)
```

---

## Task 1: Schema update — `matches.groupId` + migración

**Files:**
- Modify: `db/schema.ts`
- Create: `db/migrations/0001_*.sql` (generado por drizzle-kit)

- [ ] **Step 1: Agregar `groupId` a `matches`**

En `db/schema.ts`, buscar la definición de `matches` y agregar:

```ts
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }), // nullable — null para playoff
    order: integer("order").notNull(),
    // ... resto igual
  },
  (table) => ({
    roundIdx: index("matches_round_idx").on(table.roundId),
    groupIdx: index("matches_group_idx").on(table.groupId),
  })
);
```

- [ ] **Step 2: Generar y aplicar migración**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH" && pnpm db:generate && pnpm db:migrate
```

- [ ] **Step 3: Commit**

```bash
git add db/
git commit -m "feat(db): add matches.groupId for group-stage queries"
```

---

## Task 2: `lib/match-generator.ts` con TDD

**Files:**
- Create: `lib/match-generator.ts`
- Create: `lib/match-generator.test.ts`

**Contexto:** Función pura que recibe un set de `teamId`s de una zona y devuelve los partidos a crear (sin `id`, `roundId`, `groupId` — esos los agrega el caller).

- [ ] **Step 1: Tests primero**

```ts
// lib/match-generator.test.ts
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
      // m3: winner(m1) vs loser(m2)
      expect(m3.slotAType).toBe("match_winner");
      expect(m3.slotARef).toBe(m1.tempId);
      expect(m3.slotBType).toBe("match_loser");
      expect(m3.slotBRef).toBe(m2.tempId);
      // m4: loser(m1) vs winner(m2)
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
```

- [ ] **Step 2: Correr tests → fail**

Run: `pnpm test lib/match-generator.test.ts`

- [ ] **Step 3: Implementar**

```ts
// lib/match-generator.ts
import { randomUUID } from "crypto";

export type SlotType = "team" | "bye" | "group_position" | "match_winner" | "match_loser";

export type GeneratedMatch = {
  tempId: string; // para referenciar desde otro match antes de persistir
  order: number;
  slotAType: SlotType;
  slotARef: string | null;
  slotBType: SlotType;
  slotBRef: string | null;
};

export function generateMatchesForGroup(teamIds: string[]): GeneratedMatch[] {
  if (teamIds.length === 3) return generate3(teamIds as [string, string, string]);
  if (teamIds.length === 4) return generate4(teamIds as [string, string, string, string]);
  throw new Error(
    `Invalid group size ${teamIds.length}. Groups must have 3 or 4 teams.`
  );
}

function generate3([a, b, c]: [string, string, string]): GeneratedMatch[] {
  return [
    match(0, "team", a, "team", b),
    match(1, "team", a, "team", c),
    match(2, "team", b, "team", c),
  ];
}

function generate4([a, b, c, d]: [string, string, string, string]): GeneratedMatch[] {
  const m1 = match(0, "team", a, "team", b);
  const m2 = match(1, "team", c, "team", d);
  const m3 = match(2, "match_winner", m1.tempId, "match_loser", m2.tempId);
  const m4 = match(3, "match_loser", m1.tempId, "match_winner", m2.tempId);
  return [m1, m2, m3, m4];
}

function match(
  order: number,
  slotAType: SlotType,
  slotARef: string,
  slotBType: SlotType,
  slotBRef: string
): GeneratedMatch {
  return {
    tempId: randomUUID(),
    order,
    slotAType,
    slotARef,
    slotBType,
    slotBRef,
  };
}
```

- [ ] **Step 4: Correr tests → pass**

Run: `pnpm test lib/match-generator.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/match-generator.ts lib/match-generator.test.ts
git commit -m "feat(lib): match generator for 3 and 4 team groups with TDD"
```

---

## Task 3: `lib/scoring.ts` con TDD

**Files:**
- Create: `lib/scoring.ts`, `lib/scoring.test.ts`

- [ ] **Step 1: Tests primero**

```ts
// lib/scoring.test.ts
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
    expect(computeScore(p, { resultWinnerTeamId: null, resultSets: null })).toBe(0);
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
      { matchId: "m1", userId: "u1", predictedWinnerTeamId: "T1", predictedSets: 2 as 2 | 3 },
      { matchId: "m2", userId: "u1", predictedWinnerTeamId: "T2", predictedSets: 2 as 2 | 3 },
      { matchId: "m1", userId: "u2", predictedWinnerTeamId: "T2", predictedSets: 2 as 2 | 3 },
    ];
    const ranking = computeRanking(users, matches, predictions);
    expect(ranking[0].userId).toBe("u1");
    expect(ranking[0].points).toBe(3); // 2 + 1
    expect(ranking[1].userId).toBe("u2");
    expect(ranking[1].points).toBe(0);
  });

  it("ties break by number of correct winners", () => {
    const users = [userA, userB];
    const matches = [
      { id: "m1", resultWinnerTeamId: "T1", resultSets: 2 as 2 | 3 },
      { id: "m2", resultWinnerTeamId: "T2", resultSets: 2 as 2 | 3 },
    ];
    // Both get 2 points total, but Alice via 1 correct-with-sets, Bob via 2 correct winners (1 point each)
    const predictions = [
      { matchId: "m1", userId: "u1", predictedWinnerTeamId: "T1", predictedSets: 2 as 2 | 3 },
      { matchId: "m1", userId: "u2", predictedWinnerTeamId: "T1", predictedSets: 3 as 2 | 3 },
      { matchId: "m2", userId: "u2", predictedWinnerTeamId: "T2", predictedSets: 3 as 2 | 3 },
    ];
    const ranking = computeRanking(users, matches, predictions);
    // Alice: 2 points, 1 correct winner
    // Bob: 2 points, 2 correct winners → Bob first on tiebreak
    expect(ranking[0].userId).toBe("u2");
    expect(ranking[1].userId).toBe("u1");
  });

  it("alphabetical tiebreak when points and correct winners equal", () => {
    const users = [userC, userA, userB];
    const matches: never[] = [];
    const predictions: never[] = [];
    const ranking = computeRanking(users, matches, predictions);
    expect(ranking.map((r) => r.name)).toEqual(["Alice", "Bob", "Carla"]);
  });
});
```

- [ ] **Step 2: Correr tests → fail** → **Step 3: Implementar**

```ts
// lib/scoring.ts

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
```

- [ ] **Step 4: Correr tests → pass**

- [ ] **Step 5: Commit**

```bash
git add lib/scoring.ts lib/scoring.test.ts
git commit -m "feat(lib): scoring and ranking computation with TDD"
```

---

## Task 4: `lib/slot-resolver.ts` con TDD

**Files:**
- Create: `lib/slot-resolver.ts`, `lib/slot-resolver.test.ts`

**Contexto:** Resuelve un slot polimórfico a `{ team, isBye, isPending }`. Necesario para mostrar qué equipo va en cada match en la fase de grupos (matches con slots `match_winner`/`match_loser` referenciando partidos de la primera fecha).

- [ ] **Step 1: Tests**

```ts
// lib/slot-resolver.test.ts
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
    expect(
      resolveSlot({ type: "team", ref: "team-a" }, ctx)
    ).toEqual({ team: { id: "team-a", name: "A" }, isBye: false, isPending: false });
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
    ).toEqual({ team: { id: "team-a", name: "A" }, isBye: false, isPending: false });
  });

  it("returns pending when group_position not assigned", () => {
    expect(
      resolveSlot({ type: "group_position", ref: "group-1:3" }, ctx)
    ).toEqual({ team: null, isBye: false, isPending: true });
  });

  it("resolves match_winner from match result", () => {
    expect(
      resolveSlot({ type: "match_winner", ref: "match-1" }, ctx)
    ).toEqual({ team: { id: "team-a", name: "A" }, isBye: false, isPending: false });
  });

  it("resolves match_loser from match result", () => {
    expect(
      resolveSlot({ type: "match_loser", ref: "match-1" }, ctx)
    ).toEqual({ team: { id: "team-b", name: "B" }, isBye: false, isPending: false });
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
    ).toEqual({ team: { id: "team-a", name: "A" }, isBye: false, isPending: false });
  });
});
```

- [ ] **Step 2: Implementar**

```ts
// lib/slot-resolver.ts

export type SlotType = "team" | "bye" | "group_position" | "match_winner" | "match_loser";

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
  groupTeamsByPosition: Map<string, string>; // "groupId:position" → teamId
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

  // Resolver ambos slots del match referenciado
  const slotA = resolveSlot({ type: match.slotAType, ref: match.slotARef }, ctx);
  const slotB = resolveSlot({ type: match.slotBType, ref: match.slotBRef }, ctx);

  // Bye handling: ganador automático es el otro slot
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

  // match_loser: el equipo que NO ganó, del par del match
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
```

- [ ] **Step 3: Correr tests → pass** → **Step 4: Commit**

```bash
git add lib/slot-resolver.ts lib/slot-resolver.test.ts
git commit -m "feat(lib): polymorphic slot resolver with TDD"
```

---

## Task 5: Server actions de groups

**Files:**
- Create: `actions/groups.ts`

- [ ] **Step 1: Crear**

```ts
"use server";

import { z } from "zod";
import { and, asc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { groups, groupTeams, teams, tournaments } from "@/db/schema";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type GroupActionResult = { ok: true } | { ok: false; error: string };

const tournamentIdSchema = z.object({ tournamentId: z.string().uuid() });

const createGroupSchema = z.object({
  tournamentId: z.string().uuid(),
  name: z.string().min(1).max(40),
});

export async function createGroupAction(
  formData: FormData
): Promise<GroupActionResult> {
  await requireAdmin();
  const parsed = createGroupSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
  }

  const [maxRow] = await db
    .select({ max: max(groups.order) })
    .from(groups)
    .where(eq(groups.tournamentId, parsed.data.tournamentId));
  const nextOrder = (maxRow?.max ?? -1) + 1;

  await db.insert(groups).values({
    tournamentId: parsed.data.tournamentId,
    name: parsed.data.name,
    order: nextOrder,
  });

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/groups`);
  return { ok: true };
}

const renameGroupSchema = z.object({
  groupId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  name: z.string().min(1).max(40),
});

export async function renameGroupAction(
  formData: FormData
): Promise<GroupActionResult> {
  await requireAdmin();
  const parsed = renameGroupSchema.safeParse({
    groupId: formData.get("groupId"),
    tournamentId: formData.get("tournamentId"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  await db
    .update(groups)
    .set({ name: parsed.data.name })
    .where(eq(groups.id, parsed.data.groupId));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/groups`);
  return { ok: true };
}

export async function deleteGroupAction(
  groupId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(groupId).success) {
    return { ok: false, error: "ID inválido" };
  }

  await db.delete(groups).where(eq(groups.id, groupId));

  revalidatePath(`/admin/tournaments/${tournamentId}/groups`);
  return { ok: true };
}

const assignSchema = z.object({
  groupId: z.string().uuid(),
  teamId: z.string().uuid(),
  tournamentId: z.string().uuid(),
});

export async function assignTeamToGroupAction(
  groupId: string,
  teamId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  await requireAdmin();
  const parsed = assignSchema.safeParse({ groupId, teamId, tournamentId });
  if (!parsed.success) return { ok: false, error: "IDs inválidos" };

  // Remove from any existing group first (a team belongs to at most one group)
  await db.delete(groupTeams).where(eq(groupTeams.teamId, parsed.data.teamId));

  await db.insert(groupTeams).values({
    groupId: parsed.data.groupId,
    teamId: parsed.data.teamId,
  });

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/groups`);
  return { ok: true };
}

export async function removeTeamFromGroupAction(
  teamId: string,
  tournamentId: string
): Promise<GroupActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(teamId).success) {
    return { ok: false, error: "ID inválido" };
  }

  await db.delete(groupTeams).where(eq(groupTeams.teamId, teamId));

  revalidatePath(`/admin/tournaments/${tournamentId}/groups`);
  return { ok: true };
}

const positionSchema = z.object({
  groupId: z.string().uuid(),
  teamId: z.string().uuid(),
  position: z.number().int().min(1).max(4).nullable(),
  tournamentId: z.string().uuid(),
});

export async function setTeamPositionAction(
  groupId: string,
  teamId: string,
  position: number | null,
  tournamentId: string
): Promise<GroupActionResult> {
  await requireAdmin();
  const parsed = positionSchema.safeParse({
    groupId,
    teamId,
    position,
    tournamentId,
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

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
  return { ok: true };
}
```

- [ ] **Step 2: Verificar build** + **Step 3: Commit**

```bash
git add actions/groups.ts
git commit -m "feat(groups): server actions for CRUD, assign/remove team, set position"
```

---

## Task 6: Server actions de matches (generar + cargar resultado)

**Files:**
- Create: `actions/matches.ts`

- [ ] **Step 1: Crear**

```ts
"use server";

import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { groups, groupTeams, matches, rounds } from "@/db/schema";
import { generateMatchesForGroup } from "@/lib/match-generator";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type MatchActionResult =
  | { ok: true; regenerated: string[]; skipped: string[]; invalid: string[] }
  | { ok: true }
  | { ok: false; error: string };

/**
 * Generate matches idempotently: for each group, if team set changed vs
 * existing matches, delete + regenerate. Returns which group IDs were
 * regenerated, skipped, or flagged invalid (cantidad ≠ 3|4).
 */
export async function generateGroupMatchesAction(
  tournamentId: string
): Promise<MatchActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(tournamentId).success) {
    return { ok: false, error: "ID inválido" };
  }

  // Ensure a groups round exists (kind='groups', order=0)
  let [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "groups")))
    .limit(1);

  if (!round) {
    const [created] = await db
      .insert(rounds)
      .values({
        tournamentId,
        kind: "groups",
        order: 0,
        name: "Fase de grupos",
        status: "sin_abrir",
      })
      .returning();
    round = created;
  }

  const groupRows = await db
    .select()
    .from(groups)
    .where(eq(groups.tournamentId, tournamentId))
    .orderBy(asc(groups.order));

  const regenerated: string[] = [];
  const skipped: string[] = [];
  const invalid: string[] = [];

  for (const group of groupRows) {
    const teamsInGroup = await db
      .select({ teamId: groupTeams.teamId })
      .from(groupTeams)
      .where(eq(groupTeams.groupId, group.id));
    const teamIds = teamsInGroup.map((t) => t.teamId).sort();

    if (teamIds.length !== 3 && teamIds.length !== 4) {
      invalid.push(group.id);
      continue;
    }

    // Compare to team IDs already used in existing matches of this group
    const existing = await db
      .select()
      .from(matches)
      .where(eq(matches.groupId, group.id));

    const existingTeamIds = new Set<string>();
    for (const m of existing) {
      if (m.slotAType === "team" && m.slotARef) existingTeamIds.add(m.slotARef);
      if (m.slotBType === "team" && m.slotBRef) existingTeamIds.add(m.slotBRef);
    }

    const teamSetSame =
      teamIds.length === existingTeamIds.size &&
      teamIds.every((id) => existingTeamIds.has(id));

    if (teamSetSame && existing.length > 0) {
      skipped.push(group.id);
      continue;
    }

    // Regenerate: delete old, create new
    if (existing.length > 0) {
      await db.delete(matches).where(eq(matches.groupId, group.id));
    }

    const generated = generateMatchesForGroup(teamIds);
    // Replace tempIds with actual UUIDs. For match_winner/match_loser refs,
    // remap from tempId to actual inserted id.
    const tempIdToUuid = new Map<string, string>();
    const firstWave = generated
      .filter((g) => g.slotAType === "team" && g.slotBType === "team")
      .map((g) => ({
        ...g,
        uuid: crypto.randomUUID(),
      }));
    for (const g of firstWave) tempIdToUuid.set(g.tempId, g.uuid);

    const secondWave = generated
      .filter((g) => g.slotAType !== "team" || g.slotBType !== "team")
      .map((g) => ({
        ...g,
        uuid: crypto.randomUUID(),
        slotARef:
          g.slotAType === "team" ? g.slotARef : tempIdToUuid.get(g.slotARef!) ?? null,
        slotBRef:
          g.slotBType === "team" ? g.slotBRef : tempIdToUuid.get(g.slotBRef!) ?? null,
      }));

    const toInsert = [...firstWave, ...secondWave].map((g) => ({
      id: g.uuid,
      roundId: round!.id,
      groupId: group.id,
      order: g.order,
      slotAType: g.slotAType,
      slotARef: g.slotARef,
      slotBType: g.slotBType,
      slotBRef: g.slotBRef,
    }));

    await db.insert(matches).values(toInsert);
    regenerated.push(group.id);
  }

  revalidatePath(`/admin/tournaments/${tournamentId}/groups`);
  revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
  revalidatePath(`/player/tournaments/${tournamentId}/groups`);

  return { ok: true, regenerated, skipped, invalid };
}

const resultSchema = z.object({
  matchId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  winnerTeamId: z.string().uuid().nullable(),
  sets: z.union([z.literal(2), z.literal(3)]).nullable(),
});

export async function setMatchResultAction(
  matchId: string,
  tournamentId: string,
  winnerTeamId: string | null,
  sets: 2 | 3 | null
): Promise<MatchActionResult> {
  await requireAdmin();
  const parsed = resultSchema.safeParse({
    matchId,
    tournamentId,
    winnerTeamId,
    sets,
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  // Ensure the round is not sin_abrir (spec: cannot load results before round opens)
  const [row] = await db
    .select({
      matchId: matches.id,
      roundStatus: rounds.status,
    })
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

  await db
    .update(matches)
    .set({
      resultWinnerTeamId: parsed.data.winnerTeamId,
      resultSets: parsed.data.sets,
    })
    .where(eq(matches.id, parsed.data.matchId));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/matches`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/ranking`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/groups`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar build** + **Step 3: Commit**

```bash
git add actions/matches.ts
git commit -m "feat(matches): idempotent group match generation and result loading"
```

---

## Task 7: Server actions de rounds (state machine)

**Files:**
- Create: `actions/rounds.ts`

- [ ] **Step 1: Crear**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { rounds } from "@/db/schema";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type RoundActionResult = { ok: true } | { ok: false; error: string };

type RoundStatus = "sin_abrir" | "abierta" | "cerrada";

const LEGAL_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  sin_abrir: ["abierta"],
  abierta: ["cerrada"],
  cerrada: [],
};

const changeSchema = z.object({
  roundId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  next: z.enum(["sin_abrir", "abierta", "cerrada"]),
});

export async function changeRoundStatusAction(
  roundId: string,
  tournamentId: string,
  next: RoundStatus
): Promise<RoundActionResult> {
  await requireAdmin();
  const parsed = changeSchema.safeParse({ roundId, tournamentId, next });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  const [current] = await db
    .select({ status: rounds.status })
    .from(rounds)
    .where(eq(rounds.id, parsed.data.roundId))
    .limit(1);

  if (!current) return { ok: false, error: "Ronda no encontrada" };

  const allowed = LEGAL_TRANSITIONS[current.status];
  if (!allowed.includes(parsed.data.next)) {
    return {
      ok: false,
      error: `Transición ${current.status} → ${parsed.data.next} no permitida`,
    };
  }

  await db
    .update(rounds)
    .set({ status: parsed.data.next })
    .where(eq(rounds.id, parsed.data.roundId));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/rounds`);
  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/matches`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/groups`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/ranking`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar build** + **Step 3: Commit**

```bash
git add actions/rounds.ts
git commit -m "feat(rounds): status change action with state machine validation"
```

---

## Task 8: Server actions de predictions

**Files:**
- Create: `actions/predictions.ts`

- [ ] **Step 1: Crear**

```ts
"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { matches, predictions, rounds } from "@/db/schema";

export type PredictionActionResult = { ok: true } | { ok: false; error: string };

const upsertSchema = z.object({
  matchId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  winnerTeamId: z.string().uuid(),
  sets: z.union([z.literal(2), z.literal(3)]),
});

export async function upsertPredictionAction(
  matchId: string,
  tournamentId: string,
  winnerTeamId: string,
  sets: 2 | 3
): Promise<PredictionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "No autenticado" };

  const parsed = upsertSchema.safeParse({
    matchId,
    tournamentId,
    winnerTeamId,
    sets,
  });
  if (!parsed.success) return { ok: false, error: "Inválido" };

  // Check round is abierta
  const [row] = await db
    .select({ status: rounds.status })
    .from(matches)
    .innerJoin(rounds, eq(matches.roundId, rounds.id))
    .where(eq(matches.id, parsed.data.matchId))
    .limit(1);

  if (!row) return { ok: false, error: "Partido no encontrado" };
  if (row.status !== "abierta") {
    return { ok: false, error: "La ronda no está abierta para pronósticos" };
  }

  // Upsert: try update, if 0 rows affected insert
  const existing = await db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.matchId, parsed.data.matchId),
        eq(predictions.userId, session.user.id)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(predictions)
      .set({
        predictedWinnerTeamId: parsed.data.winnerTeamId,
        predictedSets: parsed.data.sets,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(predictions.matchId, parsed.data.matchId),
          eq(predictions.userId, session.user.id)
        )
      );
  } else {
    await db.insert(predictions).values({
      matchId: parsed.data.matchId,
      userId: session.user.id,
      predictedWinnerTeamId: parsed.data.winnerTeamId,
      predictedSets: parsed.data.sets,
    });
  }

  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/groups`);
  revalidatePath(`/player/tournaments/${parsed.data.tournamentId}/ranking`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar build** + **Step 3: Commit**

```bash
git add actions/predictions.ts
git commit -m "feat(predictions): upsert prediction action with round status check"
```

---

## Task 9: UI admin de zonas con drag-and-drop (el más grande)

**Files:**
- Modify: `app/(admin)/admin/tournaments/[id]/groups/page.tsx` (reemplazar stub)
- Create: `app/(admin)/admin/tournaments/[id]/groups/groups-editor.tsx` (Client)
- Create: `app/(admin)/admin/tournaments/[id]/groups/edit-positions-dialog.tsx` (Client)

**Primero instalar dnd-kit si no está ya:**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH" && pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 1: Page (Server Component)**

```tsx
// app/(admin)/admin/tournaments/[id]/groups/page.tsx
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { groups, groupTeams, teams } from "@/db/schema";
import { GroupsEditor } from "./groups-editor";

export default async function TournamentGroupsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  const allTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.tournamentId, tournamentId))
    .orderBy(asc(teams.name));

  const allGroups = await db
    .select()
    .from(groups)
    .where(eq(groups.tournamentId, tournamentId))
    .orderBy(asc(groups.order));

  const assignments = await db
    .select({
      groupId: groupTeams.groupId,
      teamId: groupTeams.teamId,
      finalPosition: groupTeams.finalPosition,
    })
    .from(groupTeams)
    .innerJoin(groups, eq(groupTeams.groupId, groups.id))
    .where(eq(groups.tournamentId, tournamentId));

  return (
    <GroupsEditor
      tournamentId={tournamentId}
      teams={allTeams.map((t) => ({ id: t.id, name: t.name }))}
      groups={allGroups.map((g) => ({ id: g.id, name: g.name, order: g.order }))}
      assignments={assignments}
    />
  );
}
```

- [ ] **Step 2: GroupsEditor (Client)**

```tsx
// app/(admin)/admin/tournaments/[id]/groups/groups-editor.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  assignTeamToGroupAction,
  createGroupAction,
  deleteGroupAction,
  removeTeamFromGroupAction,
  renameGroupAction,
} from "@/actions/groups";
import { generateGroupMatchesAction } from "@/actions/matches";
import { EditPositionsDialog } from "./edit-positions-dialog";

type Team = { id: string; name: string };
type Group = { id: string; name: string; order: number };
type Assignment = { groupId: string; teamId: string; finalPosition: number | null };

export function GroupsEditor({
  tournamentId,
  teams,
  groups,
  assignments,
}: {
  tournamentId: string;
  teams: Team[];
  groups: Group[];
  assignments: Assignment[];
}) {
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const teamsByGroup = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const g of groups) map.set(g.id, []);
    for (const a of assignments) {
      const t = teams.find((x) => x.id === a.teamId);
      if (!t) continue;
      map.get(a.groupId)?.push(t);
    }
    return map;
  }, [teams, groups, assignments]);

  const unassignedTeams = useMemo(() => {
    const assignedIds = new Set(assignments.map((a) => a.teamId));
    return teams.filter((t) => !assignedIds.has(t.id));
  }, [teams, assignments]);

  const [newGroupName, setNewGroupName] = useState("");

  function onCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    formData.set("name", name);
    startTransition(async () => {
      const res = await createGroupAction(formData);
      if (res.ok) {
        setNewGroupName("");
        toast.success("Zona creada");
      } else toast.error(res.error);
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const teamId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    if (overId === "unassigned") {
      startTransition(async () => {
        const res = await removeTeamFromGroupAction(teamId, tournamentId);
        if (!res.ok) toast.error(res.error);
      });
    } else {
      // overId is groupId
      startTransition(async () => {
        const res = await assignTeamToGroupAction(overId, teamId, tournamentId);
        if (!res.ok) toast.error(res.error);
      });
    }
  }

  function onDeleteGroup(groupId: string) {
    if (!confirm("¿Borrar la zona?")) return;
    startTransition(async () => {
      const res = await deleteGroupAction(groupId, tournamentId);
      if (!res.ok) toast.error(res.error);
    });
  }

  function onRenameGroup(groupId: string, newName: string) {
    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("tournamentId", tournamentId);
    formData.set("name", newName);
    startTransition(async () => {
      const res = await renameGroupAction(formData);
      if (!res.ok) toast.error(res.error);
    });
  }

  function onGenerate() {
    startTransition(async () => {
      const res = await generateGroupMatchesAction(tournamentId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if ("regenerated" in res) {
        const msgs: string[] = [];
        if (res.regenerated.length > 0)
          msgs.push(`${res.regenerated.length} regenerada(s)`);
        if (res.skipped.length > 0) msgs.push(`${res.skipped.length} sin cambios`);
        if (res.invalid.length > 0)
          msgs.push(`${res.invalid.length} con cantidad inválida (saltadas)`);
        toast.success(msgs.join(", ") || "Sin zonas para procesar");
      } else {
        toast.success("Partidos generados");
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <form onSubmit={onCreateGroup} className="flex gap-2 items-center">
            <Input
              placeholder="Nombre de la zona"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-48"
              maxLength={40}
            />
            <Button type="submit" disabled={pending || !newGroupName.trim()}>
              + Agregar zona
            </Button>
          </form>
          <div className="flex gap-2">
            <EditPositionsDialog
              tournamentId={tournamentId}
              groups={groups}
              teamsByGroup={teamsByGroup}
              assignments={assignments}
            />
            <Button onClick={onGenerate} disabled={pending}>
              Generar partidos
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                teams={teamsByGroup.get(g.id) ?? []}
                onDelete={() => onDeleteGroup(g.id)}
                onRename={(n) => onRenameGroup(g.id, n)}
              />
            ))}
            {groups.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Agregá una zona para empezar.
              </div>
            )}
          </div>

          <UnassignedList teams={unassignedTeams} />
        </div>
      </div>
    </DndContext>
  );
}

function GroupCard({
  group,
  teams,
  onDelete,
  onRename,
}: {
  group: Group;
  teams: Team[];
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: group.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const count = teams.length;
  const countColor =
    count === 3 || count === 4
      ? "text-primary"
      : count === 0
      ? "text-muted-foreground"
      : "text-destructive";

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border p-3 space-y-2 transition ${
        isOver ? "border-primary bg-primary/5" : "bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <form
            className="flex gap-1 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name.trim() !== group.name) onRename(name.trim());
              setEditing(false);
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-8"
            />
            <Button size="sm" type="submit">
              OK
            </Button>
          </form>
        ) : (
          <>
            <button
              type="button"
              className="font-medium hover:underline text-left"
              onClick={() => setEditing(true)}
            >
              {group.name}
            </button>
            <span className={`text-sm ${countColor}`}>{count}/3-4</span>
          </>
        )}
      </div>
      <div className="space-y-1 min-h-[60px]">
        {teams.map((t) => (
          <TeamChip key={t.id} team={t} />
        ))}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-destructive hover:underline"
      >
        Borrar zona
      </button>
    </div>
  );
}

function UnassignedList({ teams }: { teams: Team[] }) {
  const { isOver, setNodeRef } = useDroppable({ id: "unassigned" });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border p-3 space-y-2 transition ${
        isOver ? "border-primary bg-primary/5" : "bg-muted"
      }`}
    >
      <div className="font-medium text-sm">Sin asignar</div>
      <div className="space-y-1 min-h-[60px]">
        {teams.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todos asignados.</p>
        ) : (
          teams.map((t) => <TeamChip key={t.id} team={t} />)
        )}
      </div>
    </div>
  );
}

function TeamChip({ team }: { team: Team }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: team.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={`px-2 py-1 rounded border bg-background text-sm cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {team.name}
    </div>
  );
}
```

- [ ] **Step 3: EditPositionsDialog**

```tsx
// app/(admin)/admin/tournaments/[id]/groups/edit-positions-dialog.tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { setTeamPositionAction } from "@/actions/groups";

type Team = { id: string; name: string };
type Group = { id: string; name: string; order: number };
type Assignment = { groupId: string; teamId: string; finalPosition: number | null };

export function EditPositionsDialog({
  tournamentId,
  groups,
  teamsByGroup,
  assignments,
}: {
  tournamentId: string;
  groups: Group[];
  teamsByGroup: Map<string, Team[]>;
  assignments: Assignment[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const positionByPair = new Map<string, number | null>(
    assignments.map((a) => [`${a.groupId}:${a.teamId}`, a.finalPosition])
  );

  function onChange(groupId: string, teamId: string, value: string) {
    const parsed = value === "" ? null : parseInt(value, 10);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 1 || parsed > 4)) return;
    startTransition(async () => {
      const res = await setTeamPositionAction(groupId, teamId, parsed, tournamentId);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Editar posiciones</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Posiciones finales por zona</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {groups.map((g) => {
            const teams = teamsByGroup.get(g.id) ?? [];
            return (
              <div key={g.id} className="space-y-2">
                <div className="font-medium">{g.name}</div>
                <div className="space-y-1">
                  {teams.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2">
                      <span>{t.name}</span>
                      <input
                        type="number"
                        min={1}
                        max={4}
                        defaultValue={positionByPair.get(`${g.id}:${t.id}`) ?? ""}
                        onBlur={(e) => onChange(g.id, t.id, e.target.value)}
                        disabled={pending}
                        className="w-16 h-8 rounded-md border px-2 text-sm"
                        placeholder="?"
                      />
                    </div>
                  ))}
                  {teams.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin equipos</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Verificar build** + **Step 5: Commit**

```bash
git add actions/ app/\(admin\)/admin/tournaments/\[id\]/groups package.json pnpm-lock.yaml
git commit -m "feat(groups): admin drag-and-drop editor with generate matches button"
```

---

## Task 10: Admin page — carga de resultados

**Files:**
- Modify: `app/(admin)/admin/tournaments/[id]/matches/page.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/matches/match-result-form.tsx` (Client)

- [ ] **Step 1: Matches page (Server)**

```tsx
// app/(admin)/admin/tournaments/[id]/matches/page.tsx
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  groups,
  groupTeams,
  matches,
  rounds,
  teams,
} from "@/db/schema";
import { resolveSlot, type SlotResolverCtx } from "@/lib/slot-resolver";
import { MatchResultForm } from "./match-result-form";

export default async function TournamentMatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  const [teamsRows, groupsRows, groupTeamsRows, roundsRows, matchesRows] =
    await Promise.all([
      db.select().from(teams).where(eq(teams.tournamentId, tournamentId)),
      db.select().from(groups).where(eq(groups.tournamentId, tournamentId)),
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

  // Flatten matches from join
  const flatMatches = matchesRows.map((r) => r.matches);

  const ctx: SlotResolverCtx = {
    teamsById: new Map(teamsRows.map((t) => [t.id, { id: t.id, name: t.name }])),
    groupTeamsByPosition: new Map(
      groupTeamsRows
        .filter((gt) => gt.finalPosition != null)
        .map((gt) => [`${gt.groupId}:${gt.finalPosition}`, gt.teamId])
    ),
    matchesById: new Map(flatMatches.map((m) => [m.id, m])),
  };

  // Group matches by round
  const matchesByRound = new Map<string, typeof flatMatches>();
  for (const m of flatMatches) {
    const arr = matchesByRound.get(m.roundId) ?? [];
    arr.push(m);
    matchesByRound.set(m.roundId, arr);
  }

  if (roundsRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No hay rondas todavía. Generá partidos desde "Zonas".
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {roundsRows.map((round) => {
        const roundMatches = matchesByRound.get(round.id) ?? [];
        return (
          <section key={round.id} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium">{round.name}</h2>
              <span className="text-xs text-muted-foreground">
                Estado: {round.status}
              </span>
            </div>

            {roundMatches.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin partidos.</p>
            )}

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
                const hasBye = slotA.isBye || slotB.isBye;
                const bothReady = !!slotA.team && !!slotB.team;

                return (
                  <div
                    key={m.id}
                    className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="text-sm">
                      <span className="font-medium">
                        {slotA.team?.name ?? (slotA.isBye ? "(bye)" : "Pendiente")}
                      </span>
                      <span className="text-muted-foreground mx-2">vs</span>
                      <span className="font-medium">
                        {slotB.team?.name ?? (slotB.isBye ? "(bye)" : "Pendiente")}
                      </span>
                    </div>
                    {hasBye ? (
                      <span className="text-xs text-muted-foreground">
                        Bye — sin pronóstico
                      </span>
                    ) : bothReady && round.status !== "sin_abrir" ? (
                      <MatchResultForm
                        tournamentId={tournamentId}
                        matchId={m.id}
                        teamA={slotA.team!}
                        teamB={slotB.team!}
                        currentWinnerId={m.resultWinnerTeamId}
                        currentSets={
                          m.resultSets as 2 | 3 | null
                        }
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {round.status === "sin_abrir" ? "Ronda sin abrir" : "Pendiente"}
                      </span>
                    )}
                  </div>
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

- [ ] **Step 2: MatchResultForm (Client)**

```tsx
// app/(admin)/admin/tournaments/[id]/matches/match-result-form.tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setMatchResultAction } from "@/actions/matches";
import { Button } from "@/components/ui/button";

type Team = { id: string; name: string };

export function MatchResultForm({
  tournamentId,
  matchId,
  teamA,
  teamB,
  currentWinnerId,
  currentSets,
}: {
  tournamentId: string;
  matchId: string;
  teamA: Team;
  teamB: Team;
  currentWinnerId: string | null;
  currentSets: 2 | 3 | null;
}) {
  const [pending, startTransition] = useTransition();

  function save(winnerId: string | null, sets: 2 | 3 | null) {
    startTransition(async () => {
      const res = await setMatchResultAction(matchId, tournamentId, winnerId, sets);
      if (res.ok) toast.success("Resultado guardado");
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-wrap gap-2 items-center text-sm">
      <select
        value={currentWinnerId ?? ""}
        onChange={(e) =>
          save(e.target.value || null, currentSets ?? 2)
        }
        disabled={pending}
        className="h-8 rounded-md border px-2"
      >
        <option value="">Ganador</option>
        <option value={teamA.id}>{teamA.name}</option>
        <option value={teamB.id}>{teamB.name}</option>
      </select>
      <select
        value={currentSets ?? ""}
        onChange={(e) =>
          save(
            currentWinnerId,
            e.target.value === "" ? null : (parseInt(e.target.value) as 2 | 3)
          )
        }
        disabled={pending || !currentWinnerId}
        className="h-8 rounded-md border px-2"
      >
        <option value="">Sets</option>
        <option value="2">2</option>
        <option value="3">3</option>
      </select>
      {(currentWinnerId || currentSets) && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => save(null, null)}
          disabled={pending}
        >
          Limpiar
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build** + **Step 4: Commit**

```bash
git add app/\(admin\)/admin/tournaments/\[id\]/matches
git commit -m "feat(matches): admin page to load match results per round"
```

---

## Task 11: Admin page — estados de ronda

**Files:**
- Modify: `app/(admin)/admin/tournaments/[id]/rounds/page.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/rounds/round-status-control.tsx`

- [ ] **Step 1: Rounds page**

```tsx
// app/(admin)/admin/tournaments/[id]/rounds/page.tsx
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { RoundStatusControl } from "./round-status-control";

const STATUS_LABEL: Record<"sin_abrir" | "abierta" | "cerrada", string> = {
  sin_abrir: "Sin abrir",
  abierta: "Abierta",
  cerrada: "Cerrada",
};

export default async function TournamentRoundsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  const rows = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournamentId))
    .orderBy(asc(rounds.order));

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No hay rondas. Generá partidos desde "Zonas" para crear la ronda de fase de grupos.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div
          key={r.id}
          className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div>
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground">
              {r.kind === "groups" ? "Fase de grupos" : "Playoff"} ·{" "}
              Estado: {STATUS_LABEL[r.status]}
            </div>
          </div>
          <RoundStatusControl
            roundId={r.id}
            tournamentId={tournamentId}
            status={r.status}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: RoundStatusControl**

```tsx
// app/(admin)/admin/tournaments/[id]/rounds/round-status-control.tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { changeRoundStatusAction } from "@/actions/rounds";

type Status = "sin_abrir" | "abierta" | "cerrada";

export function RoundStatusControl({
  roundId,
  tournamentId,
  status,
}: {
  roundId: string;
  tournamentId: string;
  status: Status;
}) {
  const [pending, startTransition] = useTransition();

  function change(next: Status) {
    startTransition(async () => {
      const res = await changeRoundStatusAction(roundId, tournamentId, next);
      if (res.ok) toast.success("Estado actualizado");
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex gap-2">
      {status === "sin_abrir" && (
        <Button size="sm" onClick={() => change("abierta")} disabled={pending}>
          Abrir ronda
        </Button>
      )}
      {status === "abierta" && (
        <Button size="sm" onClick={() => change("cerrada")} disabled={pending}>
          Cerrar ronda
        </Button>
      )}
      {status === "cerrada" && (
        <span className="text-xs text-muted-foreground">
          Ronda cerrada (no se puede volver atrás)
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build** + **Step 4: Commit**

```bash
git add app/\(admin\)/admin/tournaments/\[id\]/rounds
git commit -m "feat(rounds): admin page with state machine controls"
```

---

## Task 12: Player — pronósticos en fase de grupos

**Files:**
- Modify: `app/(player)/player/tournaments/[id]/groups/page.tsx`
- Create: `app/(player)/player/tournaments/[id]/groups/match-prediction.tsx`

- [ ] **Step 1: Player groups page (Server)**

```tsx
// app/(player)/player/tournaments/[id]/groups/page.tsx
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
import { MatchPrediction } from "./match-prediction";

export default async function PlayerGroupsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const [teamsRows, groupsRows, groupTeamsRows, groupsRound, allMatches, userPredictions] =
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
        .where(
          and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "groups"))
        )
        .limit(1),
      db
        .select()
        .from(matches)
        .innerJoin(rounds, eq(matches.roundId, rounds.id))
        .where(
          and(eq(rounds.tournamentId, tournamentId), eq(rounds.kind, "groups"))
        ),
      db
        .select()
        .from(predictions)
        .where(eq(predictions.userId, session.user.id)),
    ]);

  const round = groupsRound[0];
  if (!round) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Aún no hay fase de grupos configurada.
      </div>
    );
  }

  if (round.status === "sin_abrir") {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        La fase de grupos todavía no está abierta para pronósticos.
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

  const predictionByMatch = new Map(
    userPredictions.map((p) => [p.matchId, p])
  );

  const matchesByGroup = new Map<string, typeof flatMatches>();
  for (const m of flatMatches) {
    if (!m.groupId) continue;
    const arr = matchesByGroup.get(m.groupId) ?? [];
    arr.push(m);
    matchesByGroup.set(m.groupId, arr);
  }

  const locked = round.status === "cerrada";

  return (
    <div className="space-y-6">
      <div className="text-xs text-muted-foreground">
        Ronda: {round.status === "abierta" ? "abierta" : "cerrada (read-only)"}
      </div>
      {groupsRows.map((g) => {
        const grpMatches = (matchesByGroup.get(g.id) ?? []).sort(
          (a, b) => a.order - b.order
        );
        return (
          <section key={g.id} className="space-y-2">
            <h2 className="text-base font-semibold">{g.name}</h2>
            {grpMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin partidos.</p>
            ) : (
              <div className="space-y-2">
                {grpMatches.map((m) => {
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
                        Partido pendiente (esperando resultados anteriores)
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
            )}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: MatchPrediction (Client, autosave)**

```tsx
// app/(player)/player/tournaments/[id]/groups/match-prediction.tsx
"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { toast } from "sonner";
import { upsertPredictionAction } from "@/actions/predictions";

type Team = { id: string; name: string };
type Prediction = { winnerTeamId: string; sets: 2 | 3 };

export function MatchPrediction({
  tournamentId,
  matchId,
  teamA,
  teamB,
  resultWinnerId,
  resultSets,
  initialPrediction,
  locked,
}: {
  tournamentId: string;
  matchId: string;
  teamA: Team;
  teamB: Team;
  resultWinnerId: string | null;
  resultSets: 2 | 3 | null;
  initialPrediction: Prediction | null;
  locked: boolean;
}) {
  const [pred, setPred] = useState<Prediction | null>(initialPrediction);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function save(next: Prediction) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await upsertPredictionAction(
          matchId,
          tournamentId,
          next.winnerTeamId,
          next.sets
        );
        if (!res.ok) toast.error(res.error);
      });
    }, 300);
  }

  function onWinnerChange(winnerTeamId: string) {
    const next: Prediction = { winnerTeamId, sets: pred?.sets ?? 2 };
    setPred(next);
    if (!locked) save(next);
  }

  function onSetsChange(sets: 2 | 3) {
    if (!pred) return;
    const next: Prediction = { ...pred, sets };
    setPred(next);
    if (!locked) save(next);
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {teamA.name} vs {teamB.name}
        </span>
        {resultWinnerId && resultSets && (
          <span className="text-xs text-muted-foreground">
            Resultado: {resultWinnerId === teamA.id ? teamA.name : teamB.name} en{" "}
            {resultSets} sets
          </span>
        )}
      </div>
      <div className="flex gap-4">
        <fieldset className="flex gap-3 items-center" disabled={locked}>
          <legend className="sr-only">Ganador</legend>
          {[teamA, teamB].map((t) => (
            <label key={t.id} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`winner-${matchId}`}
                checked={pred?.winnerTeamId === t.id}
                onChange={() => onWinnerChange(t.id)}
              />
              {t.name}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex gap-3 items-center" disabled={locked || !pred}>
          <legend className="sr-only">Sets</legend>
          {([2, 3] as const).map((s) => (
            <label key={s} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`sets-${matchId}`}
                checked={pred?.sets === s}
                onChange={() => onSetsChange(s)}
              />
              {s} sets
            </label>
          ))}
        </fieldset>
      </div>
      {pending && <p className="text-xs text-muted-foreground">Guardando...</p>}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build** + **Step 4: Commit**

```bash
git add app/\(player\)/player/tournaments/\[id\]/groups
git commit -m "feat(player): predictions in groups with autosave debounced 300ms"
```

---

## Task 13: Player — ranking

**Files:**
- Modify: `app/(player)/player/tournaments/[id]/ranking/page.tsx`

- [ ] **Step 1: Ranking page**

```tsx
// app/(player)/player/tournaments/[id]/ranking/page.tsx
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  matches,
  predictions,
  rounds,
  users,
} from "@/db/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeRanking } from "@/lib/scoring";

export default async function PlayerRankingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;

  const [usersRows, tournamentMatches, allPredictions] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users),
    db
      .select({
        id: matches.id,
        resultWinnerTeamId: matches.resultWinnerTeamId,
        resultSets: matches.resultSets,
      })
      .from(matches)
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .where(eq(rounds.tournamentId, tournamentId)),
    db
      .select({
        matchId: predictions.matchId,
        userId: predictions.userId,
        predictedWinnerTeamId: predictions.predictedWinnerTeamId,
        predictedSets: predictions.predictedSets,
      })
      .from(predictions)
      .innerJoin(matches, eq(predictions.matchId, matches.id))
      .innerJoin(rounds, eq(matches.roundId, rounds.id))
      .where(eq(rounds.tournamentId, tournamentId)),
  ]);

  const ranking = computeRanking(
    usersRows,
    tournamentMatches.map((m) => ({
      id: m.id,
      resultWinnerTeamId: m.resultWinnerTeamId,
      resultSets: m.resultSets,
    })),
    allPredictions.map((p) => ({
      matchId: p.matchId,
      userId: p.userId,
      predictedWinnerTeamId: p.predictedWinnerTeamId,
      predictedSets: p.predictedSets,
    }))
  );

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Ranking</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[1%]">#</TableHead>
            <TableHead>Jugador</TableHead>
            <TableHead className="text-right">Puntos</TableHead>
            <TableHead className="text-right">Aciertos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranking.map((r, i) => (
            <TableRow key={r.userId}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell className="text-right font-medium">{r.points}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {r.correctWinners}
              </TableCell>
            </TableRow>
          ))}
          {ranking.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Sin datos todavía.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build** + **Step 3: Commit**

```bash
git add app/\(player\)/player/tournaments/\[id\]/ranking
git commit -m "feat(player): tournament ranking page with on-the-fly scoring"
```

---

## Task 14: Smoke test end-to-end Fase 3

- [ ] **Step 1: Flow admin completo**

1. Logueate como admin, entrá al torneo "Test Open 2026" (o creá uno nuevo).
2. Ir a tab "Equipos": crear 7 equipos (ej: Alfa, Beta, Gamma, Delta, Épsilon, Zeta, Eta).
3. Ir a tab "Zonas":
   - Agregar 2 zonas: "Grupo A" y "Grupo B".
   - Arrastrar 3 equipos a Grupo A (Alfa, Beta, Gamma).
   - Arrastrar 4 equipos a Grupo B (Delta, Épsilon, Zeta, Eta).
   - Contadores deben mostrar "3/3-4" y "4/3-4" en verde/primary.
   - Click "Generar partidos" → toast con "2 regeneradas".
4. Volver a "Zonas": click "Editar posiciones" → marcar posiciones 1-3 en cada equipo del Grupo A y 1-4 en Grupo B → cerrar modal.
5. Ir a tab "Rondas": ver "Fase de grupos" con status "Sin abrir" → click "Abrir ronda".
6. Ir a tab "Partidos": ver 3 + 4 = 7 partidos. Cargar resultados en 2-3 de ellos (ganador + sets).
7. Ir a tab "Rondas": click "Cerrar ronda".

- [ ] **Step 2: Flow player**

1. Desde la sesión admin, navegar manualmente a `/player/tournaments/<id>/groups`. Verás que el aviso "Ronda cerrada (read-only)" (porque ya la cerraste).
2. Volver al admin, "Abrir ronda" de nuevo (si el estado lo permite; si no, para testear pronósticos, usar un segundo torneo o el mismo sin cerrar aún).
3. Como player (o admin visitando /player/...), en `/player/tournaments/<id>/groups`:
   - Ver los partidos agrupados por zona.
   - Elegir ganador y sets en 2-3 partidos → ver "Guardando..." momentáneamente → sin error.
   - Recargar página → los pronósticos quedaron guardados.
4. En `/player/tournaments/<id>/ranking`: ver la tabla con tu usuario y puntos (si ya hay resultados cargados que coincidan con pronósticos).

- [ ] **Step 3: Tests + build final**

```bash
pnpm test
pnpm build
```

Esperar todos los tests (cn, password, tokens, match-generator, scoring, slot-resolver) verdes.

- [ ] **Step 4: Tag**

```bash
git tag phase-3-groups-matches-predictions
```

---

## Criterios de aceptación Fase 3

- [x] Drag-and-drop funcional para asignar equipos a zonas.
- [x] Botón "Generar partidos" idempotente (3 → 3 matches, 4 → 4 matches cruzados).
- [x] Modal "Editar posiciones" permite marcar 1-4 por equipo.
- [x] Máquina de estados de ronda funciona: no se puede saltear pasos.
- [x] Admin carga resultados solo cuando la ronda está `abierta` o `cerrada` (no en `sin_abrir`).
- [x] Player ve partidos solo si ronda está `abierta` o `cerrada`; carga pronósticos solo si `abierta`.
- [x] Autosave de pronósticos con debounce.
- [x] Ranking on-the-fly con desempate por aciertos → alfabético.
- [x] Tests de lib verdes (match-generator, scoring, slot-resolver).
- [x] `pnpm build` limpio.

## Deferido

- **Fase 4:** Playoff (rondas eliminatorias, slots `group_position` y `match_winner`, auto-complete, invalidación de pronósticos al cambiar posiciones o ganadores).
- **Fase 5:** Pulido, deploy, verificación de dominio Resend.

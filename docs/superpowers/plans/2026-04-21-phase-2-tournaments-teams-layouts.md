# Fase 2 — Torneos, Equipos & Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD de torneos con detalle por tabs, CRUD de equipos por torneo, layout de player mobile-first, y selector de torneo compartido.

**Architecture:** Construido sobre Fase 1 (Next.js 15 App Router + Drizzle + Auth.js). Agrega rutas admin `/admin/tournaments/*` y rutas player `/player/tournaments/*`. Mismo patrón de Server Components + Server Actions + shadcn/ui que Fase 1.

**Tech Stack:** Next.js 15, Drizzle ORM, Auth.js v5, shadcn/ui, Zod, pnpm.

---

## Reference

- Spec: [docs/superpowers/specs/2026-04-21-padel-prode-design.md](../specs/2026-04-21-padel-prode-design.md) §3 (modelo), §8 (UI & rutas).
- Plan Fase 1: [docs/superpowers/plans/2026-04-21-phase-1-foundation.md](2026-04-21-phase-1-foundation.md).

---

## File Structure — delta sobre Fase 1

```
actions/
  tournaments.ts           (nuevo)
  teams.ts                 (nuevo)
app/
  (admin)/
    admin/
      tournaments/
        page.tsx           (reemplaza el stub de Fase 1)
        new/
          page.tsx         (nuevo)
        [id]/
          layout.tsx       (nuevo, tabs)
          page.tsx         (nuevo — redirect a /teams)
          teams/
            page.tsx       (nuevo)
            create-team-dialog.tsx  (nuevo)
            team-row-actions.tsx    (nuevo)
          groups/
            page.tsx       (stub Fase 3)
          playoff/
            page.tsx       (stub Fase 4)
          matches/
            page.tsx       (stub Fase 3)
          rounds/
            page.tsx       (stub Fase 3)
  (player)/
    layout.tsx             (nuevo, mobile-first)
    player/
      tournaments/
        page.tsx           (nuevo — selector)
        [id]/
          layout.tsx       (nuevo — nav bottom tabs)
          page.tsx         (nuevo — redirect a /groups)
          groups/
            page.tsx       (stub Fase 3)
          playoff/
            page.tsx       (stub Fase 4)
          ranking/
            page.tsx       (stub Fase 3)
components/
  tournament-switcher.tsx  (nuevo)
  player-nav.tsx           (nuevo)
```

Files de Fase 1 que se TOCAN:
- `components/header.tsx` — agregar `TournamentSwitcher` al nav admin.
- `app/page.tsx` — el redirect de player pasa a `/player/tournaments` en vez del mensaje de bienvenida.

---

## Task 1: Server actions de torneos

**Files:**
- Create: `actions/tournaments.ts`

- [ ] **Step 1: Crear `actions/tournaments.ts`**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tournaments } from "@/db/schema";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type TournamentActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().uuid();

const createTournamentSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(120),
});

export async function createTournamentAction(formData: FormData) {
  await requireAdmin();
  const parsed = createTournamentSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const [row] = await db
    .insert(tournaments)
    .values({ name: parsed.data.name, status: "draft" })
    .returning({ id: tournaments.id });

  revalidatePath("/admin/tournaments");
  redirect(`/admin/tournaments/${row.id}`);
}

const updateTournamentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export async function updateTournamentAction(
  formData: FormData
): Promise<TournamentActionResult> {
  await requireAdmin();
  const parsed = updateTournamentSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await db
    .update(tournaments)
    .set({ name: parsed.data.name })
    .where(eq(tournaments.id, parsed.data.id));

  revalidatePath(`/admin/tournaments/${parsed.data.id}`);
  revalidatePath("/admin/tournaments");
  return { ok: true };
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "active", "finished"]),
});

export async function changeTournamentStatusAction(
  id: string,
  status: "draft" | "active" | "finished"
): Promise<TournamentActionResult> {
  await requireAdmin();
  const parsed = statusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  await db
    .update(tournaments)
    .set({ status: parsed.data.status })
    .where(eq(tournaments.id, parsed.data.id));

  revalidatePath(`/admin/tournaments/${parsed.data.id}`);
  revalidatePath("/admin/tournaments");
  revalidatePath("/player/tournaments");
  return { ok: true };
}

export async function deleteTournamentAction(
  id: string
): Promise<TournamentActionResult> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "ID inválido" };

  await db.delete(tournaments).where(eq(tournaments.id, parsed.data));
  revalidatePath("/admin/tournaments");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar build**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH" && pnpm build 2>&1 | tail -5`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add actions/tournaments.ts
git commit -m "feat(tournaments): server actions for CRUD and status change"
```

---

## Task 2: Lista de torneos admin

**Files:**
- Modify: `app/(admin)/admin/tournaments/page.tsx` (reemplaza el stub de Fase 1)

- [ ] **Step 1: Reemplazar el stub**

```tsx
import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABEL: Record<"draft" | "active" | "finished", string> = {
  draft: "Borrador",
  active: "Activo",
  finished: "Finalizado",
};

export default async function TournamentsPage() {
  const rows = await db.select().from(tournaments).orderBy(desc(tournaments.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Torneos</h1>
        <Button asChild>
          <Link href="/admin/tournaments/new">Crear torneo</Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Creado</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <Link
                  href={`/admin/tournaments/${t.id}`}
                  className="font-medium hover:underline"
                >
                  {t.name}
                </Link>
              </TableCell>
              <TableCell>{STATUS_LABEL[t.status]}</TableCell>
              <TableCell>{t.createdAt.toLocaleDateString("es-AR")}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/admin/tournaments/${t.id}`}>Abrir</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No hay torneos todavía.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `pnpm build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/tournaments/page.tsx
git commit -m "feat(tournaments): admin list page with status and create link"
```

---

## Task 3: Crear torneo (form)

**Files:**
- Create: `app/(admin)/admin/tournaments/new/page.tsx`

- [ ] **Step 1: Página de creación**

```tsx
import Link from "next/link";
import { createTournamentAction } from "@/actions/tournaments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewTournamentPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo torneo</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTournamentAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                placeholder="Ej: Premier Padel 2026"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" asChild>
                <Link href="/admin/tournaments">Cancelar</Link>
              </Button>
              <Button type="submit">Crear</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build** + **Step 3: Commit**

```bash
git add app/\(admin\)/admin/tournaments/new
git commit -m "feat(tournaments): create new tournament form"
```

---

## Task 4: Layout de detalle de torneo con tabs

**Files:**
- Create: `app/(admin)/admin/tournaments/[id]/layout.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/page.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/tabs-nav.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/status-control.tsx`

- [ ] **Step 1: Layout (Server Component)**

```tsx
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { TabsNav } from "./tabs-nav";
import { StatusControl } from "./status-control";

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, id))
    .limit(1);

  if (!tournament) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{tournament.name}</h1>
        <StatusControl tournamentId={tournament.id} status={tournament.status} />
      </div>
      <TabsNav tournamentId={tournament.id} />
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Página index (redirige a teams)**

```tsx
import { redirect } from "next/navigation";

export default async function TournamentIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/tournaments/${id}/teams`);
}
```

- [ ] **Step 3: Tabs nav (Client)**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Equipos", segment: "teams" },
  { label: "Zonas", segment: "groups" },
  { label: "Playoff", segment: "playoff" },
  { label: "Partidos", segment: "matches" },
  { label: "Rondas", segment: "rounds" },
];

export function TabsNav({ tournamentId }: { tournamentId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b overflow-x-auto">
      {TABS.map((tab) => {
        const href = `/admin/tournaments/${tournamentId}/${tab.segment}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.segment}
            href={href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Status control (Client)**

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { changeTournamentStatusAction, deleteTournamentAction } from "@/actions/tournaments";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS: { value: "draft" | "active" | "finished"; label: string }[] = [
  { value: "draft", label: "Borrador" },
  { value: "active", label: "Activo" },
  { value: "finished", label: "Finalizado" },
];

export function StatusControl({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: "draft" | "active" | "finished";
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as "draft" | "active" | "finished";
    if (next === status) return;
    startTransition(async () => {
      const res = await changeTournamentStatusAction(tournamentId, next);
      if (res.ok) toast.success("Estado actualizado");
      else toast.error(res.error);
    });
  }

  function onDelete() {
    if (!confirm("¿Borrar este torneo? Se borran zonas, equipos y partidos.")) return;
    startTransition(async () => {
      const res = await deleteTournamentAction(tournamentId);
      if (res.ok) {
        toast.success("Torneo borrado");
        router.push("/admin/tournaments");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={onChange}
        disabled={pending}
        className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Button variant="ghost" size="sm" onClick={onDelete} disabled={pending}>
        Borrar
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Verificar build** + **Step 6: Commit**

```bash
git add app/\(admin\)/admin/tournaments/\[id\]
git commit -m "feat(tournaments): detail layout with tabs, status control, delete"
```

---

## Task 5: Stubs para tabs no-equipos (Fases 3-4)

**Files:**
- Create: `app/(admin)/admin/tournaments/[id]/groups/page.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/playoff/page.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/matches/page.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/rounds/page.tsx`

- [ ] **Step 1: Crear los 4 stubs (mismo contenido, variando el texto)**

Cada archivo tiene esta forma, ajustando nombre de sección y fase:

```tsx
export default function Page() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
      <p className="text-lg font-medium mb-1">Próximamente</p>
      <p className="text-sm">Esta sección se implementa en Fase {FASE}.</p>
    </div>
  );
}
```

Mapping:
- `groups/page.tsx` → "Zonas", Fase 3
- `playoff/page.tsx` → "Playoff", Fase 4
- `matches/page.tsx` → "Partidos", Fase 3
- `rounds/page.tsx` → "Rondas", Fase 3

Contenido concreto para cada uno (copia verbatim, cambiando solo el número de fase en el texto):

**`groups/page.tsx`:**
```tsx
export default function GroupsStubPage() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
      <p className="text-lg font-medium mb-1">Zonas — próximamente</p>
      <p className="text-sm">Esta sección se implementa en Fase 3.</p>
    </div>
  );
}
```

**`playoff/page.tsx`:**
```tsx
export default function PlayoffStubPage() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
      <p className="text-lg font-medium mb-1">Playoff — próximamente</p>
      <p className="text-sm">Esta sección se implementa en Fase 4.</p>
    </div>
  );
}
```

**`matches/page.tsx`:**
```tsx
export default function MatchesStubPage() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
      <p className="text-lg font-medium mb-1">Partidos — próximamente</p>
      <p className="text-sm">Esta sección se implementa en Fase 3.</p>
    </div>
  );
}
```

**`rounds/page.tsx`:**
```tsx
export default function RoundsStubPage() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
      <p className="text-lg font-medium mb-1">Rondas — próximamente</p>
      <p className="text-sm">Esta sección se implementa en Fase 3.</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/admin/tournaments/\[id\]/groups app/\(admin\)/admin/tournaments/\[id\]/playoff app/\(admin\)/admin/tournaments/\[id\]/matches app/\(admin\)/admin/tournaments/\[id\]/rounds
git commit -m "feat(tournaments): stubs for groups/playoff/matches/rounds tabs"
```

---

## Task 6: Server actions de equipos

**Files:**
- Create: `actions/teams.ts`

- [ ] **Step 1: Acciones CRUD de equipos**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { teams, tournaments } from "@/db/schema";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

export type TeamActionResult = { ok: true } | { ok: false; error: string };

const teamFieldsSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(80),
  player1Name: z.string().min(1, "Jugador 1 requerido").max(80),
  player2Name: z.string().min(1, "Jugador 2 requerido").max(80),
});

const createTeamSchema = teamFieldsSchema.extend({
  tournamentId: z.string().uuid(),
});

export async function createTeamAction(
  formData: FormData
): Promise<TeamActionResult> {
  await requireAdmin();
  const parsed = createTeamSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    name: formData.get("name"),
    player1Name: formData.get("player1Name"),
    player2Name: formData.get("player2Name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const [t] = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.id, parsed.data.tournamentId))
    .limit(1);
  if (!t) return { ok: false, error: "Torneo no encontrado" };

  await db.insert(teams).values(parsed.data);

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/teams`);
  return { ok: true };
}

const updateTeamSchema = teamFieldsSchema.extend({
  id: z.string().uuid(),
  tournamentId: z.string().uuid(),
});

export async function updateTeamAction(
  formData: FormData
): Promise<TeamActionResult> {
  await requireAdmin();
  const parsed = updateTeamSchema.safeParse({
    id: formData.get("id"),
    tournamentId: formData.get("tournamentId"),
    name: formData.get("name"),
    player1Name: formData.get("player1Name"),
    player2Name: formData.get("player2Name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await db
    .update(teams)
    .set({
      name: parsed.data.name,
      player1Name: parsed.data.player1Name,
      player2Name: parsed.data.player2Name,
    })
    .where(eq(teams.id, parsed.data.id));

  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/teams`);
  return { ok: true };
}

const deleteTeamSchema = z.object({
  id: z.string().uuid(),
  tournamentId: z.string().uuid(),
});

export async function deleteTeamAction(
  id: string,
  tournamentId: string
): Promise<TeamActionResult> {
  await requireAdmin();
  const parsed = deleteTeamSchema.safeParse({ id, tournamentId });
  if (!parsed.success) return { ok: false, error: "ID inválido" };

  await db.delete(teams).where(eq(teams.id, parsed.data.id));
  revalidatePath(`/admin/tournaments/${parsed.data.tournamentId}/teams`);
  return { ok: true };
}
```

- [ ] **Step 2: Verificar build** + **Step 3: Commit**

```bash
git add actions/teams.ts
git commit -m "feat(teams): server actions for CRUD per tournament"
```

---

## Task 7: Página de equipos por torneo

**Files:**
- Create: `app/(admin)/admin/tournaments/[id]/teams/page.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/teams/team-dialog.tsx`
- Create: `app/(admin)/admin/tournaments/[id]/teams/team-row-actions.tsx`

- [ ] **Step 1: Lista (Server Component)**

```tsx
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeamDialog } from "./team-dialog";
import { TeamRowActions } from "./team-row-actions";

export default async function TournamentTeamsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rows = await db
    .select()
    .from(teams)
    .where(eq(teams.tournamentId, id))
    .orderBy(asc(teams.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Equipos</h2>
        <TeamDialog mode="create" tournamentId={id} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Equipo</TableHead>
            <TableHead>Jugador 1</TableHead>
            <TableHead>Jugador 2</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>{t.player1Name}</TableCell>
              <TableCell>{t.player2Name}</TableCell>
              <TableCell>
                <TeamRowActions
                  team={{
                    id: t.id,
                    name: t.name,
                    player1Name: t.player1Name,
                    player2Name: t.player2Name,
                  }}
                  tournamentId={id}
                />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No hay equipos todavía.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Team dialog (Client)**

```tsx
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createTeamAction, updateTeamAction } from "@/actions/teams";

type Team = {
  id: string;
  name: string;
  player1Name: string;
  player2Name: string;
};

type Props =
  | { mode: "create"; tournamentId: string; team?: never; trigger?: React.ReactNode }
  | { mode: "edit"; tournamentId: string; team: Team; trigger?: React.ReactNode };

export function TeamDialog(props: Props) {
  const { mode, tournamentId } = props;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createTeamAction(formData)
          : await updateTeamAction(formData);

      if (result.ok) {
        toast.success(mode === "create" ? "Equipo creado" : "Equipo actualizado");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  const trigger = props.trigger ?? (
    <Button>{mode === "create" ? "Crear equipo" : "Editar"}</Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Nuevo equipo" : "Editar equipo"}
            </DialogTitle>
          </DialogHeader>
          <input type="hidden" name="tournamentId" value={tournamentId} />
          {mode === "edit" && <input type="hidden" name="id" value={props.team.id} />}

          <div className="space-y-2">
            <Label htmlFor="name">Nombre del equipo</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={80}
              defaultValue={mode === "edit" ? props.team.name : ""}
              placeholder="Ej: Los Titanes"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="player1Name">Jugador 1</Label>
            <Input
              id="player1Name"
              name="player1Name"
              required
              maxLength={80}
              defaultValue={mode === "edit" ? props.team.player1Name : ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="player2Name">Jugador 2</Label>
            <Input
              id="player2Name"
              name="player2Name"
              required
              maxLength={80}
              defaultValue={mode === "edit" ? props.team.player2Name : ""}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Row actions (Client)**

```tsx
"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { deleteTeamAction } from "@/actions/teams";
import { TeamDialog } from "./team-dialog";

type Team = {
  id: string;
  name: string;
  player1Name: string;
  player2Name: string;
};

export function TeamRowActions({
  team,
  tournamentId,
}: {
  team: Team;
  tournamentId: string;
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`¿Borrar el equipo "${team.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteTeamAction(team.id, tournamentId);
      if (res.ok) toast.success("Equipo borrado");
      else toast.error(res.error);
    });
  }

  return (
    <div className="flex gap-1 justify-end">
      <TeamDialog
        mode="edit"
        tournamentId={tournamentId}
        team={team}
        trigger={
          <Button variant="ghost" size="sm">
            Editar
          </Button>
        }
      />
      <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
        Borrar
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Verificar build** + **Step 5: Commit**

```bash
git add app/\(admin\)/admin/tournaments/\[id\]/teams
git commit -m "feat(teams): list, create/edit dialog, row actions per tournament"
```

---

## Task 8: Tournament switcher (compartido)

**Files:**
- Create: `components/tournament-switcher.tsx`
- Modify: `components/header.tsx` (agregar el switcher en nav admin)

- [ ] **Step 1: Switcher**

```tsx
// components/tournament-switcher.tsx
import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export async function TournamentSwitcher({
  basePath,
}: {
  basePath: "/admin/tournaments" | "/player/tournaments";
}) {
  const rows = await db
    .select({ id: tournaments.id, name: tournaments.name, status: tournaments.status })
    .from(tournaments)
    .orderBy(desc(tournaments.createdAt));

  const visible = basePath === "/player/tournaments"
    ? rows.filter((t) => t.status !== "draft")
    : rows;

  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          Torneos ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visible.map((t) => (
          <DropdownMenuItem key={t.id} asChild>
            <Link href={`${basePath}/${t.id}`}>{t.name}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Integrar en header**

Reemplazar el contenido de `components/header.tsx` por:

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { TournamentSwitcher } from "@/components/tournament-switcher";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  const isAdmin = user.role === "admin";

  return (
    <header className="border-b bg-card">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="font-semibold text-primary">
          Padel Prode
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {isAdmin ? (
            <>
              <Link href="/admin/tournaments" className="px-2 hover:underline">
                Torneos
              </Link>
              <Link href="/admin/users" className="px-2 hover:underline">
                Usuarios
              </Link>
            </>
          ) : (
            <TournamentSwitcher basePath="/player/tournaments" />
          )}
          <span className="text-muted-foreground px-2">{user.name}</span>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Salir
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verificar build** + **Step 4: Commit**

```bash
git add components/tournament-switcher.tsx components/header.tsx
git commit -m "feat(ui): tournament switcher in header (admin + player variants)"
```

---

## Task 9: Layout player (mobile-first)

**Files:**
- Create: `app/(player)/layout.tsx`
- Create: `components/player-header.tsx`

- [ ] **Step 1: Player header (Server Component)**

```tsx
// components/player-header.tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { TournamentSwitcher } from "./tournament-switcher";

export async function PlayerHeader() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  return (
    <header className="border-b bg-card sticky top-0 z-10">
      <div className="container flex h-14 items-center justify-between px-4">
        <Link href="/player/tournaments" className="font-semibold text-primary">
          Padel Prode
        </Link>
        <div className="flex items-center gap-1">
          <TournamentSwitcher basePath="/player/tournaments" />
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Layout player**

```tsx
// app/(player)/layout.tsx
import { PlayerHeader } from "@/components/player-header";

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PlayerHeader />
      <main className="flex-1 px-4 py-4 max-w-3xl w-full mx-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Verificar build** + **Step 4: Commit**

```bash
git add app/\(player\)/layout.tsx components/player-header.tsx
git commit -m "feat(player): mobile-first layout with sticky header and switcher"
```

---

## Task 10: Lista de torneos player (selector)

**Files:**
- Create: `app/(player)/player/tournaments/page.tsx`

- [ ] **Step 1: Lista con cards**

```tsx
import Link from "next/link";
import { desc, ne } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABEL: Record<"draft" | "active" | "finished", string> = {
  draft: "Borrador",
  active: "Activo",
  finished: "Finalizado",
};

export default async function PlayerTournamentsPage() {
  const rows = await db
    .select()
    .from(tournaments)
    .where(ne(tournaments.status, "draft"))
    .orderBy(desc(tournaments.createdAt));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Torneos</h1>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay torneos disponibles todavía.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((t) => (
            <Link key={t.id} href={`/player/tournaments/${t.id}`}>
              <Card className="hover:border-primary/50 transition">
                <CardHeader>
                  <CardTitle className="text-base">{t.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Estado: {STATUS_LABEL[t.status]}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar build** + **Step 3: Commit**

```bash
git add app/\(player\)/player/tournaments/page.tsx
git commit -m "feat(player): tournaments list as selector cards"
```

---

## Task 11: Detalle player con tabs bottom-nav

**Files:**
- Create: `app/(player)/player/tournaments/[id]/layout.tsx`
- Create: `app/(player)/player/tournaments/[id]/page.tsx`
- Create: `components/player-bottom-nav.tsx`
- Create stubs:
  - `app/(player)/player/tournaments/[id]/groups/page.tsx`
  - `app/(player)/player/tournaments/[id]/playoff/page.tsx`
  - `app/(player)/player/tournaments/[id]/ranking/page.tsx`

- [ ] **Step 1: Bottom nav (Client)**

```tsx
// components/player-bottom-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Zonas", segment: "groups" },
  { label: "Playoff", segment: "playoff" },
  { label: "Ranking", segment: "ranking" },
];

export function PlayerBottomNav({ tournamentId }: { tournamentId: string }) {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 border-t bg-card">
      <div className="container grid grid-cols-3 max-w-3xl">
        {TABS.map((tab) => {
          const href = `/player/tournaments/${tournamentId}/${tab.segment}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={tab.segment}
              href={href}
              className={cn(
                "py-3 text-center text-sm font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Layout del detalle player**

```tsx
// app/(player)/player/tournaments/[id]/layout.tsx
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { PlayerBottomNav } from "@/components/player-bottom-nav";

export default async function PlayerTournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, id))
    .limit(1);

  if (!tournament || tournament.status === "draft") notFound();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex-1 space-y-4 pb-4">
        <h1 className="text-lg font-semibold">{tournament.name}</h1>
        {children}
      </div>
      <PlayerBottomNav tournamentId={tournament.id} />
    </div>
  );
}
```

- [ ] **Step 3: Index del detalle (redirect a groups)**

```tsx
// app/(player)/player/tournaments/[id]/page.tsx
import { redirect } from "next/navigation";

export default async function PlayerTournamentIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/player/tournaments/${id}/groups`);
}
```

- [ ] **Step 4: Stubs de las tres tabs**

`groups/page.tsx`, `playoff/page.tsx`, `ranking/page.tsx`. Contenido de cada uno:

**`groups/page.tsx`:**
```tsx
export default function PlayerGroupsStubPage() {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      Zonas — próximamente en Fase 3.
    </div>
  );
}
```

**`playoff/page.tsx`:**
```tsx
export default function PlayerPlayoffStubPage() {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      Playoff — próximamente en Fase 4.
    </div>
  );
}
```

**`ranking/page.tsx`:**
```tsx
export default function PlayerRankingStubPage() {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      Ranking — próximamente en Fase 3.
    </div>
  );
}
```

- [ ] **Step 5: Verificar build** + **Step 6: Commit**

```bash
git add app/\(player\) components/player-bottom-nav.tsx
git commit -m "feat(player): tournament detail layout with bottom-nav and stub tabs"
```

---

## Task 12: Ajustar home redirect

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Redirigir players a `/player/tournaments`**

Reemplazar la parte final de `app/page.tsx`. El archivo actual termina con un `return` que muestra la pantalla de bienvenida para players. Reemplazar ese return por:

```tsx
  redirect("/player/tournaments");
}
```

El archivo completo queda:

```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (session.user.mustChangePassword) redirect("/change-password");

  if (session.user.role === "admin") {
    redirect("/admin/tournaments");
  }

  redirect("/player/tournaments");
}
```

- [ ] **Step 2: Verificar build** + **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: player home redirects to /player/tournaments"
```

---

## Task 13: Smoke test de Fase 2

**Files:** ninguno.

- [ ] **Step 1: Levantar dev server**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH" && pnpm dev`

- [ ] **Step 2: Checklist como admin**

Con el admin ya creado en Fase 1, probar:

1. `/admin/tournaments` — ver la tabla vacía. Click "Crear torneo".
2. Crear un torneo "Test Open 2026". Debería redirigir a `/admin/tournaments/<id>/teams`.
3. En la misma pantalla, tabs visibles: Equipos · Zonas · Playoff · Partidos · Rondas. Status selector con "Borrador" seleccionado.
4. Cambiar status a "Activo" → toast "Estado actualizado".
5. Click "Crear equipo" → llenar "Equipo A" / "Juan" / "Pedro" → crear. Aparece en la tabla.
6. Click "Editar" en el equipo → cambiar el nombre → guardar. Cambio reflejado.
7. Click "Borrar" en el equipo → confirmar → el equipo desaparece.
8. Crear 4 equipos más.
9. Ir a tab "Zonas" → ver el placeholder "Próximamente Fase 3". Igual para Playoff/Partidos/Rondas.
10. En el header, click "Torneos" → volver a la lista. Crear otro torneo "Masters 1000".
11. Volver a `/admin/users` → crear un user player con tu email (ya probaste esto en Fase 1).

- [ ] **Step 3: Checklist como player**

1. Logout. Loguear con el player. Deberías aterrizar en `/player/tournaments`.
2. Ver cards con los torneos "Test Open 2026" (activo) y "Masters 1000" (borrador — no debería aparecer para player).
3. Click en "Test Open 2026" → redirige a `/player/tournaments/<id>/groups`.
4. Ver el nombre del torneo en el header y la bottom-nav con "Zonas / Playoff / Ranking".
5. Tapear cada tab → ver los placeholders.
6. En el header mobile, usar el switcher "Torneos ▾" para confirmar que solo aparece Test Open.

- [ ] **Step 4: Matar dev server con Ctrl+C**

- [ ] **Step 5: Correr tests + build final**

```bash
pnpm test
pnpm build
```
Ambos deben pasar.

- [ ] **Step 6: Tag**

```bash
git tag phase-2-tournaments-teams
```

---

## Criterios de aceptación Fase 2

- [x] CRUD completo de torneos (crear, listar, ver detalle, editar status, borrar).
- [x] CRUD completo de equipos por torneo (crear, editar nombre + jugadores, borrar).
- [x] Tabs en detalle de torneo con stubs funcionales para Fase 3-4.
- [x] Layout player mobile-first con bottom-nav.
- [x] Selector de torneo en header (admin ve todos, player ve solo no-draft).
- [x] Home redirect: admin → /admin/tournaments, player → /player/tournaments.
- [x] `pnpm build` y `pnpm test` verdes.

## Deferido a fases siguientes

- **Fase 3:** Zonas (drag-and-drop), generación de partidos, pronósticos en grupos, carga de resultados, ranking.
- **Fase 4:** Playoff builder, completar rondas, slots polimórficos, invalidación.
- **Fase 5:** Pulido, deploy Vercel, verificación de dominio en Resend.

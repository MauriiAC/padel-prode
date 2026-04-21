# Fase 1 — Cimientos & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap el proyecto Next.js con Drizzle+Neon, schema completo del dominio, Auth.js v5 con password temporal + cambio forzado + reset por mail, CRUD admin de usuarios, y script de seed del primer admin.

**Architecture:** Next.js 15 (App Router), Drizzle ORM sobre Neon Postgres serverless, Auth.js v5 Credentials provider con JWT en cookie, bcrypt para passwords, Resend para emails transaccionales. Toda la lógica de mutaciones en Server Actions con validación Zod.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui (base), Drizzle ORM, `@neondatabase/serverless`, Auth.js v5, bcrypt, Resend, Zod, Vitest, pnpm.

---

## Reference: Spec

Todo este plan implementa secciones del spec en [docs/superpowers/specs/2026-04-21-padel-prode-design.md](../specs/2026-04-21-padel-prode-design.md). Secciones directamente cubiertas en Fase 1:

- §2 Stack técnico (setup completo).
- §3 Modelo de dominio (schema de todas las tablas).
- §4 Arquitectura (estructura de carpetas, auth, middleware).
- §6 Flujo 1 (primer ingreso del jugador).
- §8 `/admin/users` CRUD.
- §9 Reset por mail, regeneración de password temporal.
- §11 Despliegue & setup (variables de entorno, scripts, seguridad).

---

## File Structure creado en Fase 1

```
├── .env.example
├── .eslintrc.json
├── drizzle.config.ts
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── pnpm-lock.yaml
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   ├── change-password/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/[token]/page.tsx
│   ├── (admin)/
│   │   ├── layout.tsx
│   │   └── users/page.tsx
│   ├── api/auth/[...nextauth]/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── actions/
│   ├── auth.ts
│   └── users.ts
├── components/
│   └── ui/ (populados por shadcn CLI: button, input, label, card, table, dialog, form)
├── db/
│   ├── index.ts
│   ├── schema.ts
│   └── migrations/
├── lib/
│   ├── auth.ts
│   ├── env.ts
│   ├── password.ts
│   ├── password.test.ts
│   ├── tokens.ts
│   ├── tokens.test.ts
│   ├── email.ts
│   ├── email/templates.tsx
│   └── utils.ts (shadcn cn helper)
├── middleware.ts
├── scripts/
│   └── seed-admin.ts
└── types/
    └── next-auth.d.ts
```

---

## Task 1: Scaffold Next.js project con pnpm y TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `postcss.config.mjs`, `tailwind.config.ts`, `.eslintrc.json`, `components/ui/` (empty), `lib/utils.ts`

- [ ] **Step 1: Verificar que estás en la raíz del proyecto vacío (excepto docs/ y .gitignore)**

Run: `ls -la`
Expected: ver `docs/`, `.gitignore`, `.git/` — nada más que pueda interferir con el scaffolding.

- [ ] **Step 2: Scaffold con `create-next-app`**

Run:
```bash
pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias="@/*" --no-turbopack --use-pnpm
```

Responder "Yes" si pregunta por sobrescribir algún archivo. El scaffold debe crear `app/`, `public/`, `tailwind.config.ts`, `tsconfig.json`, `next.config.mjs`, etc.

- [ ] **Step 3: Verificar que el dev server arranca**

Run: `pnpm dev`
Expected: `✓ Ready on http://localhost:3000` — abrir el browser y ver la landing de Next.js.
Detener con Ctrl+C.

- [ ] **Step 4: Limpiar la landing page**

Reemplazar el contenido de `app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Padel Prode</h1>
        <p className="text-muted-foreground mt-2">En construcción.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Añadir la utilidad `cn` de shadcn en `lib/utils.ts`**

Create `lib/utils.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Instalar dependencias auxiliares básicas**

Run: `pnpm add clsx tailwind-merge tailwindcss-animate`

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: scaffold Next.js 15 app with Tailwind and cn utility"
```

---

## Task 2: Instalar todas las dependencias del stack

**Files:** `package.json` (actualizado vía pnpm).

- [ ] **Step 1: Instalar dependencias de runtime**

Run:
```bash
pnpm add drizzle-orm @neondatabase/serverless next-auth@beta bcryptjs resend zod react-hook-form @hookform/resolvers
```

- [ ] **Step 2: Instalar dependencias de desarrollo**

Run:
```bash
pnpm add -D drizzle-kit @types/bcryptjs vitest @vitejs/plugin-react @testing-library/react jsdom tsx dotenv
```

- [ ] **Step 3: Verificar `package.json`**

Abrir `package.json` y confirmar que tiene en `dependencies`: `drizzle-orm`, `@neondatabase/serverless`, `next-auth` (versión `5.x` o `beta`), `bcryptjs`, `resend`, `zod`, `react-hook-form`, `@hookform/resolvers`. Y en `devDependencies`: `drizzle-kit`, `vitest`, `tsx`, `dotenv`.

- [ ] **Step 4: Actualizar scripts en `package.json`**

Reemplazar/agregar en el objeto `"scripts"`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "seed:admin": "tsx scripts/seed-admin.ts"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install runtime and dev dependencies"
```

---

## Task 3: Configurar variables de entorno con Zod

**Files:**
- Create: `.env.example`, `lib/env.ts`
- Modify: `.gitignore` (ya incluye `.env*` desde commit inicial, verificar)

- [ ] **Step 1: Crear `.env.example` como plantilla**

Create `.env.example`:

```
# Neon Postgres
DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/padel_prode?sslmode=require"

# Auth.js
AUTH_SECRET="generate-with-openssl-rand-base64-32"

# Resend
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxx"
RESEND_FROM_EMAIL="Padel Prode <noreply@example.com>"

# Application
APP_URL="http://localhost:3000"
NODE_ENV="development"
```

- [ ] **Step 2: Crear validador Zod en `lib/env.ts`**

Create `lib/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables. See .env.example.");
}

export const env = parsed.data;
```

- [ ] **Step 3: Crear tu `.env.local` local (NO commitear)**

Run:
```bash
cp .env.example .env.local
```

Editar `.env.local` con los valores reales (Neon, Resend, etc.). Si aún no tenés Neon/Resend, podés usar placeholders que cumplan los mínimos de Zod (ej: `AUTH_SECRET` con `openssl rand -base64 32`).

- [ ] **Step 4: Confirmar que `.env.local` está ignorado**

Run: `git status`
Expected: `.env.local` NO aparece en la lista (ya está en `.gitignore`).

- [ ] **Step 5: Commit**

```bash
git add .env.example lib/env.ts
git commit -m "chore: add env var schema with Zod validation"
```

---

## Task 4: Configurar Tailwind con tema base (verde padel + acento)

**Files:**
- Modify: `tailwind.config.ts`, `app/globals.css`

- [ ] **Step 1: Actualizar `tailwind.config.ts` con tokens del tema**

Reemplazar el contenido de `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

- [ ] **Step 2: Actualizar `app/globals.css` con CSS variables del tema padel**

Reemplazar el contenido de `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Padel court green (primary) */
    --primary: 148 55% 34%;
    --primary-foreground: 0 0% 100%;

    /* Warm orange accent */
    --accent: 28 88% 56%;
    --accent-foreground: 0 0% 100%;

    /* Warm neutrals */
    --background: 40 30% 98%;
    --foreground: 150 15% 12%;
    --card: 0 0% 100%;
    --card-foreground: 150 15% 12%;
    --muted: 40 20% 94%;
    --muted-foreground: 150 8% 40%;
    --secondary: 40 20% 94%;
    --secondary-foreground: 150 15% 20%;

    --border: 150 10% 88%;
    --input: 150 10% 88%;
    --ring: 148 55% 34%;

    --destructive: 0 75% 48%;
    --destructive-foreground: 0 0% 100%;

    --radius: 0.625rem;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
  }
}
```

- [ ] **Step 3: Cargar fuente Inter desde Google Fonts en el root layout**

Reemplazar el contenido de `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Padel Prode",
  description: "Prode de torneos de padel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verificar visualmente**

Run: `pnpm dev` y abrir `http://localhost:3000`.
Expected: La página "Padel Prode" se muestra con fuente Inter y fondo crema cálido.
Detener con Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts app/globals.css app/layout.tsx
git commit -m "chore: configure Tailwind with padel theme tokens"
```

---

## Task 5: Inicializar shadcn/ui y agregar componentes básicos

**Files:**
- Create: `components.json`, `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/card.tsx`, `components/ui/form.tsx`, `components/ui/dialog.tsx`, `components/ui/table.tsx`, `components/ui/sonner.tsx`

- [ ] **Step 1: Inicializar shadcn**

Run: `pnpm dlx shadcn@latest init`

Responder:
- Which style? → `Default`
- Which color? → `Neutral` (después customizamos)
- Where is your global CSS file? → `app/globals.css`
- Use CSS variables for theming? → `Yes`
- Where is your tailwind.config.ts? → `tailwind.config.ts`
- Configure import alias for components? → `@/components`
- Configure import alias for utils? → `@/lib/utils`
- Are you using React Server Components? → `Yes`

Esto crea `components.json` y sobrescribe `lib/utils.ts` (idempotente con lo que ya pusimos).

- [ ] **Step 2: Restaurar el tema padel en `globals.css`**

Nota: shadcn init puede haber sobrescrito las variables CSS. Abrir `app/globals.css` y verificar que las variables HSL del tema padel siguen. Si se sobrescribieron, pegar de nuevo el bloque del Step 2 de Task 4.

- [ ] **Step 3: Agregar los componentes shadcn necesarios**

Run:
```bash
pnpm dlx shadcn@latest add button input label card form dialog table sonner dropdown-menu
```

Confirmar sobrescrituras si pregunta.

- [ ] **Step 4: Agregar `Toaster` de sonner al root layout**

Modificar `app/layout.tsx` para incluir el toaster. Reemplazar el body:

```tsx
// imports agregar:
import { Toaster } from "@/components/ui/sonner";

// body del RootLayout:
<body>
  {children}
  <Toaster richColors position="top-center" />
</body>
```

- [ ] **Step 5: Verificar build**

Run: `pnpm build`
Expected: build exitoso sin errores de tipo.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: init shadcn/ui with base components (button, input, form, dialog, etc.)"
```

---

## Task 6: Configurar Vitest

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`

- [ ] **Step 1: Crear `vitest.config.ts`**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["lib/**/*.test.{ts,tsx}", "actions/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

- [ ] **Step 2: Crear `vitest.setup.ts` con defaults de env para tests**

Create `vitest.setup.ts`:

```ts
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret-with-at-least-32-characters-xx";
process.env.RESEND_API_KEY ??= "re_test";
process.env.RESEND_FROM_EMAIL ??= "test@example.com";
process.env.APP_URL ??= "http://localhost:3000";
process.env.NODE_ENV = "test";
```

- [ ] **Step 3: Crear test de humo para confirmar el setup**

Create `lib/utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });
});
```

- [ ] **Step 4: Correr el test**

Run: `pnpm test`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts vitest.setup.ts lib/utils.test.ts
git commit -m "chore: configure Vitest with smoke test"
```

---

## Task 7: Configurar Drizzle + conexión a Neon

**Files:**
- Create: `drizzle.config.ts`, `db/index.ts`

- [ ] **Step 1: Crear `drizzle.config.ts`**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";
import "dotenv/config";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run drizzle-kit");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 2: Crear la conexión Drizzle en `db/index.ts`**

Create `db/index.ts`:

```ts
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

neonConfig.fetchConnectionCache = true;

const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export type DB = typeof db;
```

- [ ] **Step 3: Verificar build sin errores**

Run: `pnpm build`
Expected: build va a fallar porque `db/schema.ts` aún no existe. **Está bien** — lo creamos en la próxima task. Si falla por otra razón, ajustar.

- [ ] **Step 4: Commit**

```bash
git add drizzle.config.ts db/index.ts
git commit -m "chore: configure Drizzle + Neon HTTP connection"
```

---

## Task 8: Schema — tabla `users` y enum de rol

**Files:**
- Create: `db/schema.ts` (primera versión con solo users)

- [ ] **Step 1: Crear schema con users + enums**

Create `db/schema.ts`:

```ts
import {
  pgEnum,
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";

// Enums

export const userRoleEnum = pgEnum("user_role", ["admin", "player"]);

// Users

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("player"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 2: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add db/schema.ts
git commit -m "feat(db): add users table schema"
```

---

## Task 9: Schema — tablas `tournaments` y `teams`

**Files:**
- Modify: `db/schema.ts`

- [ ] **Step 1: Agregar enum de estado de torneo y tablas**

Al final de `db/schema.ts`, antes del `export type User`, agregar:

```ts
// Tournaments

export const tournamentStatusEnum = pgEnum("tournament_status", [
  "draft",
  "active",
  "finished",
]);

export const tournaments = pgTable("tournaments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  status: tournamentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;

// Teams

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    player1Name: text("player_1_name").notNull(),
    player2Name: text("player_2_name").notNull(),
  },
  (table) => ({
    tournamentIdx: index("teams_tournament_idx").on(table.tournamentId),
  })
);

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
```

- [ ] **Step 2: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add db/schema.ts
git commit -m "feat(db): add tournaments and teams tables"
```

---

## Task 10: Schema — tablas `groups` y `group_teams`

**Files:**
- Modify: `db/schema.ts`

- [ ] **Step 1: Actualizar imports de `db/schema.ts`**

Reemplazar el bloque de imports al inicio de `db/schema.ts` por:

```ts
import {
  pgEnum,
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  index,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Agregar `groups` y `group_teams` al final del archivo**

Agregar al final de `db/schema.ts`:

```ts
// Groups

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    order: integer("order").notNull(),
  },
  (table) => ({
    tournamentIdx: index("groups_tournament_idx").on(table.tournamentId),
  })
);

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;

// Group teams (join)

export const groupTeams = pgTable(
  "group_teams",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    finalPosition: integer("final_position"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.teamId] }),
    teamIdx: index("group_teams_team_idx").on(table.teamId),
  })
);

export type GroupTeam = typeof groupTeams.$inferSelect;
export type NewGroupTeam = typeof groupTeams.$inferInsert;
```

- [ ] **Step 3: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add db/schema.ts
git commit -m "feat(db): add groups and group_teams tables"
```

---

## Task 11: Schema — tablas `rounds` y `matches`

**Files:**
- Modify: `db/schema.ts`

- [ ] **Step 1: Agregar enums y tablas `rounds` + `matches`**

Agregar al final de `db/schema.ts`:

```ts
// Rounds

export const roundKindEnum = pgEnum("round_kind", ["groups", "playoff"]);
export const roundStatusEnum = pgEnum("round_status", [
  "sin_abrir",
  "abierta",
  "cerrada",
]);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    kind: roundKindEnum("kind").notNull(),
    order: integer("order").notNull(),
    name: text("name").notNull(),
    status: roundStatusEnum("status").notNull().default("sin_abrir"),
  },
  (table) => ({
    tournamentIdx: index("rounds_tournament_idx").on(table.tournamentId),
  })
);

export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;

// Matches

export const slotTypeEnum = pgEnum("slot_type", [
  "team",
  "bye",
  "group_position",
  "match_winner",
  "match_loser",
]);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    slotAType: slotTypeEnum("slot_a_type").notNull(),
    slotARef: text("slot_a_ref"),
    slotBType: slotTypeEnum("slot_b_type").notNull(),
    slotBRef: text("slot_b_ref"),
    resultWinnerTeamId: uuid("result_winner_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    resultSets: integer("result_sets"),
  },
  (table) => ({
    roundIdx: index("matches_round_idx").on(table.roundId),
  })
);

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
```

**Nota sobre `slot_*_ref`:** Es `text` nullable porque el formato depende del tipo:
- `team` / `match_winner` / `match_loser`: UUID del team o match.
- `group_position`: string `"<group_id>:<position>"` (ej: `"abc-123:1"`).
- `bye`: `null`.

- [ ] **Step 2: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add db/schema.ts
git commit -m "feat(db): add rounds and matches tables with slot types"
```

---

## Task 12: Schema — tablas `predictions` y `password_reset_tokens`

**Files:**
- Modify: `db/schema.ts`

- [ ] **Step 1: Agregar `predictions` y `password_reset_tokens`**

Agregar al final de `db/schema.ts`:

```ts
// Predictions

export const predictions = pgTable(
  "predictions",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    predictedWinnerTeamId: uuid("predicted_winner_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    predictedSets: integer("predicted_sets").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.matchId, table.userId] }),
    userIdx: index("predictions_user_idx").on(table.userId),
  })
);

export type Prediction = typeof predictions.$inferSelect;
export type NewPrediction = typeof predictions.$inferInsert;

// Password reset tokens

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("password_reset_tokens_user_idx").on(table.userId),
  })
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
```

- [ ] **Step 2: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add db/schema.ts
git commit -m "feat(db): add predictions and password_reset_tokens tables"
```

---

## Task 13: Generar y aplicar migración inicial

**Files:**
- Create: `db/migrations/0000_*.sql` (generado por drizzle-kit)

- [ ] **Step 1: Verificar que `.env.local` tiene un `DATABASE_URL` válido de Neon**

Asegurate de tener una branch de Neon creada y la URL de conexión en `.env.local`.

- [ ] **Step 2: Generar la migración**

Run: `pnpm db:generate`
Expected: `drizzle-kit` crea un archivo `.sql` en `db/migrations/` con todos los `CREATE TABLE`.

- [ ] **Step 3: Aplicar al Neon dev branch**

Run: `pnpm db:migrate`
Expected: migración aplicada. Si falla por connection, verificar `DATABASE_URL`.

- [ ] **Step 4: Verificar en Drizzle Studio**

Run: `pnpm db:studio`
Expected: se abre la UI. Confirmar que las tablas `users`, `tournaments`, `teams`, `groups`, `group_teams`, `rounds`, `matches`, `predictions`, `password_reset_tokens` están creadas y vacías.
Detener con Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/
git commit -m "feat(db): initial migration creating all domain tables"
```

---

## Task 14: Utilidades de password (hash, verify) con TDD

**Files:**
- Create: `lib/password.ts`, `lib/password.test.ts`

- [ ] **Step 1: Escribir el test primero**

Create `lib/password.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, generateTemporaryPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("produces a hash that verifies with the original password", async () => {
    const hash = await hashPassword("SuperSecret123!");
    expect(hash).not.toBe("SuperSecret123!");
    expect(await verifyPassword("SuperSecret123!", hash)).toBe(true);
  });

  it("rejects incorrect passwords", async () => {
    const hash = await hashPassword("correct");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces different hashes for the same password (salt)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });
});

describe("generateTemporaryPassword", () => {
  it("returns a string of at least 10 characters", () => {
    const pw = generateTemporaryPassword();
    expect(pw.length).toBeGreaterThanOrEqual(10);
  });

  it("returns different values on each call", () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    expect(a).not.toBe(b);
  });

  it("contains only URL-safe characters", () => {
    const pw = generateTemporaryPassword();
    expect(pw).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
```

- [ ] **Step 2: Correr test para confirmar que falla**

Run: `pnpm test lib/password.test.ts`
Expected: FAIL — `hashPassword` no existe.

- [ ] **Step 3: Implementar `lib/password.ts`**

Create `lib/password.ts`:

```ts
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const BCRYPT_COST = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateTemporaryPassword(): string {
  return randomBytes(9).toString("base64url");
}
```

- [ ] **Step 4: Correr test para confirmar que pasa**

Run: `pnpm test lib/password.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/password.ts lib/password.test.ts
git commit -m "feat(lib): password hashing and temporary password generator"
```

---

## Task 15: Utilidades de tokens de reset con TDD

**Files:**
- Create: `lib/tokens.ts`, `lib/tokens.test.ts`

- [ ] **Step 1: Escribir el test**

Create `lib/tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateResetToken, isTokenExpired, RESET_TOKEN_TTL_MS } from "./tokens";

describe("generateResetToken", () => {
  it("returns a URL-safe string of at least 32 chars", () => {
    const token = generateResetToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateResetToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("isTokenExpired", () => {
  it("returns false for a token created now", () => {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + RESET_TOKEN_TTL_MS);
    expect(isTokenExpired(expiresAt)).toBe(false);
  });

  it("returns true for a token with past expiration", () => {
    const expiresAt = new Date(Date.now() - 1000);
    expect(isTokenExpired(expiresAt)).toBe(true);
  });

  it("RESET_TOKEN_TTL_MS equals 1 hour", () => {
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Correr test (debe fallar)**

Run: `pnpm test lib/tokens.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Create `lib/tokens.ts`:

```ts
import { randomBytes } from "crypto";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isTokenExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}
```

- [ ] **Step 4: Correr test**

Run: `pnpm test lib/tokens.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/tokens.ts lib/tokens.test.ts
git commit -m "feat(lib): reset token generator and expiration check"
```

---

## Task 16: Wrapper de Resend con templates de email

**Files:**
- Create: `lib/email.ts`, `lib/email/templates.tsx`

- [ ] **Step 1: Crear templates**

Create `lib/email/templates.tsx`:

```tsx
export function WelcomeEmail({
  name,
  temporaryPassword,
  loginUrl,
}: {
  name: string;
  temporaryPassword: string;
  loginUrl: string;
}) {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, sans-serif; padding: 24px; color: #1a1a1a;">
    <h1 style="color: #2c8852;">Bienvenido, ${escapeHtml(name)}</h1>
    <p>Te damos la bienvenida al prode de padel. Acá están tus credenciales iniciales:</p>
    <ul>
      <li><strong>Contraseña temporal:</strong> <code>${escapeHtml(
        temporaryPassword
      )}</code></li>
    </ul>
    <p>
      <a href="${loginUrl}" style="display:inline-block;background:#2c8852;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
        Ingresar
      </a>
    </p>
    <p style="color:#666;font-size:14px;">En tu primer ingreso te vamos a pedir que cambies la contraseña.</p>
  </body>
</html>
  `.trim();
}

export function ResetPasswordEmail({
  name,
  resetUrl,
}: {
  name: string;
  resetUrl: string;
}) {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, sans-serif; padding: 24px; color: #1a1a1a;">
    <h1 style="color: #2c8852;">Restablecer tu contraseña</h1>
    <p>Hola ${escapeHtml(name)},</p>
    <p>Recibimos un pedido para restablecer tu contraseña. Hacé clic en el link de abajo (válido por 1 hora):</p>
    <p>
      <a href="${resetUrl}" style="display:inline-block;background:#2c8852;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
        Elegir nueva contraseña
      </a>
    </p>
    <p style="color:#666;font-size:14px;">Si no pediste esto, podés ignorar este mail.</p>
  </body>
</html>
  `.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 2: Crear wrapper de Resend**

Create `lib/email.ts`:

```ts
import { Resend } from "resend";
import { env } from "./env";
import { WelcomeEmail, ResetPasswordEmail } from "./email/templates";

const resend = new Resend(env.RESEND_API_KEY);

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  temporaryPassword: string;
}) {
  const loginUrl = `${env.APP_URL}/login`;
  const html = WelcomeEmail({
    name: params.name,
    temporaryPassword: params.temporaryPassword,
    loginUrl,
  });

  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: params.to,
    subject: "Bienvenido a Padel Prode",
    html,
  });

  if (result.error) {
    throw new Error(`Failed to send welcome email: ${result.error.message}`);
  }
  return result.data;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  token: string;
}) {
  const resetUrl = `${env.APP_URL}/reset-password/${params.token}`;
  const html = ResetPasswordEmail({ name: params.name, resetUrl });

  const result = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: params.to,
    subject: "Restablecer tu contraseña",
    html,
  });

  if (result.error) {
    throw new Error(`Failed to send reset email: ${result.error.message}`);
  }
  return result.data;
}
```

- [ ] **Step 3: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts lib/email/templates.tsx
git commit -m "feat(lib): Resend wrapper with welcome and reset password templates"
```

---

## Task 17: Configurar Auth.js v5 con Credentials provider

**Files:**
- Create: `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `types/next-auth.d.ts`

- [ ] **Step 1: Crear configuración Auth.js**

Create `lib/auth.ts`:

```ts
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "./password";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);

        if (!user) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
      }
      // Permitir refresco manual del flag tras cambiar la password
      if (trigger === "update" && session?.mustChangePassword === false) {
        token.mustChangePassword = false;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "admin" | "player";
      session.user.mustChangePassword = token.mustChangePassword as boolean;
      return session;
    },
  },
});
```

- [ ] **Step 2: Crear route handler**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 3: Crear types augmentation**

Create `types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    role: "admin" | "player";
    mustChangePassword: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: "admin" | "player";
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "admin" | "player";
    mustChangePassword?: boolean;
  }
}
```

- [ ] **Step 4: Incluir types/ en tsconfig**

Verificar que `tsconfig.json` tiene `"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`. Si no incluye `types/`, agregar `"types/**/*.d.ts"`.

- [ ] **Step 5: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts app/api/auth types/next-auth.d.ts tsconfig.json
git commit -m "feat(auth): configure Auth.js v5 with Credentials provider and JWT"
```

---

## Task 18: Middleware para auth + rutas por rol + cambio de password

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Crear middleware**

Create `middleware.ts`:

```ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_ROUTES = ["/login", "/forgot-password"];
const PUBLIC_PREFIXES = ["/reset-password/", "/api/auth"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  // Pasar assets de Next
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth;
  const user = req.auth?.user;

  if (isPublicPath(pathname)) {
    // Usuario logueado en /login → mandar a home
    if (isLoggedIn && pathname === "/login") {
      const target = user?.mustChangePassword ? "/change-password" : "/";
      return NextResponse.redirect(new URL(target, nextUrl));
    }
    return NextResponse.next();
  }

  // Rutas protegidas
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Force change password
  if (user?.mustChangePassword && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", nextUrl));
  }

  // /admin/* solo admins
  if (pathname.startsWith("/admin") && user?.role !== "admin") {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): middleware for route protection and password-change gating"
```

---

## Task 19: Layout y página de login

**Files:**
- Create: `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `actions/auth.ts`

- [ ] **Step 1: Crear layout de `(auth)` group**

Create `app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
```

- [ ] **Step 2: Crear server action de login en `actions/auth.ts`**

Create `actions/auth.ts`:

```ts
"use server";

import { signIn, signOut } from "@/lib/auth";
import { z } from "zod";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export type LoginState = { error?: string } | undefined;

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Email o contraseña inválidos" };
    }
    throw err;
  }

  redirect("/");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
```

- [ ] **Step 3: Crear página de login**

Create `app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    undefined
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresar</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Ingresando..." : "Ingresar"}
          </Button>
          <p className="text-center text-sm">
            <Link href="/forgot-password" className="text-primary hover:underline">
              Olvidé mi contraseña
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)/layout.tsx app/\(auth\)/login actions/auth.ts
git commit -m "feat(auth): login page with server action"
```

---

## Task 20: Página y acción de cambio de password (primer ingreso)

**Files:**
- Create: `app/(auth)/change-password/page.tsx`
- Modify: `actions/auth.ts`

- [ ] **Step 1: Agregar action `changePasswordAction` a `actions/auth.ts`**

Al final de `actions/auth.ts`, agregar:

```ts
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/password";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresá tu contraseña actual"),
    newPassword: z.string().min(8, "Mínimo 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type ChangePasswordState = { error?: string; success?: boolean } | undefined;

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "No hay sesión activa" };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) return { error: "Usuario no encontrado" };

  const validCurrent = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash
  );
  if (!validCurrent) {
    return { error: "La contraseña actual no es correcta" };
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await db
    .update(users)
    .set({ passwordHash: newHash, mustChangePassword: false })
    .where(eq(users.id, user.id));

  return { success: true };
}
```

- [ ] **Step 2: Crear página de cambio de password**

Create `app/(auth)/change-password/page.tsx`:

```tsx
"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  changePasswordAction,
  type ChangePasswordState,
  logoutAction,
} from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ChangePasswordPage() {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    undefined
  );
  const router = useRouter();
  const { update } = useSession();

  useEffect(() => {
    if (state?.success) {
      toast.success("Contraseña actualizada");
      // Refrescar token para limpiar mustChangePassword
      update({ mustChangePassword: false }).then(() => router.push("/"));
    }
  }, [state, router, update]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiá tu contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Contraseña actual</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" className="w-full">
              Cerrar sesión
            </Button>
          </form>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Agregar SessionProvider en root layout**

Como `useSession` es un hook de cliente, hay que envolver el árbol con `SessionProvider`. Crear `components/session-provider.tsx`:

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

Modificar `app/layout.tsx` para envolver `{children}` con `<Providers>`:

```tsx
import { Providers } from "@/components/session-provider";
// ...
<body>
  <Providers>{children}</Providers>
  <Toaster richColors position="top-center" />
</body>
```

- [ ] **Step 4: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)/change-password actions/auth.ts components/session-provider.tsx app/layout.tsx
git commit -m "feat(auth): change-password page with forced first-login flow"
```

---

## Task 21: Página y acción de forgot-password

**Files:**
- Create: `app/(auth)/forgot-password/page.tsx`
- Modify: `actions/auth.ts`

- [ ] **Step 1: Agregar action `requestPasswordResetAction`**

Al final de `actions/auth.ts`, agregar:

```ts
import { passwordResetTokens } from "@/db/schema";
import { generateResetToken, RESET_TOKEN_TTL_MS } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/email";

const emailSchema = z.object({
  email: z.string().email("Email inválido"),
});

export type RequestResetState = { error?: string; sent?: boolean } | undefined;

export async function requestPasswordResetAction(
  _prev: RequestResetState,
  formData: FormData
): Promise<RequestResetState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Email inválido" };
  }

  const email = parsed.data.email.toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Respuesta genérica aunque no exista (no revelar si el email está registrado)
  if (user) {
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await db.insert(passwordResetTokens).values({
      token,
      userId: user.id,
      expiresAt,
    });

    try {
      await sendPasswordResetEmail({ to: user.email, name: user.name, token });
    } catch (err) {
      console.error("[requestPasswordReset] email send failed", err);
      return { error: "No pudimos enviar el mail. Probá de nuevo en un rato." };
    }
  }

  return { sent: true };
}
```

- [ ] **Step 2: Crear página `forgot-password`**

Create `app/(auth)/forgot-password/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  requestPasswordResetAction,
  type RequestResetState,
} from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<RequestResetState, FormData>(
    requestPasswordResetAction,
    undefined
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restablecer contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        {state?.sent ? (
          <div className="space-y-4">
            <p>
              Si el email está registrado, te enviamos un link para resetear tu contraseña.
              Revisá tu bandeja.
            </p>
            <Link href="/login" className="text-primary hover:underline">
              Volver al login
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoFocus />
            </div>
            {state?.error && (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Enviando..." : "Enviar link de reset"}
            </Button>
            <p className="text-center text-sm">
              <Link href="/login" className="text-primary hover:underline">
                Volver al login
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/forgot-password actions/auth.ts
git commit -m "feat(auth): forgot-password request flow with email"
```

---

## Task 22: Página y acción de reset-password

**Files:**
- Create: `app/(auth)/reset-password/[token]/page.tsx`
- Modify: `actions/auth.ts`

- [ ] **Step 1: Agregar action `resetPasswordAction`**

Al final de `actions/auth.ts`, agregar:

```ts
import { isTokenExpired } from "@/lib/tokens";
import { and, isNull } from "drizzle-orm";

const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(8, "Mínimo 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type ResetPasswordState =
  | { error?: string; success?: boolean }
  | undefined;

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const [row] = await db
    .select({
      token: passwordResetTokens.token,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, parsed.data.token))
    .limit(1);

  if (!row) return { error: "Link inválido" };
  if (row.usedAt) return { error: "Este link ya fue usado" };
  if (isTokenExpired(row.expiresAt)) return { error: "Este link expiró" };

  const newHash = await hashPassword(parsed.data.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: newHash, mustChangePassword: false })
      .where(eq(users.id, row.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.token, row.token));
  });

  return { success: true };
}
```

- [ ] **Step 2: Crear página `reset-password/[token]`**

Create `app/(auth)/reset-password/[token]/page.tsx`:

```tsx
"use client";

import { useActionState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { resetPasswordAction, type ResetPasswordState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    undefined
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      toast.success("Contraseña restablecida. Ingresá con la nueva.");
      router.push("/login");
    }
  }, [state, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Elegir nueva contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="token" value={params.token} />
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/reset-password actions/auth.ts
git commit -m "feat(auth): reset-password page with token validation"
```

---

## Task 23: Layout mínimo de admin

**Files:**
- Create: `app/(admin)/layout.tsx`, `components/header.tsx`

- [ ] **Step 1: Crear header compartido**

Create `components/header.tsx`:

```tsx
import Link from "next/link";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  return (
    <header className="border-b bg-card">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="font-semibold text-primary">
          Padel Prode
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user.role === "admin" && (
            <>
              <Link href="/admin/tournaments" className="hover:underline">
                Torneos
              </Link>
              <Link href="/admin/users" className="hover:underline">
                Usuarios
              </Link>
            </>
          )}
          <span className="text-muted-foreground">{user.name}</span>
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

- [ ] **Step 2: Crear layout de admin**

Create `app/(admin)/layout.tsx`:

```tsx
import { Header } from "@/components/header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/layout.tsx components/header.tsx
git commit -m "feat(admin): admin layout with shared header"
```

---

## Task 24: Server actions de usuarios (crear, resend, delete)

**Files:**
- Create: `actions/users.ts`

- [ ] **Step 1: Crear `actions/users.ts` con las acciones**

Create `actions/users.ts`:

```ts
"use server";

import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { hashPassword, generateTemporaryPassword } from "@/lib/password";
import { sendWelcomeEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session.user;
}

const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  name: z.string().min(1, "Nombre requerido"),
  role: z.enum(["admin", "player"]).default("player"),
});

export type CreateUserResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createUserAction(
  formData: FormData
): Promise<CreateUserResult> {
  await requireAdmin();

  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role") ?? "player",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "Ya existe un usuario con ese email" };
  }

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(tempPassword);

  await db.insert(users).values({
    email,
    name: parsed.data.name,
    role: parsed.data.role,
    passwordHash,
    mustChangePassword: true,
  });

  try {
    await sendWelcomeEmail({
      to: email,
      name: parsed.data.name,
      temporaryPassword: tempPassword,
    });
  } catch (err) {
    console.error("[createUser] welcome email failed", err);
    // El usuario quedó creado; el admin puede reenviar después
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

const userIdSchema = z.string().uuid();

export async function resendTemporaryPasswordAction(
  userId: string
): Promise<CreateUserResult> {
  await requireAdmin();
  const parsedId = userIdSchema.safeParse(userId);
  if (!parsedId.success) return { ok: false, error: "ID inválido" };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsedId.data))
    .limit(1);

  if (!user) return { ok: false, error: "Usuario no encontrado" };

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(tempPassword);

  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(users.id, user.id));

  try {
    await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      temporaryPassword: tempPassword,
    });
  } catch (err) {
    console.error("[resendTempPassword] email failed", err);
    return { ok: false, error: "No pudimos enviar el mail" };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUserAction(userId: string): Promise<CreateUserResult> {
  const adminUser = await requireAdmin();
  const parsedId = userIdSchema.safeParse(userId);
  if (!parsedId.success) return { ok: false, error: "ID inválido" };

  if (parsedId.data === adminUser.id) {
    return { ok: false, error: "No podés borrarte a vos mismo" };
  }

  await db.delete(users).where(eq(users.id, parsedId.data));
  revalidatePath("/admin/users");
  return { ok: true };
}
```

- [ ] **Step 2: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add actions/users.ts
git commit -m "feat(users): server actions for create, resend password, delete"
```

---

## Task 25: Página `/admin/users` con lista y form

**Files:**
- Create: `app/(admin)/users/page.tsx`, `app/(admin)/users/user-row-actions.tsx`, `app/(admin)/users/create-user-dialog.tsx`

- [ ] **Step 1: Crear la página (Server Component)**

Create `app/(admin)/users/page.tsx`:

```tsx
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateUserDialog } from "./create-user-dialog";
import { UserRowActions } from "./user-row-actions";

export default async function UsersPage() {
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <CreateUserDialog />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Primer ingreso?</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>{u.mustChangePassword ? "Pendiente" : "OK"}</TableCell>
              <TableCell>
                <UserRowActions userId={u.id} userName={u.name} />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No hay usuarios todavía.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Crear el diálogo de creación (Client)**

Create `app/(admin)/users/create-user-dialog.tsx`:

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
import { createUserAction } from "@/actions/users";

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createUserAction(formData);
      if (result.ok) {
        toast.success("Usuario creado. Se envió el mail con la contraseña temporal.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Crear usuario</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <select
              id="role"
              name="role"
              defaultValue="player"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="player">Player</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando..." : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Crear las acciones por fila (Client)**

Create `app/(admin)/users/user-row-actions.tsx`:

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
import {
  resendTemporaryPasswordAction,
  deleteUserAction,
} from "@/actions/users";

export function UserRowActions({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [pending, startTransition] = useTransition();

  function resend() {
    startTransition(async () => {
      const res = await resendTemporaryPasswordAction(userId);
      if (res.ok) toast.success("Mail con contraseña temporal reenviado");
      else toast.error(res.error);
    });
  }

  function remove() {
    if (!confirm(`¿Borrar usuario "${userName}"?`)) return;
    startTransition(async () => {
      const res = await deleteUserAction(userId);
      if (res.ok) toast.success("Usuario borrado");
      else toast.error(res.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending}>
          •••
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={resend}>Reenviar contraseña temporal</DropdownMenuItem>
        <DropdownMenuItem onClick={remove} className="text-destructive">
          Borrar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add app/\(admin\)/users
git commit -m "feat(admin): users CRUD page with create dialog and row actions"
```

---

## Task 26: Script seed-admin

**Files:**
- Create: `scripts/seed-admin.ts`

- [ ] **Step 1: Crear el script**

Create `scripts/seed-admin.ts`:

```ts
import "dotenv/config";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/password";

async function main() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error("Usage: pnpm seed:admin <email> <password> [name]");
    process.exit(1);
  }

  const displayName = name ?? email.split("@")[0];
  const lowerEmail = email.toLowerCase();

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, lowerEmail))
    .limit(1);

  if (existing.length > 0) {
    console.error(`User ${lowerEmail} already exists.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    email: lowerEmail,
    name: displayName,
    role: "admin",
    passwordHash,
    mustChangePassword: false,
  });

  console.log(`✓ Admin ${lowerEmail} created.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Configurar `tsx` para resolver paths `@/`**

Crear `scripts/tsconfig.json` (para que `tsx` use los paths alias):

Nota: `tsx` por defecto respeta el `tsconfig.json` raíz. Para confirmar, probar el script:

Run: `pnpm seed:admin admin@test.com MyPassword123 "Admin Test"`

Si falla con error de resolución de `@/`, agregar a `package.json` en devDependencies `tsconfig-paths` y modificar el script a:

```json
"seed:admin": "tsx --tsconfig tsconfig.json scripts/seed-admin.ts"
```

Si `tsx` sigue sin resolver, alternativa: cambiar imports en el script a rutas relativas (`../db`, `../db/schema`, `../lib/password`).

- [ ] **Step 3: Verificar que el usuario quedó creado**

Run: `pnpm db:studio` y confirmar que `admin@test.com` aparece con `role='admin'` y `must_change_password=false`.
Detener con Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-admin.ts
git commit -m "feat(scripts): seed-admin script to bootstrap first admin user"
```

---

## Task 27: Home page básica con redirección por rol

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Convertir la home en un redirector**

Reemplazar el contenido de `app/page.tsx`:

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

  // Rol player: en Fase 1 no hay rutas de player aún. Mostrar una pantalla
  // neutra de "bienvenida" hasta Fase 2, donde se agrega el selector de torneo.
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Padel Prode</h1>
        <p className="text-muted-foreground">
          Aún no hay torneos activos para mostrarte. Esperá a que el admin configure uno.
        </p>
      </div>
    </main>
  );
}
```

**Nota:** En Fase 2, cuando exista `/player/tournaments`, reemplazar el return final por `redirect("/player/tournaments")`. No afecta Fase 1.

- [ ] **Step 2: Dejar el home para admin apuntando a una página de "próximamente" (Fase 2)**

Como `/admin/tournaments` aún no existe, crear un stub temporal:

Create `app/(admin)/tournaments/page.tsx`:

```tsx
export default function TournamentsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Torneos</h1>
      <p className="text-muted-foreground">
        Próximamente. Por ahora podés ver a los usuarios en /admin/users.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verificar build**

Run: `pnpm build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/\(admin\)/tournaments
git commit -m "feat: role-based home redirect + placeholder tournaments page"
```

---

## Task 28: README con instrucciones de setup

**Files:**
- Create: `README.md`

- [ ] **Step 1: Crear README**

Create `README.md`:

```markdown
# Padel Prode

Web para gestionar un prode de torneos de padel entre amigos.

Ver [docs/superpowers/specs/2026-04-21-padel-prode-design.md](docs/superpowers/specs/2026-04-21-padel-prode-design.md) para el spec completo.

## Stack

- Next.js 15 (App Router)
- Neon Postgres + Drizzle ORM
- Auth.js v5
- Tailwind + shadcn/ui
- Resend (emails)
- Vitest

## Setup local

1. **Instalar dependencias**
   ```bash
   pnpm install
   ```

2. **Crear Neon branch** en https://neon.tech y copiar la `DATABASE_URL`.

3. **Obtener API key de Resend** en https://resend.com.

4. **Crear `.env.local`**
   ```bash
   cp .env.example .env.local
   # Editar con los valores reales
   # AUTH_SECRET se genera con: openssl rand -base64 32
   ```

5. **Aplicar migraciones**
   ```bash
   pnpm db:migrate
   ```

6. **Crear el primer admin**
   ```bash
   pnpm seed:admin tu@email.com "TuPassword123" "Tu Nombre"
   ```

7. **Levantar dev server**
   ```bash
   pnpm dev
   ```

   Abrir http://localhost:3000 y loguearte con el admin creado.

## Scripts

| Comando | Descripción |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Build de producción |
| `pnpm test` | Correr tests con Vitest |
| `pnpm db:generate` | Generar migración desde schema |
| `pnpm db:migrate` | Aplicar migraciones |
| `pnpm db:push` | Push schema directo (solo dev) |
| `pnpm db:studio` | Drizzle Studio (UI) |
| `pnpm seed:admin <email> <pw> [name]` | Crear admin inicial |

## Despliegue

- Production: push a `main` → Vercel build automático.
- Variables de entorno: configurar en Vercel las mismas que en `.env.example` apuntando al branch `main` de Neon.

## Testing

```bash
pnpm test          # Run once
pnpm test:watch    # Watch mode
```

Solo lógica pura en `lib/` se testea (password, tokens, scoring, match-generator, etc.).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: setup instructions in README"
```

---

## Task 29: Smoke test manual del flow completo

**Files:** ninguno.

- [ ] **Step 1: Levantar dev server y probar flow fin-a-fin**

Run: `pnpm dev`

Checklist manual en el browser:

1. Abrir `http://localhost:3000` → redirige a `/login`.
2. Loguear con el admin seeded (`admin@test.com` / password elegida) → redirige a `/admin/tournaments`.
3. Ir a `/admin/users` → ver al admin en la lista.
4. Click "Crear usuario" → llenar con un email que tengas acceso → submit.
5. Verificar en el mail de destino que llegó el welcome con la contraseña temporal.
6. Logout. Loguear con el nuevo usuario + contraseña temp → redirige a `/change-password`.
7. Cambiar password → redirige a home.
8. Logout. Usar "Olvidé mi contraseña" en el login con el mismo email → recibir mail de reset.
9. Abrir el link del mail → elegir nueva password → redirige a login.
10. Loguear con la nueva password → OK.

- [ ] **Step 2: Si algo falla, fixear y recommit antes de cerrar Fase 1**

Si aparece un bug, crear una task adicional para fix y dejar anotado acá.

- [ ] **Step 3: Parar dev server con Ctrl+C**

- [ ] **Step 4: Correr todos los tests**

Run: `pnpm test`
Expected: todos pasan.

- [ ] **Step 5: Tag de cierre de fase**

```bash
git tag phase-1-foundation
```

---

## Criterios de aceptación Fase 1

Cuando los 29 tasks estén completos, debe cumplirse:

- [x] `pnpm build` termina sin errores.
- [x] `pnpm test` pasa al 100% (utilidades de password + tokens + cn).
- [x] Un admin puede crear usuarios desde `/admin/users` y el usuario recibe mail de bienvenida.
- [x] Un usuario nuevo hace login, es forzado a cambiar password, y luego puede acceder.
- [x] El flow de "olvidé mi contraseña" funciona end-to-end con mails reales.
- [x] Rutas `/admin/*` bloquean usuarios con rol `player`.
- [x] La migración inicial crea todas las tablas del spec (`users`, `tournaments`, `teams`, `groups`, `group_teams`, `rounds`, `matches`, `predictions`, `password_reset_tokens`).

## Deferido a fases siguientes (no incluido en Fase 1)

- CRUD de torneos con UI (Fase 2).
- CRUD de equipos (Fase 2).
- Layout y navegación de player (Fase 2).
- Drag-and-drop de zonas (Fase 3).
- Generación de partidos (Fase 3).
- Playoff builder y lógica de slots (Fase 4).
- Flujo completo de invalidación (Fase 4).
- Pulido de UI, tokens finos de tema, deploy a Vercel (Fase 5).

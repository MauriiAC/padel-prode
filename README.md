# Padel Prode

Web para gestionar un prode de torneos de padel entre amigos.

Ver [docs/superpowers/specs/2026-04-21-padel-prode-design.md](docs/superpowers/specs/2026-04-21-padel-prode-design.md) para el spec completo y [docs/superpowers/plans/](docs/superpowers/plans/) para los planes de implementación por fase.

## Stack

- Next.js 15 (App Router)
- Neon Postgres + Drizzle ORM
- Auth.js v5
- Tailwind + shadcn/ui
- Resend (emails)
- Vitest

## Requisitos

- Node 22 (hay `.nvmrc` con `22`; usar `nvm use`)
- pnpm

## Setup local

1. **Instalar dependencias**

   ```bash
   nvm use
   pnpm install
   ```

2. **Crear Neon branch** en https://neon.tech y copiar la "Pooled connection string".

3. **Obtener API key de Resend** en https://resend.com. Para el FROM podés usar `onboarding@resend.dev` sin verificar dominio propio.

4. **Crear `.env.local`**

   ```bash
   cp .env.example .env.local
   ```

   Editar con los valores reales. `AUTH_SECRET` se genera con:

   ```bash
   openssl rand -base64 32
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

## Estado actual

**Fase 1 completada:** auth, CRUD de usuarios admin, reset por mail, seed-admin. Fases 2-5 pendientes (torneos, equipos, zonas, playoff, invalidación, deploy). Ver planes en `docs/superpowers/plans/`.

# Padel Prode

Web para gestionar un prode de torneos de padel entre amigos.

Ver [docs/superpowers/specs/2026-04-21-padel-prode-design.md](docs/superpowers/specs/2026-04-21-padel-prode-design.md) para el spec completo y [docs/superpowers/plans/](docs/superpowers/plans/) para los planes de implementación por fase.

## Stack

- Next.js 15 (App Router) · Auth.js v5 · Drizzle ORM (`postgres.js`)
- Tailwind + shadcn/ui · dnd-kit · Resend
- Postgres 16 (local via docker-compose, prod via Neon)
- Vitest

## Requisitos

- Node 22 (hay `.nvmrc`; usar `nvm use`)
- pnpm
- Docker + docker-compose (solo para dev local)

## Setup local

1. **Instalar dependencias**

   ```bash
   nvm use
   pnpm install
   ```

2. **Levantar Postgres local**

   ```bash
   docker compose up -d
   ```

   Esto corre Postgres 16 en el puerto 5432 con credenciales `padel:padel` y DB `padel_prode` (persistente en volumen Docker).

3. **Obtener API key de Resend** en https://resend.com. Para el FROM podés usar `onboarding@resend.dev` sin verificar dominio (solo te deja mandar a tu email registrado; para producción verificá un dominio propio).

4. **Crear `.env.local`**

   ```bash
   cp .env.example .env.local
   ```

   El `.env.example` ya apunta a la DB local. Solo necesitás completar `AUTH_SECRET` y `RESEND_API_KEY`:

   ```bash
   openssl rand -base64 32   # copiar el output en AUTH_SECRET
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

**Para apagar la DB local:** `docker compose down` (datos persisten). Para borrar datos: `docker compose down -v`.

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
| `pnpm tsx scripts/reopen-rounds.ts [status]` | Dev utility: reset estados de ronda para re-editar |

## Producción

- **Despliegue:** push a `main` → Vercel build automático.
- **DB:** Neon Postgres (single branch). Variables de entorno en Vercel:
  - `DATABASE_URL`: pooled connection string de Neon (con `-pooler` en el host).
  - `AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`, `NODE_ENV=production`.
- **Migraciones a prod:** desde local con `DATABASE_URL=<prod-url> pnpm db:migrate`.

### Rollback

Si un deploy rompe prod, en Vercel > Deployments > elegir un deploy anterior > "Promote to Production".

## Testing

```bash
pnpm test          # Run once
pnpm test:watch    # Watch mode
```

Solo lógica pura en `lib/` se testea: password, tokens, match-generator, scoring, slot-resolver, playoff-completer, invalidation.

## Estado actual

**Fases 1-4 completadas:** auth, CRUD de usuarios/torneos/equipos, zonas con drag-and-drop, generación de partidos, estados de ronda, pronósticos, ranking, playoff builder, invalidación de pronósticos.

**Fase 5 en curso:** deploy a Vercel + configuración de prod.

Ver planes detallados en `docs/superpowers/plans/`.

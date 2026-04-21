# Padel Prode — Design Spec

**Fecha:** 2026-04-21
**Autor:** Mauricio Cuello
**Estado:** Aprobado (pendiente de revisión escrita)

## 1. Overview

Web Next.js para que un grupo de amigos juegue un prode sobre torneos de padel reales. El admin configura el torneo completo (equipos, zonas de clasificación, partidos y cuadro de playoff) y carga los resultados reales; los jugadores cargan pronósticos (ganador + cantidad de sets) y compiten en un ranking por torneo.

### Objetivos

- Permitir administrar múltiples torneos de padel en una misma instancia.
- Soportar el ciclo completo: creación del torneo → zonas de clasificación → playoff con eliminación directa → carga de resultados → ranking.
- Habilitar la carga de pronósticos por parte de los jugadores, con estados de ronda que controlen apertura/cierre.
- Recalcular puntos automáticamente frente a correcciones del admin.

### No-objetivos

- Tráfico o escala (uso interno, ~10-50 usuarios).
- Multi-tenant (una sola instancia para un grupo).
- Auto-registro de jugadores (solo admin crea usuarios).
- Ranking global cross-torneo (el ranking es siempre por torneo).
- Notificaciones push o actualizaciones real-time (refresh manual alcanza).
- App mobile nativa o PWA.

### Principios de diseño

1. **Resolución dinámica sobre denormalización.** El "equipo efectivo" de cada slot de playoff se deriva de las posiciones de grupo y los ganadores de partidos previos; no se cachea.
2. **Estados de ronda como máquina de estados explícita.** `sin_abrir → abierta → cerrada`, con reglas claras por estado.
3. **Admin desktop-first, player mobile-first.** Rutas y layouts separados por rol.

## 2. Stack técnico

- **Framework:** Next.js (App Router, React Server Components, Server Actions).
- **Base de datos:** Neon Postgres.
- **ORM:** Drizzle ORM con driver serverless (`@neondatabase/serverless`).
- **Auth:** Auth.js v5 con Credentials provider; sesión en cookie JWT.
- **UI:** shadcn/ui sobre Tailwind.
- **Drag & drop:** dnd-kit.
- **Emails:** Resend.
- **Validación:** Zod.
- **Formularios:** React Hook Form.
- **Testing:** Vitest (solo unit tests de lógica pura).
- **Package manager:** pnpm.
- **Despliegue:** Vercel Hobby (production en `main`, preview deploys por branch).

## 3. Modelo de dominio

### Entidades

**`users`** — admins y players.
- `id`, `email` (unique), `name`, `password_hash`, `role` (`admin` | `player`), `must_change_password` (bool), `created_at`.

**`tournaments`**
- `id`, `name`, `status` (`draft` | `active` | `finished`), `created_at`.

**`teams`** — parejas que compiten en un torneo.
- `id`, `tournament_id`, `name`, `player_1_name`, `player_2_name`.
- Los jugadores de padel son strings en el team; no hay tabla propia de "jugadores de padel".

**`groups`** — zonas de clasificación.
- `id`, `tournament_id`, `name` (ej: "Grupo A"), `order`.

**`group_teams`** — equipos asignados a un grupo, con posición final.
- `group_id`, `team_id`, `final_position` (nullable hasta que el admin la marque).

**`rounds`** — la fase de grupos es una ronda, cada ronda de playoff es otra.
- `id`, `tournament_id`, `kind` (`groups` | `playoff`), `order` (0 = grupos, 1+ = playoff), `name` (ej: "Octavos"), `status` (`sin_abrir` | `abierta` | `cerrada`).

**`matches`**
- `id`, `round_id`, `order` (posición dentro de la ronda — define cruces en la ronda siguiente).
- `slot_a_type`, `slot_a_ref`, `slot_b_type`, `slot_b_ref` — slots polimórficos (ver sección 5).
- `result_winner_team_id` (nullable), `result_sets` (`2` | `3`, nullable).

**`predictions`**
- `match_id`, `user_id`, `predicted_winner_team_id`, `predicted_sets` (`2` | `3`), `updated_at`.
- PK compuesta `(match_id, user_id)`.

**`password_reset_tokens`**
- `token` (32+ bytes random, unique), `user_id`, `expires_at`, `used_at` (nullable).

### Relaciones & reglas

- `tournaments → teams`, `groups`, `rounds`: `ON DELETE CASCADE`.
- `rounds → matches`: `ON DELETE CASCADE`.
- `matches → predictions`: `ON DELETE CASCADE`.
- Un partido es **jugable y pronosticable** si sus dos slots resuelven a un `team` real (no pendiente, no `bye`).
- Un partido con un slot `bye` tiene ganador automático = el otro slot resuelto; no acepta pronósticos.

## 4. Arquitectura

### Estructura de carpetas

```
app/
  (auth)/
    login/
    change-password/
    forgot-password/
    reset-password/[token]/
  (admin)/                    # desktop-first
    tournaments/              # lista + crear
    tournaments/[id]/
      teams/
      groups/                 # drag-and-drop
      playoff/                # builder
      matches/                # cargar resultados
      rounds/                 # estado de rondas
    users/                    # CRUD global
  (player)/                   # mobile-first
    tournaments/[id]/
      groups/
      playoff/
      ranking/
  api/
    auth/                     # handlers de Auth.js
db/
  schema.ts                   # Drizzle
  migrations/
lib/
  auth.ts
  slot-resolver.ts
  match-generator.ts
  playoff-completer.ts
  scoring.ts
  invalidation.ts
  email.ts
actions/                      # Server Actions
  tournaments.ts
  teams.ts
  groups.ts
  playoff.ts
  matches.ts
  predictions.ts
  users.ts
scripts/
  seed-admin.ts
```

### Auth

- Auth.js v5 con Credentials provider.
- Password hashing con bcrypt (cost 10).
- Middleware redirige:
  - Sin sesión → `/login`.
  - Con `must_change_password = true` → `/change-password`.
  - `/admin/*` → requiere `role = 'admin'`.
  - `/player/*` → requiere cualquier sesión autenticada (admins también acceden).

### Mutaciones y lecturas

- **Mutaciones:** Server Actions. Cada action valida con Zod, chequea autorización, ejecuta, y retorna `{ ok: true, data? }` o `{ ok: false, error }` (o `{ ok: false, requiresConfirmation: true, affectedMatches }` para flujos de invalidación).
- **Lecturas:** Server Components (fetch directo con Drizzle) por defecto. Client Components solo donde hay interactividad real (drag-and-drop, formularios, bracket).
- **Sincronización UI:** `revalidatePath()` o `router.refresh()` según corresponda.

### Estado cliente

- Sin store global.
- Formularios con React Hook Form.
- Drag-and-drop con dnd-kit usando estado local optimista, sincronizado a server action al drop.

### Base de datos

- Drizzle + `@neondatabase/serverless`.
- Migraciones con `drizzle-kit`.
- Branches de Neon: `main` (producción) y `dev` (local + previews).

## 5. Resolución de slots & invalidación

### `resolveSlot(slot) → { team: Team | null, isBye: boolean }`

- `type = 'team'`: lookup en `teams`.
- `type = 'bye'`: `{ team: null, isBye: true }`.
- `type = 'group_position'`: busca en `group_teams` el equipo con `(group_id, final_position)`. Si la posición no está asignada, retorna `{ team: null, isBye: false }` (slot "pendiente").
- `type = 'match_winner'`: lee `result_winner_team_id` del match referenciado. Si el match tiene un slot `bye`, el "ganador" efectivo es el otro slot resuelto. Si no hay resultado cargado, "pendiente".
- `type = 'match_loser'`: análogo a `match_winner` pero retorna el equipo que **no** ganó (el otro slot resuelto del match referenciado). Solo se usa en zonas de 4 equipos (segunda fecha de la fase de grupos); no aparece en playoff.

### `computeAffectedMatches(cambio_propuesto) → Match[]`

Operaciones que pueden disparar invalidación:
1. Cambiar `final_position` de un equipo en un grupo.
2. Cambiar `result_winner_team_id` de un partido.

Algoritmo: simular el estado post-cambio y, para cada match del torneo, comparar `(resolved_slot_a, resolved_slot_b)` antes vs después. Los matches con delta son los afectados. Propagación **transitiva** vía `match_winner`.

### Flujo de edición con invalidación

1. La server action corre `computeAffectedMatches(cambio)` antes de aplicar.
2. Se agrupa por estado de la ronda de cada match afectado:
   - `sin_abrir`: no hay predictions → aplicar libre.
   - `abierta` o `cerrada`: requiere confirmación.
3. Si hay matches en `abierta`/`cerrada` con `predictions` existentes: la action retorna `{ ok: false, requiresConfirmation: true, affectedMatches: [ids] }`.
4. UI muestra modal: "Este cambio afecta N partidos con pronósticos. ¿Confirmar?" (solo cantidad, no desglose).
5. Si admin confirma, la action se invoca con `confirm: true`. En una transacción:
   - Aplica el cambio.
   - `DELETE FROM predictions WHERE match_id IN (...)` para los afectados.
6. Efectos:
   - Ronda `abierta` → los jugadores pueden recargar predictions con el equipo nuevo.
   - Ronda `cerrada` → esos matches quedan sin predictions; nadie suma puntos ahí.

## 6. Flujos principales

### Flujo 1 — Primer ingreso del jugador

1. Admin crea user → se genera password temporal random → se envía por mail → `must_change_password = true`.
2. Usuario hace login → middleware redirige a `/change-password`.
3. Ingresa nueva password → server action actualiza hash, pone `must_change_password = false` → redirige a la vista del torneo activo (o al selector si hay varios).

### Flujo 2 — Armar zonas

1. Admin entra a `/admin/tournaments/[id]/groups`.
2. Ve panel izquierdo con zonas (recuadros) y panel derecho con equipos sin asignar.
3. Crea zonas vacías con "+ Agregar zona" (nombre editable).
4. Arrastra equipos con dnd-kit: lista → zona, zona → zona, zona → lista. Cada drop dispara `assignTeamToGroup` / `removeTeamFromGroup`.
5. Abre modal "Editar posiciones" para marcar `final_position` de cada equipo dentro de su zona.
6. Botón global **"Generar partidos"**:
   - Idempotente a nivel zona.
   - Para cada zona con el set de equipos sin cambios desde la última generación, no hace nada.
   - Para zonas con cambios, borra los partidos existentes y regenera:
     - 3 equipos → 3 partidos: A-B, A-C, B-C.
     - 4 equipos → 4 partidos: primera fecha A-B y C-D; segunda fecha cruzada (ganador A-B vs perdedor C-D, perdedor A-B vs ganador C-D), representados como slots `match_winner` / `match_loser` sobre la primera fecha.
   - Si una zona tiene cantidad inválida (distinta de 3 o 4), reporta qué zonas están mal y deja intactas las demás.

### Flujo 3 — Armar playoff

1. Al entrar por primera vez a `/admin/tournaments/[id]/playoff`, si no hay ronda de playoff, se crea una por defecto (`kind='playoff'`, `order=1`, status `sin_abrir`, nombre editable).
2. Admin agrega partidos a la primera ronda con "+ Agregar partido". Cada cajita tiene dos slots; cada slot es dropdown con opciones: `{grupo, posición}` o `bye`.
3. Botón **"Completar rondas"**: el helper `playoff-completer` toma la primera ronda, empareja `match(2k)` con `match(2k+1)` generando la siguiente ronda con slots `match_winner`, y repite hasta llegar a 1 partido (final).
4. Validación: la cantidad de partidos de la primera ronda debe ser potencia de 2. Si no, el admin agrega `bye` slots hasta completar (ej: 6 partidos + 2 byes = 8).

### Flujo 4 — Abrir/cerrar ronda y cargar pronósticos

1. Admin cambia status de una ronda en `/admin/tournaments/[id]/rounds`. Transiciones válidas: `sin_abrir → abierta`, `abierta → cerrada`. Otras transiciones se rechazan.
2. Jugador entra a `/player/tournaments/[id]/groups` o `/playoff` y carga pronósticos en partidos de rondas `abierta`.
3. Inputs: radio ganador + radio 2/3 sets. Autosave con debounce 300ms; toast de confirmación/error.
4. Ronda `cerrada` → UI del jugador muestra pronósticos en read-only.
5. Ronda `sin_abrir` → la UI player ni muestra los partidos (o los muestra bloqueados).

### Flujo 5 — Cargar resultado & ranking

1. Admin en `/admin/tournaments/[id]/matches`: lista por ronda; carga ganador + sets.
2. **Restricción**: no se puede cargar resultado si la ronda está `sin_abrir`.
3. Guardar recalcula la resolución de slots de los matches dependientes (función pura) y propaga sin escrituras (porque los slots son referencias, no cache).
4. Jugador en `/player/tournaments/[id]/ranking`: tabla con posición, nombre, puntos totales. Puntos se computan on-the-fly (sin persistir) a partir de `predictions` + `matches.result_*`.

### Flujo 6 — Edición con invalidación

Ver sección 5.

## 7. Scoring

Función pura `computeScore(prediction, match_result)`:
- Sin predicción → 0.
- `predicted_winner !== actual_winner` → 0.
- `predicted_winner === actual_winner && predicted_sets !== actual_sets` → 1.
- `predicted_winner === actual_winner && predicted_sets === actual_sets` → 2.

Ranking del torneo = suma de `computeScore` sobre todos los `(match, prediction)` del torneo, agrupado por `user_id`. Desempate: por cantidad de ganadores acertados; si persiste, orden alfabético por `name`.

## 8. UI & rutas

### Admin (desktop-first, `/admin/*`)

- `/admin/tournaments` — lista (tabla con nombre, status, fecha). Botón "Crear torneo".
- `/admin/tournaments/new` — formulario.
- `/admin/tournaments/[id]` — detalle con tabs: Equipos · Zonas · Playoff · Partidos · Rondas. Header: nombre, status, acción de cambiar status del torneo.
- `/admin/users` — CRUD de usuarios con acciones: crear (password temp automática + mail), reenviar password temp, eliminar.

#### Pantalla "Zonas"
- Split dos columnas. Izquierda: grid de recuadros (zonas) con nombre editable, chips de equipos asignados, contador (3/3 o 4/4), botón borrar zona.
- Derecha: lista vertical de equipos sin asignar, arrastrables.
- Toolbar: "+ Agregar zona", **"Generar partidos"** (global idempotente), "Editar posiciones" (modal).

#### Pantalla "Playoff"
- Vista horizontal tipo fixture: rondas como columnas de cajitas apiladas.
- Primera ronda creada por defecto al entrar la primera vez.
- Cajitas con dos slots (dropdown `{grupo, posición, bye}`), muestran equipo resuelto o "Pendiente".
- Cajitas con resultado cargado muestran ganador + sets.
- Botón "+ Agregar partido" al final de la primera ronda.
- Botón "Completar rondas" en la toolbar.
- Botones "Abrir ronda" / "Cerrar ronda" por ronda.

### Player (mobile-first, `/player/*`)

- `/player/tournaments/[id]/groups` — acordeón por zona; dentro, partidos con inputs de pronóstico. Badge de estado de ronda. Autosave.
- `/player/tournaments/[id]/playoff` — bracket scrolleable horizontal; cada cajita pronosticable abre bottom sheet (mobile) o inline (desktop).
- `/player/tournaments/[id]/ranking` — tabla: posición, nombre, puntos. Tap en jugador expande detalle de sus pronósticos.

### Navegación

Header con nombre del torneo actual, selector de torneo (multi-torneo), menú de usuario (logout, cambiar contraseña).

### Tema visual

- **Paleta:** verde cancha (primary), acento cálido (naranja para destacados), neutros cálidos. Tokens concretos vía CSS variables de Tailwind, definidos al armar el primer componente visual.
- **Tipografía:** Inter (Google Fonts).
- **Base:** shadcn/ui, customizado.

## 9. Casos borde & errores

- **Validación:** Zod en cada server action; errores como toast.
- **Autorización:** middleware + revalidación en server action (403 si no corresponde).
- **Transiciones de ronda inválidas:** rechazadas con mensaje.
- **No se puede cargar resultado con ronda `sin_abrir`.**
- **"Completar rondas" con cantidad no potencia de 2:** rechazado; admin debe agregar byes.
- **Zonas con cantidad inválida en "Generar partidos":** se reporta cuáles, las demás válidas se generan.
- **Reenviar password temporal:** regenera una nueva, setea `must_change_password = true`.
- **Reset por mail:** token random 32+ bytes, expiración 1h, uso único.
- **Borrado:** hard delete con cascade; sin soft delete (excepto torneos si en el futuro se necesita historial — no en MVP).
- **Concurrencia:** sin locking; last-write-wins es aceptable.
- **Reordenar equipos dentro de una zona con partidos generados:** el botón "Generar partidos" idempotente no borra partidos si el set de equipos no cambió; reordenamientos visuales sin impacto.
- **Sacar un equipo de una zona con partidos ya generados y predictions cargadas:** al regenerar, se aplica el mismo flujo de invalidación con confirmación.

## 10. Testing

### Unit tests (Vitest) en `lib/`

- `match-generator`: zonas de 3 y 4 equipos, casos borde de cantidad inválida.
- `playoff-completer`: 8→4→2→1 partidos, con y sin byes, validación de potencia de 2.
- `slot-resolver`: cada `type`, slots pendientes, cadenas transitivas de `match_winner`.
- `scoring`: sin predicción, ganador errado, ganador correcto sin sets, ganador correcto con sets.
- `invalidation` / `computeAffectedMatches`: cambio de posición, cambio de ganador, propagación transitiva.

### Fuera de scope

- Tests de UI.
- Tests E2E.
- Tests de integración DB (salvo que una función pura lo requiera).

## 11. Despliegue & setup

### Variables de entorno

- `DATABASE_URL` — Neon Postgres.
- `AUTH_SECRET` — Auth.js.
- `RESEND_API_KEY`.
- `APP_URL` — para links en mails.

### Scripts

- `pnpm dev` — levantar Next.js local.
- `pnpm db:push` — sincronizar schema (drizzle-kit).
- `pnpm db:migrate` — correr migraciones.
- `pnpm test` — Vitest.
- `pnpm tsx scripts/seed-admin.ts <email> <password>` — crear primer admin.

### Seguridad

- Passwords con bcrypt (cost 10).
- Tokens de reset random, uso único, expiración 1h.
- CSRF manejado por Server Actions.
- Sin logs de passwords ni tokens.
- Sin rate limiting en MVP.

### Ciclo de despliegue

- Push a `main` → production en Vercel.
- Push a otras branches → preview deploys (con branch de Neon `dev`).
- Migraciones se aplican manualmente con `drizzle-kit migrate` desde local apuntando al branch correspondiente.

## 12. Decisiones abiertas (se resuelven en el plan de implementación)

- Orden específico de implementación por fases.
- Tokens exactos de tema visual (HSL, shadows, radios).
- Acciones destructivas específicas que requieren confirmación vs las que no.

# Fase 5 — Deploy & pulido Implementation Plan

> **For agentic workers:** Phase 5 es principalmente operativa (deploy + configuración de servicios). Muchos pasos requieren tu interacción manual con dashboards de Vercel, Neon y Resend. Esta fase no tiene TDD pesado — es más bien un runbook.

**Goal:** Desplegar Padel Prode a producción en Vercel Hobby conectado a Neon `main` branch, configurar Resend con dominio verificado, seed del admin en producción, smoke test E2E en producción, y una pasada de pulido sobre el UI.

**Architecture:** Sin cambios de código significativos. Cambios de config (env vars en Vercel, dominio en Resend) y tweaks menores de UX.

---

## Reference

- Spec: [docs/superpowers/specs/2026-04-21-padel-prode-design.md](../specs/2026-04-21-padel-prode-design.md) §11 (Despliegue & setup).
- Planes anteriores: Fases 1-4 en [plans/](../plans/).

---

## Task 1: Push del repo a GitHub

**Why:** Vercel Hobby se integra con repos de GitHub para deploys automáticos.

- [ ] **Step 1: Crear repo vacío en GitHub**

En https://github.com/new:
- Repository name: `padel-prode`
- Visibility: `Private` recomendado (es un proyecto personal)
- **NO** inicializar con README, .gitignore ni licencia (tu repo local ya tiene).

- [ ] **Step 2: Agregar remote y hacer el primer push**

```bash
cd /Users/mauriciocuello/Documents/Personal/Repositories/PadelProde
git remote add origin git@github.com:<tu-usuario>/padel-prode.git
git branch -M main
git push -u origin main --tags
```

Verificar en el browser que el código está en GitHub.

**Nota:** `--tags` pushea los tags de las fases (`phase-1-foundation`, etc.).

---

## Task 2: Neon — crear branch `main` para producción

**Why:** Actualmente usás Neon sobre el branch por default. Para separar datos de dev y prod, creá un branch dedicado.

- [ ] **Step 1: Crear branch `main` en Neon**

En https://console.neon.tech/app/projects/<tu-proyecto>/branches:
- Click "Create branch"
- Name: `main`
- "Branch from": tu branch por default (el que usaste hasta ahora puede servir como dev)
- Click "Create"

**Alternativa:** si preferís tener `dev` y `main` separados desde cero, renombrá el branch por default a `dev` y creá `main` vacío. Pero si ya hiciste smoke test con datos relevantes y querés descartar, creá `main` vacío desde scratch.

- [ ] **Step 2: Copiar connection string del branch `main`**

Una vez creado, en la página del branch `main`, copiá el **Pooled connection string** (igual que al inicio del proyecto).

- [ ] **Step 3: Aplicar migraciones al branch `main`**

Crear `.env.production.local` **solo temporalmente** para aplicar migraciones:

```bash
cp .env.local .env.production.local
# Editar .env.production.local: reemplazar DATABASE_URL con la del branch main
```

Correr las migraciones apuntando a prod:

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH" && \
  DATABASE_URL=<connection-string-de-main> pnpm db:migrate
```

Verificar en Drizzle Studio (con esa URL) que las 9 tablas existen y están vacías.

- [ ] **Step 4: Eliminar `.env.production.local`**

```bash
rm .env.production.local
```

---

## Task 3: Resend — verificar dominio propio (opcional pero recomendado)

**Why:** Con `onboarding@resend.dev` (sandbox) solo podés mandar mails al email registrado en Resend. Para mandar bienvenida a tus amigos, necesitás un dominio verificado.

**Si no tenés dominio propio:** podés skippear esta task y usar la app solo con vos como admin (y los demás usuarios se crean en DB por query). No ideal. Considerá comprar un dominio barato (Cloudflare / Namecheap / Porkbun, ~$10/año).

- [ ] **Step 1: Agregar dominio en Resend**

En https://resend.com/domains:
- Click "Add domain"
- Ingresá tu dominio (ej: `padel-prode.com`) o un subdominio (ej: `mail.tudominio.com`).
- Copiá los registros DNS que Resend te muestra (típicamente SPF, DKIM, DMARC).

- [ ] **Step 2: Agregar registros DNS**

En el panel DNS de tu registrar:
- Agregar los TXT y/o CNAME que Resend te pidió.
- Esperar 5-30 min para propagación.
- Volver a Resend → click "Verify" hasta que quede verde.

- [ ] **Step 3: Actualizar RESEND_FROM_EMAIL**

Formato: `Padel Prode <noreply@tudominio.com>`. Este valor se usa en prod (lo configurás en Task 4).

---

## Task 4: Vercel — crear proyecto y configurar env vars

- [ ] **Step 1: Importar proyecto en Vercel**

En https://vercel.com/new:
- Click "Import" en el repo `padel-prode` de GitHub.
- Framework: Next.js (detectado automático).
- Root Directory: `.` (default).
- Build Command: `pnpm build` (default).
- Output Directory: `.next` (default).
- Install Command: `pnpm install` (default).

**No hacer deploy todavía** — primero agregar las env vars.

- [ ] **Step 2: Agregar env vars en Vercel**

En la sección "Environment Variables" del import wizard (o después en Project Settings > Environment Variables):

| Name | Value | Environments |
|---|---|---|
| `DATABASE_URL` | connection string de Neon **main** branch | Production |
| `DATABASE_URL` | connection string de Neon **dev** branch | Preview, Development |
| `AUTH_SECRET` | output de `openssl rand -base64 32` (nuevo, distinto del dev) | Production, Preview, Development |
| `RESEND_API_KEY` | tu API key de Resend | Production, Preview, Development |
| `RESEND_FROM_EMAIL` | `Padel Prode <noreply@tudominio.com>` (o `onboarding@resend.dev` si skippeaste Task 3) | Production |
| `RESEND_FROM_EMAIL` | `Padel Prode <onboarding@resend.dev>` | Preview, Development |
| `APP_URL` | `https://<tu-proyecto>.vercel.app` (actualizar después del primer deploy con el dominio real) | Production |
| `APP_URL` | `http://localhost:3000` | Development |

**Nota sobre previews:** los deploys de preview (branches que no son `main`) usarán las env vars del environment "Preview". Podés apuntarlos al branch `dev` de Neon para no tocar prod desde previews.

---

## Task 5: Primer deploy a producción

- [ ] **Step 1: Deploy**

Click "Deploy" en Vercel. Esperar 1-3 min a que termine el build.

- [ ] **Step 2: Chequear build output**

Si el build falla, revisar logs. Posibles causas:
- Env vars faltantes: completarlas en Project Settings.
- `lib/env.ts` falla validación: revisar valores.

- [ ] **Step 3: Obtener URL de producción**

Vercel asigna un dominio `<tu-proyecto>-<hash>.vercel.app`. También podés asignar un dominio custom en Settings > Domains si tenés uno.

- [ ] **Step 4: Actualizar `APP_URL`**

Si no lo habías puesto en Task 4 o quedó con un placeholder, editalo ahora en Vercel con la URL real (ej: `https://padel-prode.vercel.app`). Redeploy para que tome el nuevo valor.

---

## Task 6: Seed del admin en producción

- [ ] **Step 1: Correr seed-admin contra Neon main**

Desde local, apuntando a la URL de prod:

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH" && \
  DATABASE_URL=<connection-string-de-main> \
  pnpm seed:admin tu@email.com 'tu-password-segura' 'Tu Nombre'
```

Confirmar output: `✓ Admin tu@email.com created.`

**Nota:** podés usar el mismo email con el que te registraste en Resend; así recibís mails sin necesidad de dominio verificado.

---

## Task 7: Smoke test en producción

- [ ] **Step 1: Login en producción**

Abrir `https://<tu-proyecto>.vercel.app/login`, loguearte con el admin seed. Debería redirigir a `/admin/tournaments`.

- [ ] **Step 2: Flow completo**

Repetir el smoke test combinado de Fases 1-4:

1. Crear un torneo "Prueba Prod".
2. Crear 4 equipos.
3. Ir a "Zonas" → crear zona, arrastrar equipos, "Generar partidos".
4. Ir a "Rondas" → abrir la ronda de grupos.
5. Ir a "Partidos" → cargar algún resultado.
6. Ir a "Playoff" → la primera ronda se crea automática; agregar 2 partidos con group_position, click "Completar rondas".
7. Como player (navegá a `/player/tournaments/<id>/groups`): cargar pronósticos.
8. Ver ranking en `/player/tournaments/<id>/ranking`.
9. Crear otro usuario desde `/admin/users`. Si tenés dominio verificado, debería recibir mail con password temp.

- [ ] **Step 2b (si falla):** revisar logs en Vercel Deployment > Functions. Reportar errores y fixearlos antes de cerrar la fase.

- [ ] **Step 3: Delete del torneo de prueba si querés dejar la DB limpia**

En `/admin/tournaments/<id>` → selector de estado → botón "Borrar".

---

## Task 8: Pulido de UI

Pasada por issues cosméticos y de UX que queden pendientes.

- [ ] **Step 1: Agregar botón "Cambiar mi contraseña" accesible desde el menú de usuario**

Actualmente sólo podés cambiarla vía "Olvidé mi contraseña" o en el primer login. Agregar un link en el header que te lleve a `/change-password`.

Modificar `components/header.tsx` y `components/player-header.tsx` para agregar el link:

```tsx
<Link href="/change-password" className="text-muted-foreground hover:underline px-2 text-sm">
  Cambiar contraseña
</Link>
```

- [ ] **Step 2: Empty states**

Revisar:
- `/admin/tournaments/[id]/teams` con 0 equipos — ya tiene.
- `/admin/tournaments/[id]/groups` sin zonas — ya tiene.
- `/admin/tournaments/[id]/matches` sin rondas — ya tiene.
- `/player/tournaments/[id]/groups` sin ronda abierta — ya tiene.
- `/admin/users` sin usuarios — ya tiene.

Si alguno no te convence, ajustalo.

- [ ] **Step 3: Validar navegación del player**

El player llega a `/player/tournaments` y desde ahí a un torneo. Si hay solo 1 torneo visible, considerar redirigir automáticamente a ese torneo. **Opcional** — depende de cuántos torneos esperás tener al mismo tiempo.

Si querés el redirect:

```tsx
// app/(player)/player/tournaments/page.tsx — agregar arriba del return
if (rows.length === 1) {
  redirect(`/player/tournaments/${rows[0].id}`);
}
```

(Importar `redirect` desde `next/navigation`.)

- [ ] **Step 4: Responsive check**

Abrir el dev tools del browser en modo mobile (iPhone SE 375px). Navegar por:
- `/login`, `/admin/tournaments`, `/admin/tournaments/[id]/teams` — puede no ser ideal en mobile pero aceptable (admin desktop-first).
- `/player/tournaments`, `/player/tournaments/[id]/groups`, `/playoff`, `/ranking` — deben funcionar bien en mobile.

Ajustes si hace falta (margins, font sizes).

- [ ] **Step 5: Commit de los pulidos**

```bash
git add .
git commit -m "polish: change-password link in header, UX refinements"
git push origin main
```

Vercel hará deploy automático.

---

## Task 9: Actualizar README con estado final

**Files:** `README.md`

- [ ] **Step 1: Agregar sección "Producción"**

```markdown
## Producción

- **URL:** https://<tu-proyecto>.vercel.app
- **Vercel:** auto-deploy en push a `main`.
- **DB:** Neon branch `main` (prod) y `dev` (previews + local).
- **Mails:** Resend con dominio `tudominio.com` verificado (o sandbox si skippeaste).

### Rollback

Si un deploy rompe prod, en Vercel > Deployments > elegir un deploy anterior > "Promote to Production".

### Observabilidad

- Logs de Server Actions en Vercel > Project > Deployment > Functions.
- Errores de cliente en Vercel Analytics (si lo activaste).
- Mails enviados en Resend > Logs.
```

- [ ] **Step 2: Actualizar sección "Estado actual"**

```markdown
## Estado actual

**Todas las fases completadas:** auth, CRUD de usuarios/torneos/equipos, zonas con drag-and-drop, generación de partidos, playoff con invalidación de pronósticos, ranking, deploy en producción.

Ver planes en `docs/superpowers/plans/` para detalle de cada fase.
```

- [ ] **Step 3: Commit + push**

```bash
git add README.md
git commit -m "docs: production info and final status in README"
git push origin main
```

---

## Criterios de aceptación Fase 5

- [x] Repo pusheado a GitHub con tags de fases.
- [x] Neon `main` branch creado, migrado y vacío (listo para datos de producción).
- [x] Vercel conectado al repo, env vars configuradas, deploy exitoso.
- [x] Admin seed en producción; login funciona.
- [x] Smoke test E2E en producción cubre un torneo completo.
- [x] README actualizado con URL de prod y estado final.

## Deferido (out of scope para el proyecto)

- Monitoreo / alertas (Sentry, Logtail).
- Tests E2E automatizados con Playwright.
- Rate limiting en rutas de auth.
- Backups programados de Neon (hay point-in-time-recovery built-in).
- CI / CD workflows en GitHub Actions (Vercel ya hace CI).

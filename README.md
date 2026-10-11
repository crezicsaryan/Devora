# Devora

Devora is a developer portfolio and activity tracker. Sign in with Google, claim
a unique username, link the coding platforms you actually use, and Devora keeps a
private dashboard — plus a public profile you choose to share — in sync with real
stats pulled from those platforms.

No number on the dashboard is invented: every figure is derived from stored rows
that a platform sync wrote. When there is no data, the UI says so instead of
showing a placeholder.

---

## Features

**Accounts and onboarding**

- Google-only sign-in through Supabase. Email/password and GitHub *sign-in* are
  deliberately disabled.
- Onboarding collects name, a globally unique username (case-insensitive), college
  and at least one skill. Photo and platform links are optional.
- `/auth/continue` is the single place that decides where a signed-in user
  belongs: a finished profile goes to `/dashboard`, an unfinished one to
  `/profile/create`. A completed user is never re-shown onboarding.

**Platforms** — six adapters behind one registry (`src/lib/platforms/registry.ts`):

| Platform | Link type | How it connects |
| --- | --- | --- |
| GitHub | OAuth | Full OAuth app handshake; token stored server-side, never in the browser |
| LeetCode | public | Profile handle, no credentials |
| Codeforces | public | Profile handle, no credentials |
| CodeChef | public | Profile handle, no credentials |
| GeeksforGeeks | public | Profile handle, no credentials |
| HackerRank | public | Profile handle, no credentials |

Each sync writes normalized activity events and coding stats: problems solved,
contest rating where the platform exposes one, per-day activity, and the derived
streaks / personal bests shown on the dashboard.

**Dashboard** — activity heatmap, charts, streaks, problem tracker, achievements,
topic progress, projects, leaderboard, analytics, notifications and settings.

**Public profile** — `/u/<username>` renders only the fields the owner's
visibility map allows, and only for profiles that finished onboarding. Fields the
owner hid are absent from the payload, not hidden in the UI.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| UI | React 19, CSS Modules, Tailwind 4 |
| Language | TypeScript 5 |
| App data | MySQL 8 through Prisma 6 — `prisma/schema.prisma` is the source of truth |
| Auth | Supabase Auth (Google OAuth) |
| Photo storage | Supabase Storage, service-role key, server-side only |
| Validation | Zod |
| Landing visuals | three.js via `@react-three/fiber` + `drei` |
| Verification | `tsc --noEmit` plus two dependency-free assertion scripts |

## Architecture

```
Browser  ──▶  Next.js route handler  ──▶  Prisma Client  ──▶  MySQL
                    │
                    └── Supabase (session cookies / Google sign-in)
```

Two rules shape the codebase:

1. **The browser never touches the database.** Every read and write goes through
   an API route that first resolves the session with `requireUser()`. A user id is
   never accepted from a request body — it always comes from the verified session.
2. **The proxy is a coarse gate, not the authority.** `src/proxy.ts` refreshes the
   session cookie and bounces signed-out users, but the real onboarding and
   ownership checks live in the database and in each route handler.

### Project layout

```
src/
  app/                    pages and /api route handlers
  components/             dashboard, onboarding, profile, public UI
  lib/
    db/
      prisma.ts           the single shared, lazily-cached Prisma client
      repository.ts       every database read/write for onboarding + dashboard
      public-profile.ts   the visibility-filtered public projection
    platforms/
      registry.ts         the only place that knows which adapters exist
      sync-runner.ts      runs a sync and records its outcome
      adapters/*.ts       one file per platform
    supabase/             browser and server Supabase clients
    server-auth.ts        requireUser / requireProfileUser / error shapes
    validation.ts         every input schema in one place
    dashboard-metrics.ts  pure dashboard math, shared by server and client
prisma/
  schema.prisma           schema source of truth (MySQL)
  seed.ts                 skills + achievements catalogue (idempotent)
  sql/                    updated_at triggers Prisma cannot express
supabase/                 the original Postgres schema, kept for reference
scripts/                  verify-* checks
```

## Getting started

**Prerequisites:** Node.js 20+, npm, a MySQL 8 server, and a Supabase project.

```bash
npm install
```

### 1. Environment variables

Secrets live in two git-ignored files. Never commit their values, and never give a
server-only key a `NEXT_PUBLIC_` prefix — that prefix ships the value to the
browser.

`devora/.env` — server-only:

```env
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/devora"
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
```

Percent-encode reserved characters in the MySQL password (`@` becomes `%40`).

`devora/.env.local` — browser-visible values only:

```env
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
```

Optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Enables profile-photo uploads. Server-only. Without it the app still runs; photo upload reports itself as unavailable. |
| `DEVORA_STORAGE_BUCKET` | `devora-photos` | Storage bucket used for profile photos. |

The app degrades rather than crashes when an optional integration is missing:
GitHub OAuth that is not configured redirects back with a message naming the exact
missing variables and the exact callback URL.

### 2. MySQL (application data)

1. Create an empty MySQL database named `devora`.
2. Apply the schema and seed the reference catalogue:

   ```bash
   npm run db:push      # create/update tables from prisma/schema.prisma
   npm run db:seed      # skills + achievements catalogue (idempotent)
   npm run verify:db    # connectivity + schema health check
   ```

3. Prisma cannot express triggers, so apply the four `updated_at` triggers once:

   ```bash
   mysql -h 127.0.0.1 -P 3306 -u root devora < prisma/sql/devora_triggers.sql
   ```

### 3. Supabase (sign-in, and photos if you want them)

1. Create a Supabase project.
2. In **Authentication → Providers**, enable **Google** and add the callback
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. For photo uploads, create a public storage bucket named `devora-photos` (or set
   `DEVORA_STORAGE_BUCKET` to your own) and add `SUPABASE_SERVICE_ROLE_KEY` to
   `devora/.env`.

The `supabase/*.sql` files record the original Postgres schema — the schema this
Prisma schema was translated from. Application data now lives in MySQL, so they no
longer need to be applied; `npm run verify:schema` still checks them so the two do
not silently drift.

### 4. GitHub OAuth (only needed for GitHub sync)

Create a GitHub OAuth App with the authorization callback URL:

```
http://localhost:3000/api/platforms/github/callback
```

Use the same port you actually run the dev server on — the callback must match
character for character, or GitHub rejects the handshake.

Put its Client ID and secret in `devora/.env` as `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`. The handshake uses a random, single-use `state` token bound
to the signed-in user and stored server-side with a 10-minute expiry, which blocks
CSRF on the callback.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>. If port 3000 is taken, pass a port explicitly —
`npx next dev -p 3001` — otherwise Turbopack silently picks a random one.
`next.config.ts` allows both `localhost` and `127.0.0.1` as dev origins; opening
the app on a hostname that is not allowed breaks the dev client and every button
silently stops working.

Flow: sign in → `/profile/create` → `/dashboard`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | `typecheck` + `verify:logic` + `verify:schema` — the gate to run before committing |
| `npm run verify:logic` | Assertion suite for validation, profile links and dashboard math |
| `npm run verify:schema` | Checks the Postgres migration files are still self-consistent |
| `npm run verify:db` | MySQL connectivity and schema health |
| `npm run verify:platforms` | Exercises the platform adapters |
| `npm run db:push` | Sync `prisma/schema.prisma` to MySQL |
| `npm run db:seed` | Seed the skills + achievements catalogue |
| `npm run db:generate` / `db:studio` | Prisma client generation / database browser |

## Security notes

- Sessions are validated server-side with Supabase's `getUser()`, so a forged or
  expired cookie cannot produce a user.
- Every private API route resolves the user itself; none of them trust a
  client-supplied identity.
- `/api/public/[username]` is the only unauthenticated data route, and it returns
  the visibility-filtered projection only.
- Photo objects are namespaced under `profiles/<userId>/`, so one user can never
  read or delete another user's photo through the storage layer.
- Internal `?next=` redirects are validated to reject protocol-relative targets
  such as `//evil.com` (`src/lib/safe-path.ts`).
- Error responses surface validation-style messages only; anything that smells
  internal is replaced with a generic message.

## Status and limitations

- Application data runs on Prisma + MySQL; the repository, public profile
  projection, onboarding, dashboard and public pages all read and write through it.
- Supabase is still the identity provider (Google sign-in) and the photo store.
- **`127.0.0.1` means the machine the backend runs on.** MySQL on loopback works
  while Devora runs on your own computer. A deployed backend cannot reach your
  local MySQL and needs a managed, network-reachable MySQL instead.
- The schema is MySQL-specific by design; moving back to Postgres means
  re-translating `prisma/schema.prisma` (the translation notes live at the bottom
  of that file).

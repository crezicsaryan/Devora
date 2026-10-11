This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Devora setup

1. Create a Supabase project, then run in the SQL Editor, in order:
   `supabase/schema.sql` → `supabase/onboarding.sql` → `supabase/profile-v2.sql`
2. Fill `devora/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public)
   - database credentials belong in `devora/.env` (git-ignored) — see **Database (MySQL + Prisma)** below
   - `SUPABASE_SERVICE_ROLE_KEY` — needed for profile-photo storage uploads (server-only, never `NEXT_PUBLIC_*`)
3. In Supabase → Authentication → Providers, enable **Google** and add the callback
   `https://<project-ref>.supabase.co/auth/v1/callback`. Only Google sign-in is
   offered by the app (email/password and GitHub are disabled).
4. `npm run dev` and open http://localhost:3000

Flow: auth → `/profile/create` (name, unique username, college, ≥1 skill required; photo and platforms optional) → `/dashboard`. Photos are stored in the `devora-photos` storage bucket and only their URL is saved in the database.

## Database (MySQL + Prisma)

Application data is served by a **MySQL** database through **Prisma**, always
from the server. The browser never talks to MySQL:

```
Frontend -> API route -> Prisma -> MySQL (devora)
```

1. Create an empty MySQL database named `devora`.
2. Put the connection string in `devora/.env` — git-ignored, server-side only,
   never a `NEXT_PUBLIC_*` name:

   ```env
   DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/devora"
   ```

   Percent-encode reserved characters in the password (`@` becomes `%40`).
3. Apply the schema and load the reference catalogue:

   ```bash
   npm run db:push      # create/update tables from prisma/schema.prisma
   npm run db:seed      # skills + achievements catalogue (idempotent)
   npm run verify:db    # connectivity + schema health check
   ```

   Prisma cannot express triggers, so the four `updated_at` triggers that
   Postgres had are applied once from `prisma/sql/devora_triggers.sql`:

   ```bash
   mysql -h 127.0.0.1 -P 3306 -u root devora < prisma/sql/devora_triggers.sql
   ```

`prisma/schema.prisma` is the schema source of truth. `supabase/*.sql` records
the original Postgres schema it was translated from. Google sign-in still runs
on Supabase — only application data moved to MySQL.

> **Status:** the Prisma schema, the `devora` database, the triggers and the
> catalogue seed are in place and verified (`npm run verify:db`), and the
> repository layer in `src/lib/db/` runs on Prisma — onboarding, the dashboard
> and the public profile read and write MySQL through it.

> **`127.0.0.1` means the machine the backend runs on.** This works while Devora
> runs on your own PC. A deployed/remote backend cannot reach your local MySQL
> and requires a managed, network-reachable MySQL instead.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

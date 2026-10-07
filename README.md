This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Devora setup

1. Create a Supabase project, then run in the SQL Editor, in order:
   `supabase/schema.sql` → `supabase/onboarding.sql` → `supabase/profile-v2.sql`
2. Fill `devora/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public)
   - `DATABASE_URL` — Supabase Postgres connection string (server-only)
   - `SUPABASE_SERVICE_ROLE_KEY` — needed for profile-photo storage uploads (server-only, never `NEXT_PUBLIC_*`)
3. In Supabase → Authentication → Providers, enable **Google** and add the callback
   `https://<project-ref>.supabase.co/auth/v1/callback`. Only Google sign-in is
   offered by the app (email/password and GitHub are disabled).
4. `npm run dev` and open http://localhost:3000

Flow: auth → `/profile/create` (name, unique username, college, ≥1 skill required; photo and platforms optional) → `/dashboard`. Photos are stored in the `devora-photos` storage bucket and only their URL is saved in the database.

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

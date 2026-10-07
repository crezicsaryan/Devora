-- Devora profiles table — run this once in Supabase Dashboard → SQL Editor
-- Stores each user's editable dashboard profile (identity + links + platform stats) as JSONB.

create table if not exists public.devora_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.devora_profiles enable row level security;

drop policy if exists "Users can read own profile" on public.devora_profiles;
create policy "Users can read own profile"
  on public.devora_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own profile" on public.devora_profiles;
create policy "Users can insert own profile"
  on public.devora_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.devora_profiles;
create policy "Users can update own profile"
  on public.devora_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

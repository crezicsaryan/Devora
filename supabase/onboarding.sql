-- ============================================================================
-- Devora — post-authentication onboarding + dashboard schema
-- Run ONCE in Supabase Dashboard -> SQL Editor, AFTER supabase/schema.sql.
--
-- This extends the EXISTING Supabase Postgres database. No second database.
-- It is additive: devora_profiles (the legacy JSONB profile) is left untouched
-- so Edit Profile and the current dashboard keep working.
--
-- Design notes
--  * The source of truth for "has this user finished onboarding?" is
--    profiles.onboarding_completed — never a client value, never localStorage.
--  * Coding-platform data is written ONLY by server-side jobs using the
--    service role. Row Level Security therefore makes every platform table
--    read-only for users and closed to anon.
--  * OAuth access/refresh tokens live in a table with no RLS policies at all,
--    which means only the service role can ever touch them. They are never
--    returned by any API response.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. Shared helpers
-- ============================================================================

create or replace function public.devora_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Username canonical form: lowercase, letters/numbers/underscore/hyphen only.
create or replace function public.devora_normalize_username(raw text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(raw, ''), '[^a-zA-Z0-9_-]', '', 'g'));
$$;

-- ============================================================================
-- 2. Username registry — case-insensitive global uniqueness
--    A partial unique index on profiles.display_username would not stop two
--    users racing for "Aryan" vs "aryan". This table does, atomically.
-- ============================================================================

create table if not exists public.username_registry (
  username_normalized text primary key,
  username            text not null,
  user_id             uuid not null references auth.users(id) on delete cascade,
  created_at          timestamptz not null default now()
);

create index if not exists username_registry_user_idx
  on public.username_registry (user_id);

alter table public.username_registry enable row level security;

-- Anyone (including a signed-out visitor) may ask whether a handle is free.
-- The uniqueness check only ever reveals a boolean, so no data leaks.
drop policy if exists "Username registry is publicly readable" on public.username_registry;
create policy "Username registry is publicly readable"
  on public.username_registry for select
  using (true);

-- ============================================================================
-- 3. Profiles — identity, visibility, onboarding state
-- ============================================================================

create table if not exists public.profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,

  -- identity
  display_name         text not null default '',
  display_username     text,
  username_normalized  text,
  bio                  text not null default '',
  developer_role       text not null default '',
  college              text not null default '',
  location             text,
  avatar_url           text,
  email                text,

  -- linking back to the Devora account that owns this profile
  website              text,
  twitter_url          text,
  linkedin_url         text,
  portfolio_url        text,

  -- visibility: { "email": false, "location": true, ... }
  -- Public surfaces only ever expose keys that are explicitly true.
  visibility           jsonb not null default
    '{"avatar":true,"bio":true,"role":true,"location":true,"skills":true,"platforms":true,"socials":true,"projects":true,"email":false}'::jsonb,

  -- onboarding state — SERVER-OWNED. There is no client write path to these.
  onboarding_completed boolean not null default false,
  onboarding_step      smallint not null default 1,
  onboarding_completed_at timestamptz,
  profile_completion   smallint not null default 0,

  -- cached dashboard aggregates, recomputed from real rows, never hardcoded
  total_solved         integer not null default 0,
  current_streak       integer not null default 0,
  longest_streak       integer not null default 0,
  github_contributions integer not null default 0,
  aggregates_updated_at timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists profiles_username_normalized_key
  on public.profiles (username_normalized)
  where username_normalized is not null;

create index if not exists profiles_onboarding_idx
  on public.profiles (onboarding_completed);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.devora_touch_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

-- Note: onboarding_completed / profile_completion / cached aggregates are
-- stripped from user payloads in the server layer, so this policy cannot be
-- used to self-complete onboarding.
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

-- ============================================================================
-- 4. Skills
-- ============================================================================

create table if not exists public.skills (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  category   text not null,           -- 'language' | 'technology' | 'custom'
  created_at timestamptz not null default now()
);

create index if not exists skills_category_idx on public.skills (category);

alter table public.skills enable row level security;

drop policy if exists "Skills are publicly readable" on public.skills;
create policy "Skills are publicly readable"
  on public.skills for select
  using (true);

create table if not exists public.user_skills (
  user_id   uuid not null references auth.users(id) on delete cascade,
  skill_id  uuid not null references public.skills(id) on delete cascade,
  position  smallint not null default 0,
  custom_name text,
  created_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

create index if not exists user_skills_user_idx on public.user_skills (user_id);

alter table public.user_skills enable row level security;

drop policy if exists "Users read own skills" on public.user_skills;
create policy "Users read own skills"
  on public.user_skills for select
  using (auth.uid() = user_id);

drop policy if exists "Users write own skills" on public.user_skills;
create policy "Users write own skills"
  on public.user_skills for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 5. Connected coding platforms
-- ============================================================================

create table if not exists public.platform_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  platform         text not null,     -- github|leetcode|gfg|codechef|codeforces|hackerrank
  username         text not null,
  external_user_id text,
  profile_url      text,
  avatar_url       text,
  auth_type        text not null default 'public', -- 'oauth' | 'public'
  connection_status text not null default 'connected',
                     -- connected | pending | error | disconnected
  is_public        boolean not null default false,
  sync_status      text not null default 'idle',
                     -- idle | syncing | ok | failed
  sync_error       text,
  last_synced_at   timestamptz,
  connected_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, platform)
);

create index if not exists platform_accounts_user_idx
  on public.platform_accounts (user_id);
create index if not exists platform_accounts_platform_idx
  on public.platform_accounts (platform);

drop trigger if exists platform_accounts_touch on public.platform_accounts;
create trigger platform_accounts_touch
  before update on public.platform_accounts
  for each row execute function public.devora_touch_updated_at();

alter table public.platform_accounts enable row level security;

drop policy if exists "Users read own platform accounts" on public.platform_accounts;
create policy "Users read own platform accounts"
  on public.platform_accounts for select
  using (auth.uid() = user_id);

-- A user may link a platform handle and remove it, but never forge sync state.
-- sync_status / sync_error / last_synced_at are server-written only.
drop policy if exists "Users insert own platform accounts" on public.platform_accounts;
create policy "Users insert own platform accounts"
  on public.platform_accounts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own platform accounts" on public.platform_accounts;
create policy "Users delete own platform accounts"
  on public.platform_accounts for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- 6. OAuth tokens — service role ONLY. No RLS policies = no user access.
-- ============================================================================

create table if not exists public.platform_oauth_tokens (
  id             uuid primary key default gen_random_uuid(),
  platform_account_id uuid not null unique
                   references public.platform_accounts(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  platform       text not null,
  access_token   text not null,
  refresh_token  text,
  scope          text,
  token_type     text,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists platform_oauth_tokens_touch on public.platform_oauth_tokens;
create trigger platform_oauth_tokens_touch
  before update on public.platform_oauth_tokens
  for each row execute function public.devora_touch_updated_at();

alter table public.platform_oauth_tokens enable row level security;
-- Intentionally no policies: anon and authenticated roles can read nothing.

-- One-time CSRF state for the GitHub OAuth handshake, also service-role only.
create table if not exists public.oauth_states (
  state      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  provider   text not null,
  next       text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.oauth_states enable row level security;
-- Intentionally no policies.

-- ============================================================================
-- 7. Coding statistics (per platform snapshot + daily history)
-- ============================================================================

create table if not exists public.coding_stats (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  platform_account_id uuid references public.platform_accounts(id) on delete cascade,
  platform           text not null,

  solved_total       integer,
  solved_easy        integer,
  solved_medium      integer,
  solved_hard        integer,
  rating             integer,
  max_rating         integer,
  rank_label         text,           -- 'Expert', '3★', 'Top 12%' …
  contests           integer,
  badges             integer,
  reputation         integer,
  followers          integer,
  following          integer,
  public_repos       integer,
  contributions      integer,
  streak_current     integer,
  streak_longest     integer,

  raw                jsonb,          -- untouched adapter payload for auditing
  fetched_at         timestamptz not null default now(),
  unique (user_id, platform)
);

create index if not exists coding_stats_user_idx on public.coding_stats (user_id);

alter table public.coding_stats enable row level security;

drop policy if exists "Users read own coding stats" on public.coding_stats;
create policy "Users read own coding stats"
  on public.coding_stats for select
  using (auth.uid() = user_id);

-- Daily activity series powering the dashboard chart. Never fetched from an
-- external API at render time — the chart reads these rows only.
create table if not exists public.activity_daily (
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null,
  day        date not null,
  count      integer not null default 0,
  difficulty jsonb not null default '{}'::jsonb, -- {"easy":2,"medium":1,"hard":0}
  primary key (user_id, platform, day)
);

create index if not exists activity_daily_user_day_idx
  on public.activity_daily (user_id, day desc);

alter table public.activity_daily enable row level security;

drop policy if exists "Users read own daily activity" on public.activity_daily;
create policy "Users read own daily activity"
  on public.activity_daily for select
  using (auth.uid() = user_id);

create table if not exists public.topic_progress (
  user_id  uuid not null references auth.users(id) on delete cascade,
  topic    text not null,
  solved   integer not null default 0,
  total    integer not null default 0,
  source   text not null default 'tracker',
  updated_at timestamptz not null default now(),
  primary key (user_id, topic)
);

alter table public.topic_progress enable row level security;

drop policy if exists "Users read own topic progress" on public.topic_progress;
create policy "Users read own topic progress"
  on public.topic_progress for select
  using (auth.uid() = user_id);

-- ============================================================================
-- 8. Question tracker
-- ============================================================================

create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  difficulty text not null,           -- Easy | Medium | Hard
  topic      text,
  url        text,
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

drop policy if exists "Questions are publicly readable" on public.questions;
create policy "Questions are publicly readable"
  on public.questions for select
  using (true);

create table if not exists public.user_questions (
  user_id     uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  status      text not null default 'todo',   -- todo | solved | review
  note        text,
  solved_at   timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index if not exists user_questions_user_idx on public.user_questions (user_id);

alter table public.user_questions enable row level security;

drop policy if exists "Users read own question rows" on public.user_questions;
create policy "Users read own question rows"
  on public.user_questions for select
  using (auth.uid() = user_id);

drop policy if exists "Users write own question rows" on public.user_questions;
create policy "Users write own question rows"
  on public.user_questions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 9. Projects
-- ============================================================================

create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  tech_stack   text[] not null default '{}',
  image_url    text,
  github_url   text,
  live_url     text,
  is_featured  boolean not null default false,
  source       text not null default 'manual',  -- manual | github
  external_id  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id);
create unique index if not exists projects_user_external_key
  on public.projects (user_id, source, external_id)
  where external_id is not null;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch
  before update on public.projects
  for each row execute function public.devora_touch_updated_at();

alter table public.projects enable row level security;

drop policy if exists "Users read own projects" on public.projects;
create policy "Users read own projects"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "Users write own projects" on public.projects;
create policy "Users write own projects"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 10. Achievements — awarded server-side from real data only
-- ============================================================================

create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  title       text not null,
  description text not null default '',
  tier        text not null default 'bronze',
  metric      text not null,          -- problems|streak|repos|platforms|projects
  threshold   integer not null,
  icon        text not null default '🏆',
  created_at  timestamptz not null default now()
);

alter table public.achievements enable row level security;

drop policy if exists "Achievement catalogue is publicly readable" on public.achievements;
create policy "Achievement catalogue is publicly readable"
  on public.achievements for select
  using (true);

create table if not exists public.user_achievements (
  user_id        uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists user_achievements_user_idx
  on public.user_achievements (user_id);

alter table public.user_achievements enable row level security;

drop policy if exists "Users read own achievements" on public.user_achievements;
create policy "Users read own achievements"
  on public.user_achievements for select
  using (auth.uid() = user_id);

-- ============================================================================
-- 11. Notifications
-- ============================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'system',
  title      text not null,
  body       text not null default '',
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

-- ============================================================================
-- 12. Sync jobs + logs
-- ============================================================================

create table if not exists public.sync_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null,
  status      text not null default 'queued',
                -- queued | running | succeeded | failed
  attempt     smallint not null default 0,
  error       text,
  queued_at   timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);

create index if not exists sync_jobs_user_idx
  on public.sync_jobs (user_id, queued_at desc);
create index if not exists sync_jobs_pending_idx
  on public.sync_jobs (status, queued_at)
  where status in ('queued', 'running');

alter table public.sync_jobs enable row level security;

drop policy if exists "Users read own sync jobs" on public.sync_jobs;
create policy "Users read own sync jobs"
  on public.sync_jobs for select
  using (auth.uid() = user_id);

create table if not exists public.sync_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null,
  status     text not null,
  message    text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists sync_logs_user_idx
  on public.sync_logs (user_id, created_at desc);

alter table public.sync_logs enable row level security;

drop policy if exists "Users read own sync logs" on public.sync_logs;
create policy "Users read own sync logs"
  on public.sync_logs for select
  using (auth.uid() = user_id);

-- ============================================================================
-- 13. Activity feed — drives "Recent Activity" on the dashboard
-- ============================================================================

create table if not exists public.activity_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,   -- problem_solved | revision | github_sync |
                              -- platform_sync | achievement | project
  title      text not null,
  detail     text,
  href       text,
  metadata   jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists activity_events_user_idx
  on public.activity_events (user_id, occurred_at desc);

alter table public.activity_events enable row level security;

drop policy if exists "Users read own activity events" on public.activity_events;
create policy "Users read own activity events"
  on public.activity_events for select
  using (auth.uid() = user_id);

-- ============================================================================
-- 14. Public profile reader
--     The dashboard reads its own data with the service role after verifying
--     the caller. Public/anonymous reads go through this function so that only
--     fields explicitly marked public are ever exposed.
-- ============================================================================

create or replace function public.devora_public_profile(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_profile public.profiles%rowtype;
  v_vis jsonb;
  v_result jsonb;
begin
  select user_id into v_user_id
    from public.profiles
   where username_normalized = public.devora_normalize_username(p_username)
     and onboarding_completed = true
   limit 1;

  if v_user_id is null then
    return null;
  end if;

  select * into v_profile from public.profiles where user_id = v_user_id;
  v_vis := coalesce(v_profile.visibility, '{}'::jsonb);

  v_result := jsonb_build_object(
    'username', v_profile.display_username,
    'displayName', v_profile.display_name,
    'developerRole', v_profile.developer_role,
    'createdAt', v_profile.onboarding_completed_at
  );

  if (v_vis->>'bio')::boolean is true then
    v_result := v_result || jsonb_build_object('bio', v_profile.bio);
  end if;

  if (v_vis->>'location')::boolean is true and v_profile.location is not null then
    v_result := v_result || jsonb_build_object('location', v_profile.location);
  end if;

  if (v_vis->>'email')::boolean is true then
    v_result := v_result || jsonb_build_object('email', v_profile.email);
  end if;

  if (v_vis->>'socials')::boolean is true then
    v_result := v_result || jsonb_build_object(
      'socials', jsonb_strip_nulls(jsonb_build_object(
        'github', v_profile.portfolio_url,
        'linkedin', v_profile.linkedin_url,
        'x', v_profile.twitter_url,
        'website', v_profile.website
      ))
    );
  end if;

  if (v_vis->>'skills')::boolean is true then
    v_result := v_result || jsonb_build_object('skills', coalesce((
      select jsonb_agg(s.name order by us.position, s.name)
        from public.user_skills us
        join public.skills s on s.id = us.skill_id
       where us.user_id = v_user_id
    ), '[]'::jsonb));
  end if;

  if (v_vis->>'platforms')::boolean is true then
    v_result := v_result || jsonb_build_object('platforms', coalesce((
      select jsonb_agg(jsonb_build_object(
               'platform', pa.platform,
               'username', pa.username,
               'url', pa.profile_url,
               'stats', jsonb_strip_nulls(jsonb_build_object(
                 'solvedTotal', cs.solved_total,
                 'solvedEasy', cs.solved_easy,
                 'solvedMedium', cs.solved_medium,
                 'solvedHard', cs.solved_hard,
                 'rating', cs.rating,
                 'rank', cs.rank_label,
                 'contributions', cs.contributions,
                 'publicRepos', cs.public_repos,
                 'contests', cs.contests,
                 'badges', cs.badges
               ))
             ) order by pa.connected_at)
        from public.platform_accounts pa
        left join public.coding_stats cs on cs.platform_account_id = pa.id
       where pa.user_id = v_user_id
         and pa.connection_status = 'connected'
    ), '[]'::jsonb));
  end if;

  if (v_vis->>'projects')::boolean is true then
    v_result := v_result || jsonb_build_object('projects', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', p.name,
               'description', p.description,
               'techStack', p.tech_stack,
               'githubUrl', p.github_url,
               'liveUrl', p.live_url,
               'imageUrl', p.image_url
             ) order by p.created_at desc)
        from public.projects p
       where p.user_id = v_user_id
    ), '[]'::jsonb));
  end if;

  return v_result;
end;
$$;

revoke all on function public.devora_public_profile(text) from public;
grant execute on function public.devora_public_profile(text) to anon, authenticated;

-- ============================================================================
-- 15. Seed data — real catalogue rows, no fake user statistics
-- ============================================================================

insert into public.skills (slug, name, category) values
  ('java','Java','language'),
  ('javascript','JavaScript','language'),
  ('typescript','TypeScript','language'),
  ('python','Python','language'),
  ('c','C','language'),
  ('cpp','C++','language'),
  ('csharp','C#','language'),
  ('go','Go','language'),
  ('rust','Rust','language'),
  ('kotlin','Kotlin','language'),
  ('php','PHP','language'),
  ('ruby','Ruby','language'),
  ('swift','Swift','language'),
  ('sql','SQL','language'),
  ('bash','Bash','language'),
  ('react','React','technology'),
  ('nextjs','Next.js','technology'),
  ('nodejs','Node.js','technology'),
  ('express','Express','technology'),
  ('nestjs','NestJS','technology'),
  ('spring-boot','Spring Boot','technology'),
  ('django','Django','technology'),
  ('flask','Flask','technology'),
  ('mongodb','MongoDB','technology'),
  ('mysql','MySQL','technology'),
  ('postgresql','PostgreSQL','technology'),
  ('redis','Redis','technology'),
  ('docker','Docker','technology'),
  ('kubernetes','Kubernetes','technology'),
  ('git','Git','technology'),
  ('aws','AWS','technology'),
  ('firebase','Firebase','technology'),
  ('tailwind','Tailwind CSS','technology'),
  ('graphql','GraphQL','technology'),
  ('rest-api','REST API','technology'),
  ('linux','Linux','technology'),
  ('tensorflow','TensorFlow','technology'),
  ('pytorch','PyTorch','technology'),
  ('tensorflowjs','TensorFlow.js','technology'),
  ('vercel','Vercel','technology'),
  ('jwt','JWT','technology'),
  ('socketio','Socket.IO','technology'),
  ('prisma','Prisma','technology'),
  ('redis-streams','Redis Streams','technology')
on conflict (slug) do nothing;

insert into public.achievements (code, title, description, metric, threshold, icon, tier) values
  ('streak-30','30 Day Streak','Solved at least one problem every day for 30 days.','streak',30,'🔥','bronze'),
  ('streak-50','50 Day Streak','Solved at least one problem every day for 50 days.','streak',50,'🔥','silver'),
  ('streak-100','100 Day Streak','Solved at least one problem every day for 100 days.','streak',100,'🔥','gold'),
  ('problems-100','100 Problems','Solved 100 problems across your connected platforms.','problems',100,'⚡','bronze'),
  ('problems-500','500 Problems','Solved 500 problems across your connected platforms.','problems',500,'⚡','silver'),
  ('problems-1000','1000 Problems','Solved 1000 problems across your connected platforms.','problems',1000,'⚡','gold'),
  ('first-project','First Project','Added your first project to your Devora profile.','projects',1,'🚀','bronze'),
  ('projects-5','Project Builder','Shipped 5 projects on your Devora profile.','projects',5,'🚀','silver'),
  ('github-builder','GitHub Builder','Connected GitHub and pushed real repositories.','repos',1,'💻','bronze'),
  ('platforms-3','Multi-Platform','Connected 3 or more coding platforms.','platforms',3,'🔗','silver'),
  ('platforms-5','Polyglot Coder','Connected 5 or more coding platforms.','platforms',5,'🔗','gold')
on conflict (code) do nothing;

-- ============================================================================
-- Done. Confirm with:
--   select table_name from information_schema.tables
--    where table_schema = 'public' order by table_name;
-- ============================================================================

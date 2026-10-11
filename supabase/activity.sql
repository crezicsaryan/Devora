-- ============================================================================
-- Devora — activity model migration
-- Run ONCE in Supabase Dashboard -> SQL Editor, AFTER supabase/profile-v2.sql.
--
-- The dashboard is built on one normalized activity feed. This migration makes
-- that feed explicit instead of implicit:
--
--   1. public.activity_events gains the columns the dashboard needs to slice
--      real activity (platform / activity_type / external_id / difficulty /
--      topic / activity_date) plus a uniqueness guard so a re-sync cannot
--      double-count the same external item.
--   2. Extra achievement rows for the dashboard's achievement grid.
--   3. Indexes for the "this month" leaderboard and range queries.
--
-- Nothing is dropped or renamed, so existing rows keep working.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalized activity columns
--    `kind` remains the coarse bucket the UI groups by; `activity_type` is the
--    full, explicit type. Both are kept so older write paths stay valid.
-- ---------------------------------------------------------------------------

alter table public.activity_events
  add column if not exists platform      text,
  add column if not exists activity_type  text,
  add column if not exists external_id    text,
  add column if not exists difficulty     text,
  add column if not exists topic          text,
  add column if not exists activity_date  date;

-- Backfill from the columns that already hold this information. Existing rows
-- were written before activity_type existed, so map the coarse `kind` onto the
-- explicit type. This is a real derivation from stored data, not a guess.
update public.activity_events
   set activity_type = coalesce(
         activity_type,
         case kind
           when 'problem_solved' then 'PROBLEM_SOLVED'
           when 'github_sync'    then 'GITHUB_PUSH'
           when 'project'        then 'PROJECT_UPDATE'
           when 'achievement'    then 'ACHIEVEMENT_UNLOCKED'
           when 'platform_sync'  then 'PLATFORM_SYNC'
           else upper(replace(kind, '-', '_'))
         end
       )
 where activity_type is null;

update public.activity_events
   set activity_date = occurred_at::date
 where activity_date is null;

-- A sync that runs twice must not create two identical activity rows. Only
-- rows that carry a platform-provided identity are constrained — hand-written
-- events (notes, profile updates) legitimately repeat.
create unique index if not exists activity_events_external_key
  on public.activity_events (user_id, platform, activity_type, external_id)
  where external_id is not null;

create index if not exists activity_events_user_day_idx
  on public.activity_events (user_id, activity_date desc);

create index if not exists activity_events_user_type_idx
  on public.activity_events (user_id, activity_type, activity_date desc);

-- ---------------------------------------------------------------------------
-- 2. Daily activity index — the heatmap, streaks and every "over time" chart
--    read from public.activity_daily, which is written by the sync runner.
--    (The table itself is created in onboarding.sql.)
-- ---------------------------------------------------------------------------

create index if not exists activity_daily_user_platform_day_idx
  on public.activity_daily (user_id, platform, day desc);

-- ---------------------------------------------------------------------------
-- 3. Monthly leaderboard support
--    Rankings are computed per calendar month from real activity, so a new
--    month starts a new race without any scheduled job.
-- ---------------------------------------------------------------------------

create index if not exists profiles_username_lookup_idx
  on public.profiles (username_normalized)
  where onboarding_completed = true;

-- ---------------------------------------------------------------------------
-- 4. Achievement catalogue additions
--    Every threshold below is checked against a metric computed from stored
--    rows in src/lib/db/repository.ts (evaluateAchievements). No achievement
--    can be granted without the underlying data existing.
-- ---------------------------------------------------------------------------

insert into public.achievements (code, title, description, metric, threshold, icon, tier) values
  ('first-problem','First Problem Solved','Solved your first problem on a connected platform.','problems',1,'🎯','bronze'),
  ('problems-50','50 Problems','Solved 50 problems across your connected platforms.','problems',50,'⚡','bronze'),
  ('streak-7','7 Day Streak','Solved at least one problem every day for a week.','streak',7,'🔥','bronze'),
  ('active-days-100','100 Active Days','Coded on 100 separate days.','active_days',100,'📅','silver'),
  ('github-connected','First GitHub Connection','Connected GitHub to Devora.','github',1,'💻','bronze')
on conflict (code) do nothing;

-- ============================================================================
-- Done. Confirm with:
--   select column_name from information_schema.columns
--    where table_name = 'activity_events'
--    order by ordinal_position;
--   select code, metric, threshold from public.achievements order by threshold;
-- ============================================================================

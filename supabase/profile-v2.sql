-- ============================================================================
-- Devora — profile v2 migration
-- Run ONCE in Supabase Dashboard -> SQL Editor, AFTER supabase/onboarding.sql.
--
-- Adds the two pieces the Profile Create / Onboarding flow needs on a database
-- that already ran the earlier migrations:
--
--   1. profiles.college — a REQUIRED onboarding field (name + username +
--      college + at least one skill gate dashboard access).
--   2. A public object-storage bucket for profile photos. The DATABASE stores
--      only the photo's public URL (profiles/{userId}/profile-photo-<ts>.jpg) —
--      never the image binary. Uploads happen server-side with the service
--      role key, which is why no storage write policies are needed here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. College — required profile field
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists college text not null default '';

-- ---------------------------------------------------------------------------
-- 2. Profile photo storage
--
-- `public = true` lets the stored URL render in <img> tags without signed
-- requests. Writes are performed exclusively by the server using the service
-- role key (SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS entirely — so the
-- browser can read photo URLs but can never upload, overwrite or delete.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('devora-photos', 'devora-photos', true)
on conflict (id) do nothing;

-- Belt-and-braces: even if someone flips the bucket to private later, keep a
-- read policy scoped to this bucket only.
drop policy if exists "Public read devora-photos" on storage.objects;
create policy "Public read devora-photos"
  on storage.objects for select
  using (bucket_id = 'devora-photos');

-- ============================================================================
-- Done. Verify with:
--   select column_name from information_schema.columns
--    where table_name = 'profiles' and column_name = 'college';
--   select id, public from storage.buckets where id = 'devora-photos';
-- ============================================================================

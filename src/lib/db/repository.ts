/**
 * Devora repository — every database read/write for the onboarding + dashboard
 * surface lives here so that route handlers stay thin and consistent.
 *
 * Two things are deliberately centralised:
 *   1. `stripServerFields` — onboarding_completed and the cached aggregates can
 *      never be echoed back into a client-writable payload.
 *   2. `recomputeAggregates` — dashboard numbers are derived from real rows
 *      (coding_stats / activity_daily / projects). Nothing is hardcoded.
 */

import "server-only";
import { query, queryOne, withTransaction } from "@/lib/db/pool";
import {
  DEFAULT_VISIBILITY,
  type ActivityEventRow,
  type AchievementRow,
  type ActivityPoint,
  type ActivityRange,
  type ConnectedPlatform,
  type DevoraSocials,
  type DifficultyBreakdown,
  type NotificationRow,
  type PlatformAccount,
  type PlatformKey,
  type PlatformStats,
  type ProfileCompletionItem,
  type ProjectRow,
  type SyncStatus,
  type TopicProgressRow,
  type Visibility,
} from "@/lib/types";
import { ACTIVITY_RANGES } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Row shapes                                                          */
/* ------------------------------------------------------------------ */

type ProfileRow = {
  user_id: string;
  display_name: string;
  display_username: string | null;
  username_normalized: string | null;
  bio: string;
  developer_role: string;
  college: string | null;
  location: string | null;
  avatar_url: string | null;
  email: string | null;
  website: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  visibility: Visibility | null;
  onboarding_completed: boolean;
  onboarding_step: number;
  created_at: string;
  total_solved: number;
  current_streak: number;
  longest_streak: number;
  github_contributions: number;
};

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export async function ensureProfile(
  userId: string,
  email: string | null,
  fallbackName: string,
  /** OAuth avatar (e.g. Google picture) — used ONLY when creating the row. */
  avatarUrl?: string | null
): Promise<ProfileRow> {
  const existing = await queryOne<ProfileRow>(
    `select * from public.profiles where user_id = $1`,
    [userId]
  );
  if (existing) return existing;

  await query(
    `insert into public.profiles (user_id, display_name, email, avatar_url)
     values ($1, $2, $3, $4)
     on conflict (user_id) do nothing`,
    [userId, fallbackName, email, avatarUrl ?? null]
  );

  const created = await queryOne<ProfileRow>(
    `select * from public.profiles where user_id = $1`,
    [userId]
  );
  if (!created) throw new Error("Could not create a Devora profile row.");
  return created;
}

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  return queryOne<ProfileRow>(`select * from public.profiles where user_id = $1`, [
    userId,
  ]);
}

/** Authoritative onboarding check. Always read from the database. */
export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const row = await queryOne<{ onboarding_completed: boolean }>(
    `select onboarding_completed from public.profiles where user_id = $1`,
    [userId]
  );
  return row?.onboarding_completed === true;
}

export type ProfileUpdate = Partial<{
  displayName: string;
  username: string;
  usernameNormalized: string;
  bio: string;
  developerRole: string;
  college: string;
  location: string;
  avatarUrl: string | null;
  email: string;
  socials: Partial<DevoraSocials>;
  visibility: Partial<Visibility>;
}>;

/**
 * Update editable profile fields.
 *
 * `onboarding_completed`, `onboarding_step`, `profile_completion` and the
 * cached aggregates are NOT writable here — a crafted request body cannot
 * complete onboarding or inflate stats.
 */
export async function updateProfile(
  userId: string,
  update: ProfileUpdate
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  const push = (column: string, value: unknown) => {
    sets.push(`${column} = $${i++}`);
    params.push(value);
  };

  if (update.displayName !== undefined) push("display_name", update.displayName);
  if (update.username !== undefined) push("display_username", update.username);
  if (update.usernameNormalized !== undefined)
    push("username_normalized", update.usernameNormalized);
  if (update.bio !== undefined) push("bio", update.bio);
  if (update.developerRole !== undefined)
    push("developer_role", update.developerRole);
  if (update.college !== undefined) push("college", update.college);
  if (update.location !== undefined) push("location", update.location || null);
  if (update.avatarUrl !== undefined) push("avatar_url", update.avatarUrl);
  if (update.email !== undefined) push("email", update.email || null);

  if (update.socials) {
    const s = update.socials;
    if (s.linkedin !== undefined) push("linkedin_url", s.linkedin || null);
    // NOTE: GitHub is stored as a `platform_accounts` row, not on the profile —
    // there is no github_url column, and writing it to portfolio_url would
    // clobber the user's actual portfolio link.
    if (s.twitter !== undefined) push("twitter_url", s.twitter || null);
    if (s.portfolio !== undefined) push("portfolio_url", s.portfolio || null);
    if (s.website !== undefined && s.portfolio === undefined)
      push("website", s.website || null);
    if (s.email !== undefined) push("email", s.email || null);
  }

  if (update.visibility) {
    const current = await getProfile(userId);
    const merged = { ...(current?.visibility ?? DEFAULT_VISIBILITY), ...update.visibility };
    push("visibility", JSON.stringify(merged));
  }

  if (sets.length === 0) return;
  params.push(userId);
  await query(
    `update public.profiles set ${sets.join(", ")} where user_id = $${i}`,
    params
  );
}

/* ------------------------------------------------------------------ */
/* Username registry                                                   */
/* ------------------------------------------------------------------ */

export type UsernameCheck = {
  username: string;
  available: boolean;
  reason: "ok" | "taken" | "invalid" | "reserved";
  message: string;
};

const RESERVED = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "dashboard",
  "devora",
  "help",
  "login",
  "logout",
  "me",
  "new",
  "onboarding",
  "settings",
  "signup",
  "support",
  "user",
  "www",
]);

export async function checkUsername(
  rawUsername: string,
  forUserId?: string
): Promise<UsernameCheck> {
  const { normalizeUsername, isValidUsername } = await import("@/lib/validation");
  const username = normalizeUsername(rawUsername);

  if (!username || !isValidUsername(username)) {
    return {
      username,
      available: false,
      reason: "invalid",
      message: "Use 3–30 letters, numbers, underscores or hyphens.",
    };
  }
  if (RESERVED.has(username)) {
    return {
      username,
      available: false,
      reason: "reserved",
      message: "That username is reserved by Devora.",
    };
  }

  const taken = await queryOne<{ user_id: string }>(
    `select user_id from public.username_registry where username_normalized = $1`,
    [username]
  );

  if (taken && taken.user_id !== forUserId) {
    return {
      username,
      available: false,
      reason: "taken",
      message: "Username already taken.",
    };
  }

  return {
    username,
    available: true,
    reason: "ok",
    message: "Username available.",
  };
}

/**
 * Claim a handle atomically.
 *
 * The insert into username_registry is the lock: two users racing for the same
 * handle will have exactly one winner. The transaction rolls back the whole
 * claim on conflict, so the registry and profiles never disagree.
 */
export async function claimUsername(
  userId: string,
  username: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = username.toLowerCase();
  try {
    await withTransaction(async (client) => {
      await client.query(
        `insert into public.username_registry (username_normalized, username, user_id)
         values ($1, $2, $3)`,
        [normalized, username, userId]
      );
      await client.query(
        `update public.profiles
            set display_username = $1, username_normalized = $2
          where user_id = $3`,
        [username, normalized, userId]
      );
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("username_registry_pkey") || message.includes("duplicate key")) {
      return { ok: false, error: "Username already taken." };
    }
    if (message.includes("profiles_username_normalized_key")) {
      return { ok: false, error: "Username already taken." };
    }
    return { ok: false, error: "Could not save that username." };
  }
}

/** Release the previous handle when a user renames themselves. */
export async function releaseUsername(userId: string): Promise<void> {
  await query(`delete from public.username_registry where user_id = $1`, [userId]);
}

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

export async function getSkills(userId: string): Promise<string[]> {
  const rows = await query<{ name: string; custom_name: string | null }>(
    `select s.name, us.custom_name
       from public.user_skills us
       join public.skills s on s.id = us.skill_id
      where us.user_id = $1
      order by us.position, s.name`,
    [userId]
  );
  return rows.map((r) => r.custom_name || r.name);
}

/**
 * Replace the user's skill set.
 *
 * Custom skills are inserted into the catalogue (so they are real rows with
 * real relations, not magic strings), then linked. Positions are preserved so
 * the profile shows skills in the order the user picked them.
 */
export async function setSkills(userId: string, names: string[]): Promise<void> {
  if (names.length === 0) {
    await query(`delete from public.user_skills where user_id = $1`, [userId]);
    return;
  }

  await withTransaction(async (client) => {
    const skillIds: string[] = [];
    for (const name of names) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
      if (!slug) continue;

      const { rows } = await client.query<{ id: string }>(
        `insert into public.skills (slug, name, category)
         values ($1, $2, 'custom')
         on conflict (slug) do update set name = public.skills.name
         returning id`,
        [slug, name]
      );
      if (rows[0]) skillIds.push(rows[0].id);
    }

    await client.query(`delete from public.user_skills where user_id = $1`, [userId]);

    let position = 0;
    for (const skillId of skillIds) {
      await client.query(
        `insert into public.user_skills (user_id, skill_id, position)
         values ($1, $2, $3)
         on conflict (user_id, skill_id) do nothing`,
        [userId, skillId, position++]
      );
    }
  });
}

export async function getSkillCatalogue(): Promise<
  { slug: string; name: string; category: string }[]
> {
  return query(
    `select slug, name, category from public.skills order by category, name`
  );
}

/* ------------------------------------------------------------------ */
/* Platform accounts                                                   */
/* ------------------------------------------------------------------ */

type PlatformAccountRow = {
  id: string;
  platform: PlatformKey;
  username: string;
  profile_url: string | null;
  avatar_url: string | null;
  auth_type: "oauth" | "public";
  connection_status: string;
  sync_status: string;
  sync_error: string | null;
  last_synced_at: string | null;
  connected_at: string;
};

type CodingStatsRow = {
  platform: PlatformKey;
  solved_total: number | null;
  solved_easy: number | null;
  solved_medium: number | null;
  solved_hard: number | null;
  rating: number | null;
  max_rating: number | null;
  rank_label: string | null;
  contests: number | null;
  badges: number | null;
  reputation: number | null;
  followers: number | null;
  public_repos: number | null;
  contributions: number | null;
  streak_current: number | null;
  streak_longest: number | null;
  fetched_at: string;
};

function toAccount(row: PlatformAccountRow): PlatformAccount {
  return {
    id: row.id,
    platform: row.platform,
    username: row.username,
    profileUrl: row.profile_url,
    avatarUrl: row.avatar_url,
    authType: row.auth_type,
    connectionStatus: row.connection_status as PlatformAccount["connectionStatus"],
    syncStatus: row.sync_status as SyncStatus,
    syncError: row.sync_error,
    lastSyncedAt: row.last_synced_at,
    connectedAt: row.connected_at,
  };
}

function toStats(row: CodingStatsRow | undefined): PlatformStats | null {
  if (!row) return null;
  return {
    platform: row.platform,
    solvedTotal: row.solved_total,
    solvedEasy: row.solved_easy,
    solvedMedium: row.solved_medium,
    solvedHard: row.solved_hard,
    rating: row.rating,
    maxRating: row.max_rating,
    rankLabel: row.rank_label,
    contests: row.contests,
    badges: row.badges,
    reputation: row.reputation,
    followers: row.followers,
    publicRepos: row.public_repos,
    contributions: row.contributions,
    streakCurrent: row.streak_current,
    streakLongest: row.streak_longest,
    fetchedAt: row.fetched_at,
  };
}

export async function getConnectedPlatforms(
  userId: string
): Promise<ConnectedPlatform[]> {
  const { PLATFORM_BY_KEY } = await import("@/lib/types");

  const accounts = await query<PlatformAccountRow>(
    `select * from public.platform_accounts
      where user_id = $1 and connection_status <> 'disconnected'
      order by connected_at`,
    [userId]
  );
  if (accounts.length === 0) return [];

  const stats = await query<CodingStatsRow>(
    `select * from public.coding_stats where user_id = $1`,
    [userId]
  );
  const byPlatform = new Map(stats.map((s) => [s.platform, s]));

  return accounts.map((row) => ({
    account: toAccount(row),
    stats: toStats(byPlatform.get(row.platform)),
    meta: PLATFORM_BY_KEY[row.platform],
  }));
}

export async function getPlatformAccount(
  userId: string,
  platform: PlatformKey
): Promise<PlatformAccountRow | null> {
  return queryOne<PlatformAccountRow>(
    `select * from public.platform_accounts where user_id = $1 and platform = $2`,
    [userId, platform]
  );
}

export async function upsertPlatformAccount(input: {
  userId: string;
  platform: PlatformKey;
  username: string;
  externalUserId?: string | null;
  profileUrl?: string | null;
  avatarUrl?: string | null;
  authType: "oauth" | "public";
  connectionStatus?: string;
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into public.platform_accounts
       (user_id, platform, username, external_user_id, profile_url, avatar_url,
        auth_type, connection_status, sync_status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'idle')
     on conflict (user_id, platform) do update set
       username = excluded.username,
       external_user_id = coalesce(excluded.external_user_id, public.platform_accounts.external_user_id),
       profile_url = excluded.profile_url,
       avatar_url = coalesce(excluded.avatar_url, public.platform_accounts.avatar_url),
       auth_type = excluded.auth_type,
       connection_status = excluded.connection_status,
       sync_status = 'idle',
       sync_error = null
     returning id`,
    [
      input.userId,
      input.platform,
      input.username,
      input.externalUserId ?? null,
      input.profileUrl ?? null,
      input.avatarUrl ?? null,
      input.authType,
      input.connectionStatus ?? "connected",
    ]
  );
  return rows[0].id;
}

export async function markAccountDisconnected(
  userId: string,
  platform: PlatformKey
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `delete from public.platform_oauth_tokens
        where user_id = $1 and platform = $2`,
      [userId, platform]
    );
    await client.query(
      `delete from public.coding_stats where user_id = $1 and platform = $2`,
      [userId, platform]
    );
    await client.query(
      `delete from public.activity_daily where user_id = $1 and platform = $2`,
      [userId, platform]
    );
    await client.query(
      `delete from public.platform_accounts where user_id = $1 and platform = $2`,
      [userId, platform]
    );
    await client.query(
      `delete from public.sync_jobs
        where user_id = $1 and platform = $2 and status in ('queued','running')`,
      [userId, platform]
    );
  });
  await recomputeAggregates(userId);
}

export async function setSyncState(
  userId: string,
  platform: PlatformKey,
  status: SyncStatus,
  error?: string | null
): Promise<void> {
  await query(
    `update public.platform_accounts
        set sync_status = $1,
            sync_error = $2,
            last_synced_at = case when $1 = 'ok' then now() else last_synced_at end
      where user_id = $3 and platform = $4`,
    [status, error ?? null, userId, platform]
  );
}

/* ------------------------------------------------------------------ */
/* Coding stats                                                        */
/* ------------------------------------------------------------------ */

export type NormalizedStats = Omit<PlatformStats, "platform" | "fetchedAt"> & {
  raw?: unknown;
};

export async function upsertCodingStats(
  userId: string,
  platformAccountId: string,
  platform: PlatformKey,
  stats: NormalizedStats
): Promise<void> {
  await query(
    `insert into public.coding_stats (
       user_id, platform_account_id, platform, solved_total, solved_easy,
       solved_medium, solved_hard, rating, max_rating, rank_label, contests,
       badges, reputation, followers, public_repos, contributions,
       streak_current, streak_longest, raw, fetched_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now())
     on conflict (user_id, platform) do update set
       platform_account_id = excluded.platform_account_id,
       solved_total = excluded.solved_total,
       solved_easy = excluded.solved_easy,
       solved_medium = excluded.solved_medium,
       solved_hard = excluded.solved_hard,
       rating = excluded.rating,
       max_rating = excluded.max_rating,
       rank_label = excluded.rank_label,
       contests = excluded.contests,
       badges = excluded.badges,
       reputation = excluded.reputation,
       followers = excluded.followers,
       public_repos = excluded.public_repos,
       contributions = excluded.contributions,
       streak_current = excluded.streak_current,
       streak_longest = excluded.streak_longest,
       raw = excluded.raw,
       fetched_at = now()`,
    [
      userId,
      platformAccountId,
      platform,
      stats.solvedTotal,
      stats.solvedEasy,
      stats.solvedMedium,
      stats.solvedHard,
      stats.rating,
      stats.maxRating,
      stats.rankLabel,
      stats.contests,
      stats.badges,
      stats.reputation,
      stats.followers,
      stats.publicRepos,
      stats.contributions,
      stats.streakCurrent,
      stats.streakLongest,
      stats.raw ? JSON.stringify(stats.raw) : null,
    ]
  );
}

export async function replaceDailyActivity(
  userId: string,
  platform: PlatformKey,
  days: { day: string; count: number; difficulty?: Record<string, number> }[]
): Promise<void> {
  if (days.length === 0) return;
  await withTransaction(async (client) => {
    for (const d of days) {
      await client.query(
        `insert into public.activity_daily (user_id, platform, day, count, difficulty)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id, platform, day) do update set
           count = excluded.count,
           difficulty = excluded.difficulty`,
        [userId, platform, d.day, d.count, JSON.stringify(d.difficulty ?? {})]
      );
    }
  });
}

/* ------------------------------------------------------------------ */
/* Aggregates — derived from real rows                                 */
/* ------------------------------------------------------------------ */

/**
 * Recompute the dashboard headline numbers from stored data.
 *
 * Sources: coding_stats (per-platform totals, streaks, GitHub contributions)
 * and activity_daily (the authoritative daily series). If a platform reports
 * nothing, the aggregate stays null rather than inventing a figure.
 */
export async function recomputeAggregates(userId: string): Promise<void> {
  const totals = await queryOne<{
    solved: number | null;
    longest: number | null;
    contributions: number | null;
  }>(
    `select
       sum(coalesce(solved_total, 0)) filter (where solved_total is not null) as solved,
       max(coalesce(streak_longest, 0)) filter (where streak_longest is not null) as longest,
       max(coalesce(contributions, 0)) filter (where contributions is not null) as contributions
     from public.coding_stats
     where user_id = $1`,
    [userId]
  );

  /** Current streak = consecutive days with activity, counting back from now. */
  const streakRow = await queryOne<{ current: number | null }>(
    `with days as (
       select day, sum(count) as total
         from public.activity_daily
        where user_id = $1
        group by day
     ), ordered as (
       select day, total, row_number() over (order by day desc) as rn
         from days
     )
     select count(*) as current
       from ordered
      where total > 0
        and day >= (current_date - (rn - 1) * interval '1 day')`,
    [userId]
  );

  const platformStreak = await queryOne<{ streak: number | null }>(
    `select max(coalesce(streak_current, 0)) as streak
       from public.coding_stats where user_id = $1 and streak_current is not null`,
    [userId]
  );

  const currentStreak = Math.max(
    streakRow?.current ?? 0,
    platformStreak?.streak ?? 0
  );

  await query(
    `update public.profiles
        set total_solved = $2,
            longest_streak = $3,
            current_streak = $4,
            github_contributions = $5,
            aggregates_updated_at = now()
      where user_id = $1`,
    [
      userId,
      totals?.solved ?? 0,
      totals?.longest ?? 0,
      currentStreak,
      totals?.contributions ?? 0,
    ]
  );

  await updateProfileCompletion(userId);
}

/**
 * Profile completion, computed from fields that actually exist.
 * Weighted evenly across the PRD's nine items.
 */
export async function computeProfileCompletion(
  userId: string
): Promise<{ percent: number; items: ProfileCompletionItem[] }> {
  const profile = await getProfile(userId);
  if (!profile) {
    return { percent: 0, items: [] };
  }

  const skillCount = await queryOne<{ n: string }>(
    `select count(*)::text as n from public.user_skills where user_id = $1`,
    [userId]
  );
  const platformCount = await queryOne<{ n: string }>(
    `select count(*)::text as n from public.platform_accounts
      where user_id = $1 and connection_status = 'connected'`,
    [userId]
  );
  const githubCount = await queryOne<{ n: string }>(
    `select count(*)::text as n from public.platform_accounts
      where user_id = $1 and platform = 'github' and connection_status = 'connected'`,
    [userId]
  );
  const projectCount = await queryOne<{ n: string }>(
    `select count(*)::text as n from public.projects where user_id = $1`,
    [userId]
  );

  const hasSocial = Boolean(
    profile.linkedin_url || profile.portfolio_url || profile.twitter_url || profile.website
  );

  const items: ProfileCompletionItem[] = [
    { label: "Profile photo", done: Boolean(profile.avatar_url) },
    { label: "Display name", done: Boolean(profile.display_name?.trim()) },
    { label: "Username", done: Boolean(profile.display_username) },
    { label: "Bio", done: Boolean(profile.bio?.trim()) },
    { label: "Skills", done: Number(skillCount?.n ?? 0) > 0 },
    {
      label: "At least one coding platform",
      done: Number(platformCount?.n ?? 0) > 0,
    },
    { label: "GitHub connected", done: Number(githubCount?.n ?? 0) > 0 },
    { label: "Social link", done: hasSocial },
    { label: "At least one project", done: Number(projectCount?.n ?? 0) > 0 },
  ];

  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  return { percent, items };
}

export async function updateProfileCompletion(userId: string): Promise<number> {
  const { percent } = await computeProfileCompletion(userId);
  await query(`update public.profiles set profile_completion = $2 where user_id = $1`, [
    userId,
    percent,
  ]);
  return percent;
}

/* ------------------------------------------------------------------ */
/* Difficulty + topics + activity                                      */
/* ------------------------------------------------------------------ */

export async function getDifficultyBreakdown(
  userId: string
): Promise<DifficultyBreakdown> {
  const rows = await query<{
    easy: number | null;
    medium: number | null;
    hard: number | null;
  }>(
    `select
       sum(coalesce(solved_easy, 0)) filter (where solved_easy is not null) as easy,
       sum(coalesce(solved_medium, 0)) filter (where solved_medium is not null) as medium,
       sum(coalesce(solved_hard, 0)) filter (where solved_hard is not null) as hard
     from public.coding_stats where user_id = $1`,
    [userId]
  );

  const easy = rows[0]?.easy ?? 0;
  const medium = rows[0]?.medium ?? 0;
  const hard = rows[0]?.hard ?? 0;
  const total = easy + medium + hard;

  // Never present a chart built from nothing — the UI shows an empty state.
  return { easy, medium, hard, total, available: total > 0 };
}

export async function getActivitySeries(
  userId: string,
  range: ActivityRange
): Promise<ActivityPoint[]> {
  const days = ACTIVITY_RANGES.find((r) => r.key === range)?.days ?? 30;
  const rows = await query<{ day: string; count: string }>(
    `select to_char(day, 'YYYY-MM-DD') as day, sum(count)::text as count
       from public.activity_daily
      where user_id = $1 and day >= (current_date - ($2::int - 1) * interval '1 day')
      group by day
      order by day`,
    [userId, days]
  );

  const byDay = new Map(rows.map((r) => [r.day, Number(r.count)]));

  // Densify so the chart shows a continuous axis of real (including zero) days.
  const out: ActivityPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    out.push({ day: key, count: byDay.get(key) ?? 0 });
  }
  return out;
}

export async function getTopicProgress(userId: string): Promise<TopicProgressRow[]> {
  const rows = await query<{ topic: string; solved: number; total: number }>(
    `select topic, solved, total from public.topic_progress where user_id = $1`,
    [userId]
  );
  return rows.map((r) => ({ topic: r.topic, solved: r.solved, total: r.total }));
}

/** Derive topic progress from the question tracker when no explicit rows exist. */
export async function deriveTopicProgressFromTracker(
  userId: string
): Promise<TopicProgressRow[]> {
  const rows = await query<{ topic: string; solved: string; total: string }>(
    `select q.topic,
            count(*) filter (where uq.status = 'solved')::text as solved,
            count(*)::text as total
       from public.user_questions uq
       join public.questions q on q.id = uq.question_id
      where uq.user_id = $1 and q.topic is not null
      group by q.topic`,
    [userId]
  );
  return rows.map((r) => ({
    topic: r.topic,
    solved: Number(r.solved),
    total: Number(r.total),
  }));
}

/* ------------------------------------------------------------------ */
/* Activity events, projects, achievements, notifications              */
/* ------------------------------------------------------------------ */

export async function getActivityEvents(
  userId: string,
  limit = 12
): Promise<ActivityEventRow[]> {
  const rows = await query<{
    id: string;
    kind: ActivityEventRow["kind"];
    title: string;
    detail: string | null;
    href: string | null;
    occurred_at: string;
  }>(
    `select id, kind, title, detail, href, occurred_at
       from public.activity_events
      where user_id = $1
      order by occurred_at desc
      limit $2`,
    [userId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    detail: r.detail,
    href: r.href,
    occurredAt: r.occurred_at,
  }));
}

export async function recordActivityEvent(input: {
  userId: string;
  kind: ActivityEventRow["kind"];
  title: string;
  detail?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}): Promise<void> {
  await query(
    `insert into public.activity_events (user_id, kind, title, detail, href, metadata, occurred_at)
     values ($1,$2,$3,$4,$5,$6, coalesce($7::timestamptz, now()))`,
    [
      input.userId,
      input.kind,
      input.title,
      input.detail ?? null,
      input.href ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.occurredAt ?? null,
    ]
  );
}

export async function getProjects(userId: string): Promise<ProjectRow[]> {
  const rows = await query<{
    id: string;
    name: string;
    description: string;
    tech_stack: string[];
    image_url: string | null;
    github_url: string | null;
    live_url: string | null;
    is_featured: boolean;
    source: "manual" | "github";
    created_at: string;
  }>(
    `select * from public.projects
      where user_id = $1
      order by is_featured desc, created_at desc`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    techStack: r.tech_stack ?? [],
    imageUrl: r.image_url,
    githubUrl: r.github_url,
    liveUrl: r.live_url,
    isFeatured: r.is_featured,
    source: r.source,
    createdAt: r.created_at,
  }));
}

export async function getAchievements(userId: string): Promise<AchievementRow[]> {
  const rows = await query<{
    code: string;
    title: string;
    description: string;
    icon: string;
    tier: string;
    unlocked_at: string;
  }>(
    `select a.code, a.title, a.description, a.icon, a.tier, ua.unlocked_at
       from public.user_achievements ua
       join public.achievements a on a.id = ua.achievement_id
      where ua.user_id = $1
      order by ua.unlocked_at desc`,
    [userId]
  );
  return rows.map((r) => ({
    code: r.code,
    title: r.title,
    description: r.description,
    icon: r.icon,
    tier: r.tier,
    unlockedAt: r.unlocked_at,
  }));
}

/**
 * Award every achievement whose threshold the user has genuinely met.
 *
 * Runs server-side after each sync against stored metrics only — there is no
 * code path that lets the frontend grant an achievement.
 */
export async function evaluateAchievements(userId: string): Promise<AchievementRow[]> {
  const metrics = await queryOne<{
    problems: number;
    streak: number;
    repos: number;
    platforms: number;
    projects: number;
  }>(
    `select
       coalesce((select total_solved from public.profiles where user_id = $1), 0) as problems,
       coalesce((select longest_streak from public.profiles where user_id = $1), 0) as streak,
       coalesce((select max(public_repos) from public.coding_stats
                  where user_id = $1 and platform = 'github'), 0) as repos,
       coalesce((select count(*) from public.platform_accounts
                  where user_id = $1 and connection_status = 'connected'), 0) as platforms,
       coalesce((select count(*) from public.projects where user_id = $1), 0) as projects`,
    [userId]
  );
  if (!metrics) return [];

  const catalogue = await query<{
    id: string;
    code: string;
    title: string;
    description: string;
    icon: string;
    tier: string;
    metric: string;
    threshold: number;
  }>(`select * from public.achievements`);

  const valueFor: Record<string, number> = {
    problems: metrics.problems,
    streak: metrics.streak,
    repos: metrics.repos,
    platforms: metrics.platforms,
    projects: metrics.projects,
  };

  const newlyUnlocked: AchievementRow[] = [];

  for (const award of catalogue) {
    const actual = valueFor[award.metric] ?? 0;
    if (actual < award.threshold) continue;

    const inserted = await query<{ unlocked_at: string }>(
      `insert into public.user_achievements (user_id, achievement_id)
       values ($1, $2)
       on conflict (user_id, achievement_id) do nothing
       returning unlocked_at`,
      [userId, award.id]
    );
    if (inserted.length === 0) continue; // already had it

    newlyUnlocked.push({
      code: award.code,
      title: award.title,
      description: award.description,
      icon: award.icon,
      tier: award.tier,
      unlockedAt: inserted[0].unlocked_at,
    });

    await recordActivityEvent({
      userId,
      kind: "achievement",
      title: `Unlocked “${award.title}”`,
      detail: award.description,
      href: "/dashboard/achievements",
    });
    await createNotification({
      userId,
      kind: "achievement",
      title: `Achievement unlocked: ${award.title}`,
      body: award.description,
      href: "/dashboard/achievements",
    });
  }

  return newlyUnlocked;
}

export async function getNotifications(
  userId: string,
  limit = 12
): Promise<NotificationRow[]> {
  const rows = await query<{
    id: string;
    kind: string;
    title: string;
    body: string;
    href: string | null;
    read_at: string | null;
    created_at: string;
  }>(
    `select * from public.notifications
      where user_id = $1
      order by created_at desc
      limit $2`,
    [userId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    href: r.href,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

export async function createNotification(input: {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  href?: string | null;
}): Promise<void> {
  await query(
    `insert into public.notifications (user_id, kind, title, body, href)
     values ($1,$2,$3,$4,$5)`,
    [input.userId, input.kind, input.title, input.body ?? "", input.href ?? null]
  );
}

export async function markNotificationsRead(
  userId: string,
  ids?: string[]
): Promise<void> {
  if (ids && ids.length > 0) {
    await query(
      `update public.notifications set read_at = now()
        where user_id = $1 and id = any($2::uuid[])`,
      [userId, ids]
    );
    return;
  }
  await query(
    `update public.notifications set read_at = now()
      where user_id = $1 and read_at is null`,
    [userId]
  );
}

/* ------------------------------------------------------------------ */
/* Sync jobs                                                           */
/* ------------------------------------------------------------------ */

export async function enqueueSyncJob(
  userId: string,
  platform: PlatformKey
): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into public.sync_jobs (user_id, platform, status)
     values ($1, $2, 'queued') returning id`,
    [userId, platform]
  );
  return rows[0].id;
}

export async function getSyncJobs(userId: string, limit = 20) {
  const rows = await query<{
    platform: PlatformKey;
    status: string;
    error: string | null;
    queued_at: string;
  }>(
    `select platform, status, error, queued_at
       from public.sync_jobs
      where user_id = $1
      order by queued_at desc
      limit $2`,
    [userId, limit]
  );
  return rows.map((r) => ({
    platform: r.platform,
    status: r.status,
    error: r.error,
    queuedAt: r.queued_at,
  }));
}

export async function claimNextSyncJob(userId: string) {
  return queryOne<{ id: string; platform: PlatformKey }>(
    `update public.sync_jobs
        set status = 'running', started_at = now(), attempt = attempt + 1
      where id = (
        select id from public.sync_jobs
         where user_id = $1 and status = 'queued'
         order by queued_at
         limit 1
         for update skip locked
      )
      returning id, platform`,
    [userId]
  );
}

export async function finishSyncJob(
  jobId: string,
  status: "succeeded" | "failed",
  error?: string | null,
  durationMs?: number
): Promise<void> {
  await query(
    `update public.sync_jobs
        set status = $2, error = $3, finished_at = now()
      where id = $1`,
    [jobId, status, error ?? null]
  );
  const row = await queryOne<{ user_id: string; platform: PlatformKey }>(
    `select user_id, platform from public.sync_jobs where id = $1`,
    [jobId]
  );
  if (row) {
    await query(
      `insert into public.sync_logs (user_id, platform, status, message, duration_ms)
       values ($1,$2,$3,$4,$5)`,
      [row.user_id, row.platform, status, error ?? null, durationMs ?? null]
    );
  }
}

/* ------------------------------------------------------------------ */
/* Question tracker                                                    */
/* ------------------------------------------------------------------ */

export type TrackerQuestionRow = {
  id: string;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard" | string;
  topic: string | null;
  url: string | null;
  status: "todo" | "solved" | "review";
  note: string | null;
  solvedAt: string | null;
  updatedAt: string | null;
};

/**
 * Questions in the shared catalogue, joined with the caller's own row.
 * A catalogue question the user has not touched defaults to `todo`.
 */
export async function getTrackerQuestions(
  userId: string,
  options: { search?: string; status?: string; limit?: number } = {}
): Promise<TrackerQuestionRow[]> {
  const search = options.search?.trim() ?? "";
  const status = options.status?.trim() ?? "";
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);

  const rows = await query<{
    id: string;
    slug: string;
    title: string;
    difficulty: string;
    topic: string | null;
    url: string | null;
    status: string | null;
    note: string | null;
    solved_at: string | null;
    updated_at: string | null;
  }>(
    `select q.id, q.slug, q.title, q.difficulty, q.topic, q.url,
            uq.status, uq.note, uq.solved_at, uq.updated_at
       from public.questions q
       left join public.user_questions uq
              on uq.question_id = q.id and uq.user_id = $1
      where ($2 = '' or q.title ilike '%' || $2 || '%' or coalesce(q.topic,'') ilike '%' || $2 || '%')
        and ($3 = '' or coalesce(uq.status, 'todo') = $3)
      order by coalesce(uq.updated_at, q.created_at) desc
      limit $4`,
    [userId, search, status, limit]
  );

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    difficulty: r.difficulty,
    topic: r.topic,
    url: r.url,
    status: (r.status as TrackerQuestionRow["status"]) ?? "todo",
    note: r.note,
    solvedAt: r.solved_at,
    updatedAt: r.updated_at,
  }));
}

/** Insert a question into the shared catalogue (idempotent on slug). */
export async function upsertQuestion(input: {
  slug: string;
  title: string;
  difficulty: string;
  topic?: string | null;
  url?: string | null;
}): Promise<string> {
  const created = await queryOne<{ id: string }>(
    `insert into public.questions (slug, title, difficulty, topic, url)
     values ($1,$2,$3,$4,$5)
     on conflict (slug) do update set title = excluded.title
     returning id`,
    [input.slug, input.title, input.difficulty, input.topic ?? null, input.url ?? null]
  );
  if (!created) throw new Error("Could not create that question.");
  return created.id;
}

/** Set the caller's status for a question. */
export async function setQuestionStatus(
  userId: string,
  questionId: string,
  status: "todo" | "solved" | "review",
  note?: string | null
): Promise<void> {
  await query(
    `insert into public.user_questions (user_id, question_id, status, note, solved_at, updated_at)
     values ($1,$2,$3,$4, case when $3 = 'solved' then now() else null end, now())
     on conflict (user_id, question_id) do update
       set status = excluded.status,
           note = coalesce(excluded.note, public.user_questions.note),
           solved_at = case
             when excluded.status = 'solved'
               then coalesce(public.user_questions.solved_at, now())
             else null
           end,
           updated_at = now()`,
    [userId, questionId, status, note ?? null]
  );
}

/* ------------------------------------------------------------------ */
/* Coding sheets                                                       */
/* ------------------------------------------------------------------ */

export type CodingSheetRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  total: number;
  solved: number;
};

/**
 * Sheets are grouped from the shared catalogue by topic, so their progress is
 * derived from the caller's own tracker rows rather than invented.
 */
export async function getCodingSheets(userId: string): Promise<CodingSheetRow[]> {
  const rows = await query<{ topic: string; total: string; solved: string }>(
    `select coalesce(q.topic, 'General') as topic,
            count(*)::text as total,
            count(*) filter (where uq.status = 'solved')::text as solved
       from public.questions q
       left join public.user_questions uq
              on uq.question_id = q.id and uq.user_id = $1
      group by coalesce(q.topic, 'General')
      order by count(*) desc`,
    [userId]
  );

  return rows.map((r) => ({
    id: r.topic,
    slug: r.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title: r.topic + " Sheet",
    description: "All " + r.topic.toLowerCase() + " questions tracked in Devora.",
    total: Number(r.total),
    solved: Number(r.solved),
  }));
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

export type LeaderboardRow = {
  rank: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  totalSolved: number;
  currentStreak: number;
  isCurrentUser: boolean;
};

/**
 * Public leaderboard, ranked by solved count.
 *
 * Only profiles that have completed onboarding and hold a username are listed,
 * and only fields users have left visible. The caller's own row is flagged so
 * the UI can highlight it.
 */
export async function getLeaderboard(
  userId: string,
  options: { search?: string; limit?: number } = {}
): Promise<LeaderboardRow[]> {
  const search = options.search?.trim() ?? "";
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  const rows = await query<{
    user_id: string;
    display_username: string | null;
    display_name: string;
    avatar_url: string | null;
    total_solved: number;
    current_streak: number;
  }>(
    `select p.user_id, p.display_username, p.display_name, p.avatar_url,
            p.total_solved, p.current_streak
       from public.profiles p
      where p.onboarding_completed = true
        and p.display_username is not null
        and ($2 = '' or p.display_username ilike '%' || $2 || '%'
                     or p.display_name ilike '%' || $2 || '%')
        and coalesce((p.visibility->>'platforms')::boolean, true) = true
      order by p.total_solved desc, p.current_streak desc, p.created_at asc
      limit $3`,
    [userId, search, limit]
  );

  return rows.map((r, i) => ({
    rank: i + 1,
    username: r.display_username ?? "",
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    totalSolved: Number(r.total_solved ?? 0),
    currentStreak: Number(r.current_streak ?? 0),
    isCurrentUser: r.user_id === userId,
  }));
}

/* ------------------------------------------------------------------ */
/* Profile links (the /profile/create page)                            */
/* ------------------------------------------------------------------ */

/**
 * Record a link the user typed on /profile/create.
 *
 * Crucially this writes `connection_status = 'linked'` — NOT 'connected'.
 * A URL proves nothing about whether the account exists, so it must never be
 * shown as a verified connection. Two guards make that safe:
 *
 *   1. If the row is already a real OAuth/public connection, we leave the
 *      status alone and only refresh the stored URL. Editing your profile must
 *      never silently downgrade a working connection.
 *   2. We write no statistics. `coding_stats` is untouched, so any platform
 *      that was not actually synced keeps rendering as "Not connected".
 */
export async function setPlatformLink(input: {
  userId: string;
  platform: PlatformKey;
  username: string;
  profileUrl: string;
  authType: "oauth" | "public";
}): Promise<void> {
  await query(
    `insert into public.platform_accounts
       (user_id, platform, username, profile_url, auth_type, connection_status, sync_status)
     values ($1, $2, $3, $4, $5, 'linked', 'idle')
     on conflict (user_id, platform) do update set
       username = excluded.username,
       profile_url = excluded.profile_url,
       -- keep a genuine connection; only ever mark a brand-new row as linked
       connection_status = case
         when public.platform_accounts.connection_status = 'connected' then 'connected'
         else 'linked'
       end,
       updated_at = now()`,
    [input.userId, input.platform, input.username, input.profileUrl, input.authType]
  );
}

/**
 * Remove a link the user cleared.
 *
 * Only deletes rows that are merely `linked`. A verified connection is left
 * intact — clearing a text field must not disconnect a real account.
 */
export async function clearPlatformLink(
  userId: string,
  platform: PlatformKey
): Promise<void> {
  await query(
    `delete from public.platform_accounts
      where user_id = $1 and platform = $2 and connection_status = 'linked'`,
    [userId, platform]
  );
}

/** Every platform row regardless of status, for the /profile/create draft. */
export async function getPlatformLinks(userId: string): Promise<
  { platform: PlatformKey; username: string; profileUrl: string | null; connectionStatus: string }[]
> {
  const rows = await query<{
    platform: PlatformKey;
    username: string;
    profile_url: string | null;
    connection_status: string;
  }>(
    `select platform, username, profile_url, connection_status
       from public.platform_accounts
      where user_id = $1
      order by connected_at`,
    [userId]
  );
  return rows.map((r) => ({
    platform: r.platform,
    username: r.username,
    profileUrl: r.profile_url,
    connectionStatus: r.connection_status,
  }));
}

/**
 * Mark the profile as complete.
 *
 * This is the ONLY place onboarding_completed is set to true, and it re-checks
 * the genuinely required fields in SQL so a malformed request cannot flip the
 * flag on its own. A profile is complete ONLY when it has:
 *
 *   - a display name
 *   - a claimed (unique) username
 *   - a college
 *   - at least one skill
 *
 * Photo and coding-platform connections are deliberately NOT required.
 */
export async function markProfileComplete(userId: string): Promise<boolean> {
  const row = await queryOne<{ onboarding_completed: boolean }>(
    `update public.profiles as p
        set onboarding_completed = true,
            onboarding_completed_at = coalesce(p.onboarding_completed_at, now()),
            onboarding_step = 5,
            updated_at = now()
      where p.user_id = $1
        and coalesce(p.display_name, '') <> ''
        and coalesce(p.display_username, '') <> ''
        and coalesce(p.college, '') <> ''
        and exists (
          select 1 from public.user_skills us where us.user_id = p.user_id
        )
      returning p.onboarding_completed`,
    [userId]
  );
  return row?.onboarding_completed === true;
}

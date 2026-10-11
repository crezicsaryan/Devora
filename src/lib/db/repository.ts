/**
 * Devora repository — every database read/write for the onboarding + dashboard
 * surface lives here so that route handlers stay thin and consistent.
 *
 * Data layer
 * ----------
 * This runs on MySQL through Prisma Client (src/lib/db/prisma.ts). It used to
 * be hand-written Postgres SQL over node-postgres, which could not speak to the
 * configured MySQL database at all — every request failed inside the pool
 * before reaching any logic. The public API of this module is unchanged: the
 * same 60 functions with the same signatures, so no caller had to change.
 *
 * Three things are still deliberately centralised:
 *   1. `stripServerFields` — onboarding_completed and the cached aggregates can
 *      never be echoed back into a client-writable payload.
 *   2. `recomputeAggregates` — dashboard numbers are derived from real rows
 *      (coding_stats / activity_daily / projects). Nothing is hardcoded.
 *   3. `evaluateAchievements` — awards come from stored metrics only.
 */

import "server-only";
import type { Profile as PrismaProfile } from "@prisma/client";
import { prisma, Prisma } from "@/lib/db/prisma";
import {
  DEFAULT_VISIBILITY,
  type AchievementRow,
  type AchievementSummary,
  type ActivityEventRow,
  type ActivityPoint,
  type ActivityRange,
  type ConnectedPlatform,
  type DailyActivity,
  type DevoraSocials,
  type DifficultyBreakdown,
  type GitHubLanguage,
  type GitHubOverview,
  type LockedAchievement,
  type MonthlyLeaderboardRow,
  type MonthlyProgress,
  type NotificationRow,
  type PersonalBests,
  type PlatformAccount,
  type PlatformComparisonRow,
  type PlatformKey,
  type PlatformStats,
  type ProfileCompletionItem,
  type ProjectRow,
  type StreakStats,
  type SyncStatus,
  type TopicProgressRow,
  type Visibility,
  type YearlyOverview,
} from "@/lib/types";
import { ACTIVITY_RANGES, PLATFORM_BY_KEY } from "@/lib/types";
import {
  aggregateMonths,
  computePersonalBests,
  computeStreaks,
  monthKeyOf,
  monthLabel,
  sumSeries,
} from "@/lib/dashboard-metrics";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
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
  /** Kept as a Date here: "first completed" is a moment, not a display string. */
  onboardingCompletedAt: Date | null;
  total_solved: number;
  current_streak: number;
  longest_streak: number;
  github_contributions: number;
};

/**
 * Prisma row -> the snake_case shape the rest of the app already reads.
 *
 * The column names match, so this is only about the two fields that differ:
 * `visibility` (Json, cast to the app's Visibility map) and
 * `onboarding_completed_at` (a Date, kept under its own camelCase key so
 * `markProfileComplete` can preserve the original completion moment).
 */
function toProfileRow(row: PrismaProfile): ProfileRow {
  return {
    ...row,
    visibility: (row.visibility ?? null) as Visibility | null,
    onboardingCompletedAt: row.onboarding_completed_at,
    created_at: row.created_at.toISOString(),
  };
}

/** Prisma reports unique-index conflicts as P2002. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/** JSON columns reject `undefined`; they want a real value or SQL NULL. */
function jsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

/** YYYY-MM-DD for a stored DATE column (Prisma returns midnight UTC). */
function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** DATE columns take a Date; midnight UTC keeps the calendar day stable. */
function dayValue(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number, from = new Date()): Date {
  const d = startOfDay(from);
  d.setDate(d.getDate() - days);
  return d;
}

/** Render a local-calendar YYYY-MM-DD (used to densify the activity series). */
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

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
  const existing = await prisma.profile.findUnique({ where: { user_id: userId } });
  if (existing) return toProfileRow(existing);

  try {
    const created = await prisma.profile.create({
      // display_name is capped at 120 characters by the column; a Google name
      // longer than that is trimmed rather than rejected.
      data: {
        user_id: userId,
        display_name: fallbackName.slice(0, 120),
        email: email ? email.slice(0, 320) : null,
        avatar_url: avatarUrl ? avatarUrl.slice(0, 512) : null,
      },
    });
    return toProfileRow(created);
  } catch (error) {
    // Two concurrent requests for a brand-new user race here; the loser simply
    // reads the row the winner created.
    if (isUniqueViolation(error)) {
      const again = await prisma.profile.findUnique({ where: { user_id: userId } });
      if (again) return toProfileRow(again);
    }
    throw error;
  }
}

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const row = await prisma.profile.findUnique({ where: { user_id: userId } });
  return row ? toProfileRow(row) : null;
}

/** Authoritative onboarding check. Always read from the database. */
export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const row = await prisma.profile.findUnique({
    where: { user_id: userId },
    select: { onboarding_completed: true },
  });
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
  const data: Record<string, unknown> = {};

  if (update.displayName !== undefined) data.display_name = update.displayName;
  if (update.username !== undefined) data.display_username = update.username;
  if (update.usernameNormalized !== undefined)
    data.username_normalized = update.usernameNormalized;
  if (update.bio !== undefined) data.bio = update.bio;
  if (update.developerRole !== undefined)
    data.developer_role = update.developerRole;
  if (update.college !== undefined) data.college = update.college;
  if (update.location !== undefined) data.location = update.location || null;
  if (update.avatarUrl !== undefined) data.avatar_url = update.avatarUrl;
  if (update.email !== undefined) data.email = update.email || null;

  if (update.socials) {
    const s = update.socials;
    if (s.linkedin !== undefined) data.linkedin_url = s.linkedin || null;
    // NOTE: GitHub is stored as a `platform_accounts` row, not on the profile —
    // there is no github_url column, and writing it to portfolio_url would
    // clobber the user's actual portfolio link.
    if (s.twitter !== undefined) data.twitter_url = s.twitter || null;
    if (s.portfolio !== undefined) data.portfolio_url = s.portfolio || null;
    if (s.website !== undefined && s.portfolio === undefined)
      data.website = s.website || null;
    if (s.email !== undefined) data.email = s.email || null;
  }

  if (update.visibility) {
    const current = await getProfile(userId);
    const merged = {
      ...(current?.visibility ?? DEFAULT_VISIBILITY),
      ...update.visibility,
    };
    data.visibility = merged;
  }

  if (Object.keys(data).length === 0) return;
  await prisma.profile.update({
    where: { user_id: userId },
    data: data as Prisma.ProfileUpdateInput,
  });
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

  const taken = await prisma.usernameRegistry.findUnique({
    where: { username_normalized: username },
    select: { user_id: true },
  });

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
 * The username_registry primary key is the lock: two users racing for the same
 * handle will have exactly one winner. The transaction rolls back the whole
 * claim on conflict, so the registry and profiles never disagree.
 */
export async function claimUsername(
  userId: string,
  username: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = username.toLowerCase();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.usernameRegistry.create({
        data: { username_normalized: normalized, username, user_id: userId },
      });
      await tx.profile.update({
        where: { user_id: userId },
        data: { display_username: username, username_normalized: normalized },
      });
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "Username already taken." };
    return { ok: false, error: "Could not save that username." };
  }
}

/** Release the previous handle when a user renames themselves. */
export async function releaseUsername(userId: string): Promise<void> {
  await prisma.usernameRegistry.deleteMany({ where: { user_id: userId } });
}

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

export async function getSkills(userId: string): Promise<string[]> {
  const rows = await prisma.userSkill.findMany({
    where: { user_id: userId },
    include: { skill: true },
    orderBy: [{ position: "asc" }, { skill: { name: "asc" } }],
  });
  return rows.map((r) => r.custom_name || r.skill.name);
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
    await prisma.userSkill.deleteMany({ where: { user_id: userId } });
    return;
  }

  const skillIds: string[] = [];
  for (const name of names) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    if (!slug) continue;

    // Upsert that KEEPS the existing catalogue name (the old SQL did
    // `do update set name = skills.name`, i.e. a no-op update).
    const existing = await prisma.skill.findUnique({ where: { slug } });
    if (existing) {
      skillIds.push(existing.id);
      continue;
    }
    try {
      const created = await prisma.skill.create({
        data: { slug, name, category: "custom" },
      });
      skillIds.push(created.id);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.skill.findUnique({ where: { slug } });
      if (raced) skillIds.push(raced.id);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.userSkill.deleteMany({ where: { user_id: userId } });
    if (skillIds.length > 0) {
      await tx.userSkill.createMany({
        data: skillIds.map((skillId, index) => ({
          user_id: userId,
          skill_id: skillId,
          position: index,
        })),
        skipDuplicates: true,
      });
    }
  });
}

export async function getSkillCatalogue(): Promise<
  { slug: string; name: string; category: string }[]
> {
  return prisma.skill.findMany({
    select: { slug: true, name: true, category: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
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

function toStats(row: Record<string, unknown> | undefined): PlatformStats | null {
  if (!row) return null;
  return {
    platform: row.platform as PlatformKey,
    solvedTotal: (row.solved_total ?? null) as number | null,
    solvedEasy: (row.solved_easy ?? null) as number | null,
    solvedMedium: (row.solved_medium ?? null) as number | null,
    solvedHard: (row.solved_hard ?? null) as number | null,
    rating: (row.rating ?? null) as number | null,
    maxRating: (row.max_rating ?? null) as number | null,
    rankLabel: (row.rank_label ?? null) as string | null,
    contests: (row.contests ?? null) as number | null,
    badges: (row.badges ?? null) as number | null,
    reputation: (row.reputation ?? null) as number | null,
    followers: (row.followers ?? null) as number | null,
    publicRepos: (row.public_repos ?? null) as number | null,
    contributions: (row.contributions ?? null) as number | null,
    streakCurrent: (row.streak_current ?? null) as number | null,
    streakLongest: (row.streak_longest ?? null) as number | null,
    fetchedAt: toIso(row.fetched_at),
  };
}

export async function getConnectedPlatforms(
  userId: string
): Promise<ConnectedPlatform[]> {
  const accounts = await prisma.platformAccount.findMany({
    where: { user_id: userId, connection_status: { not: "disconnected" } },
    orderBy: { connected_at: "asc" },
  });
  if (accounts.length === 0) return [];

  const stats = await prisma.codingStat.findMany({ where: { user_id: userId } });
  const byPlatform = new Map(stats.map((s) => [s.platform, s]));

  return accounts.map((row) => ({
    account: toAccount({
      ...row,
      last_synced_at: toIso(row.last_synced_at),
      connected_at: row.connected_at.toISOString(),
    } as unknown as PlatformAccountRow),
    stats: toStats(byPlatform.get(row.platform) as unknown as Record<string, unknown>),
    meta: PLATFORM_BY_KEY[row.platform as PlatformKey],
  }));
}

export async function getPlatformAccount(
  userId: string,
  platform: PlatformKey
): Promise<PlatformAccountRow | null> {
  const row = await prisma.platformAccount.findUnique({
    where: { user_id_platform: { user_id: userId, platform } },
  });
  if (!row) return null;
  return {
    ...row,
    last_synced_at: toIso(row.last_synced_at),
    connected_at: row.connected_at.toISOString(),
  } as unknown as PlatformAccountRow;
}

function normaliseConnectionStatus(value?: string): string {
  if (value === "linked" || value === "connected" || value === "disconnected") {
    return value;
  }
  return "connected";
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
  const where = { user_id_platform: { user_id: input.userId, platform: input.platform } };
  const existing = await prisma.platformAccount.findUnique({ where });

  // `coalesce(excluded.x, existing.x)` for the two identity fields we must not
  // lose, while the rest are overwritten outright — same as the old SQL.
  const shared = {
    username: input.username,
    external_user_id: input.externalUserId ?? existing?.external_user_id ?? null,
    profile_url: input.profileUrl ?? null,
    avatar_url: input.avatarUrl ?? existing?.avatar_url ?? null,
    auth_type: input.authType,
    connection_status: normaliseConnectionStatus(input.connectionStatus),
    sync_status: "idle",
    sync_error: null,
  };

  const row = await prisma.platformAccount.upsert({
    where,
    create: { user_id: input.userId, platform: input.platform, ...shared },
    update: shared,
  });
  return row.id;
}

export async function markAccountDisconnected(
  userId: string,
  platform: PlatformKey
): Promise<void> {
  await prisma.$transaction([
    prisma.platformOauthToken.deleteMany({ where: { user_id: userId, platform } }),
    prisma.codingStat.deleteMany({ where: { user_id: userId, platform } }),
    prisma.activityDaily.deleteMany({ where: { user_id: userId, platform } }),
    prisma.syncJob.deleteMany({
      where: { user_id: userId, platform, status: { in: ["queued", "running"] } },
    }),
    prisma.platformAccount.deleteMany({ where: { user_id: userId, platform } }),
  ]);
  await recomputeAggregates(userId);
}

export async function setSyncState(
  userId: string,
  platform: PlatformKey,
  status: SyncStatus,
  error?: string | null
): Promise<void> {
  await prisma.platformAccount.updateMany({
    where: { user_id: userId, platform },
    data: {
      sync_status: status,
      sync_error: error ?? null,
      // Only a successful sync moves the "last synced" clock.
      ...(status === "ok" ? { last_synced_at: new Date() } : {}),
    },
  });
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
  const shared = {
    platform_account_id: platformAccountId,
    solved_total: stats.solvedTotal,
    solved_easy: stats.solvedEasy,
    solved_medium: stats.solvedMedium,
    solved_hard: stats.solvedHard,
    rating: stats.rating,
    max_rating: stats.maxRating,
    rank_label: stats.rankLabel,
    contests: stats.contests,
    badges: stats.badges,
    reputation: stats.reputation,
    followers: stats.followers,
    public_repos: stats.publicRepos,
    contributions: stats.contributions,
    streak_current: stats.streakCurrent,
    streak_longest: stats.streakLongest,
    raw: jsonInput(stats.raw ?? null),
    fetched_at: new Date(),
  };

  await prisma.codingStat.upsert({
    where: { user_id_platform: { user_id: userId, platform } },
    create: { user_id: userId, platform, ...shared },
    update: shared,
  });
}

export async function replaceDailyActivity(
  userId: string,
  platform: PlatformKey,
  days: { day: string; count: number; difficulty?: Record<string, number> }[]
): Promise<void> {
  if (days.length === 0) return;
  await prisma.$transaction(
    days.map((d) =>
      prisma.activityDaily.upsert({
        where: {
          user_id_platform_day: {
            user_id: userId,
            platform,
            day: dayValue(d.day),
          },
        },
        create: {
          user_id: userId,
          platform,
          day: dayValue(d.day),
          count: d.count,
          difficulty: jsonInput(d.difficulty ?? {}),
        },
        update: {
          count: d.count,
          difficulty: jsonInput(d.difficulty ?? {}),
        },
      })
    )
  );
}

/* ------------------------------------------------------------------ */
/* Aggregates — derived from real rows                                 */
/* ------------------------------------------------------------------ */

/**
 * Recompute the dashboard headline numbers from stored data.
 *
 * Sources: coding_stats (per-platform totals, streaks, GitHub contributions)
 * and activity_daily (the authoritative daily series). If a platform reports
 * nothing, the aggregate stays 0 rather than inventing a figure.
 */
export async function recomputeAggregates(userId: string): Promise<void> {
  const stats = await prisma.codingStat.findMany({
    where: { user_id: userId },
    select: {
      solved_total: true,
      streak_longest: true,
      streak_current: true,
      contributions: true,
    },
  });

  // `sum(...) filter (where x is not null)` — SUM already ignores NULLs, and
  // MAX ignores them too, so a plain reduce is the same rule.
  const solvedTotals = stats
    .map((s) => s.solved_total)
    .filter((v): v is number => v !== null);
  const longestStreaks = stats
    .map((s) => s.streak_longest)
    .filter((v): v is number => v !== null);
  const contributionValues = stats
    .map((s) => s.contributions)
    .filter((v): v is number => v !== null);

  const solved = solvedTotals.reduce((a, b) => a + b, 0);
  const longest = longestStreaks.length > 0 ? Math.max(...longestStreaks) : 0;
  const contributions =
    contributionValues.length > 0 ? Math.max(...contributionValues) : 0;

  /**
   * Current streak = consecutive days of activity ending today.
   *
   * The old Postgres version counted activity days against a day number that
   * advanced over *every* stored day, so a gap silently failed to reset the
   * run. This counts an actual unbroken run, which is what the dashboard's own
   * streak maths (computeStreaks) reports — the two can no longer disagree.
   */
  const dailyRows = await prisma.activityDaily.groupBy({
    by: ["day"],
    where: { user_id: userId },
    _sum: { count: true },
  });
  const activeDays = new Set(
    dailyRows
      .filter((r) => (r._sum.count ?? 0) > 0)
      .map((r) => dayKey(r.day))
  );

  let consecutive = 0;
  const cursor = startOfDay(new Date());
  while (activeDays.has(localDayKey(cursor)) && consecutive < 4000) {
    consecutive += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const platformStreaks = stats
    .map((s) => s.streak_current)
    .filter((v): v is number => v !== null);
  const currentStreak = Math.max(
    consecutive,
    platformStreaks.length > 0 ? Math.max(...platformStreaks) : 0
  );

  await prisma.profile.update({
    where: { user_id: userId },
    data: {
      total_solved: solved,
      longest_streak: longest,
      current_streak: currentStreak,
      github_contributions: contributions,
      aggregates_updated_at: new Date(),
    },
  });

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

  const [skillCount, platformCount, githubCount, projectCount] = await Promise.all([
    prisma.userSkill.count({ where: { user_id: userId } }),
    prisma.platformAccount.count({
      where: { user_id: userId, connection_status: "connected" },
    }),
    prisma.platformAccount.count({
      where: { user_id: userId, platform: "github", connection_status: "connected" },
    }),
    prisma.project.count({ where: { user_id: userId } }),
  ]);

  const hasSocial = Boolean(
    profile.linkedin_url || profile.portfolio_url || profile.twitter_url || profile.website
  );

  const items: ProfileCompletionItem[] = [
    { label: "Profile photo", done: Boolean(profile.avatar_url) },
    { label: "Display name", done: Boolean(profile.display_name?.trim()) },
    { label: "Username", done: Boolean(profile.display_username) },
    { label: "Bio", done: Boolean(profile.bio?.trim()) },
    { label: "Skills", done: skillCount > 0 },
    { label: "At least one coding platform", done: platformCount > 0 },
    { label: "GitHub connected", done: githubCount > 0 },
    { label: "Social link", done: hasSocial },
    { label: "At least one project", done: projectCount > 0 },
  ];

  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  return { percent, items };
}

export async function updateProfileCompletion(userId: string): Promise<number> {
  const { percent } = await computeProfileCompletion(userId);
  await prisma.profile.update({
    where: { user_id: userId },
    data: { profile_completion: percent },
  });
  return percent;
}

/* ------------------------------------------------------------------ */
/* Difficulty + topics + activity                                      */
/* ------------------------------------------------------------------ */

export async function getDifficultyBreakdown(
  userId: string
): Promise<DifficultyBreakdown> {
  const rows = await prisma.codingStat.findMany({
    where: { user_id: userId },
    select: { solved_easy: true, solved_medium: true, solved_hard: true },
  });

  const sum = (pick: (r: (typeof rows)[number]) => number | null) =>
    rows.reduce((total, row) => total + (pick(row) ?? 0), 0);

  const easy = sum((r) => r.solved_easy);
  const medium = sum((r) => r.solved_medium);
  const hard = sum((r) => r.solved_hard);
  const total = easy + medium + hard;

  // Never present a chart built from nothing — the UI shows an empty state.
  return { easy, medium, hard, total, available: total > 0 };
}

export async function getActivitySeries(
  userId: string,
  range: ActivityRange
): Promise<ActivityPoint[]> {
  const days = ACTIVITY_RANGES.find((r) => r.key === range)?.days ?? 30;
  const from = daysAgo(days - 1);

  const rows = await prisma.activityDaily.findMany({
    where: { user_id: userId, day: { gte: from } },
    select: { day: true, count: true },
  });

  const byDay = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(row.day);
    byDay.set(key, (byDay.get(key) ?? 0) + row.count);
  }

  // Densify so the chart shows a continuous axis of real (including zero) days.
  const out: ActivityPoint[] = [];
  const today = startOfDay(new Date());
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const key = localDayKey(d);
    out.push({ day: key, count: byDay.get(key) ?? 0 });
  }
  return out;
}

export async function getTopicProgress(userId: string): Promise<TopicProgressRow[]> {
  const rows = await prisma.topicProgress.findMany({
    where: { user_id: userId },
    select: { topic: true, solved: true, total: true },
  });
  return rows.map((r) => ({ topic: r.topic, solved: r.solved, total: r.total }));
}

/** Derive topic progress from the question tracker when no explicit rows exist. */
export async function deriveTopicProgressFromTracker(
  userId: string
): Promise<TopicProgressRow[]> {
  const rows = await prisma.userQuestion.findMany({
    where: { user_id: userId, question: { topic: { not: null } } },
    include: { question: { select: { topic: true } } },
  });

  const byTopic = new Map<string, { solved: number; total: number }>();
  for (const row of rows) {
    const topic = row.question.topic;
    if (!topic) continue;
    const entry = byTopic.get(topic) ?? { solved: 0, total: 0 };
    entry.total += 1;
    if (row.status === "solved") entry.solved += 1;
    byTopic.set(topic, entry);
  }

  return [...byTopic.entries()].map(([topic, counts]) => ({ topic, ...counts }));
}

/* ------------------------------------------------------------------ */
/* Activity events, projects, achievements, notifications              */
/* ------------------------------------------------------------------ */

export async function getActivityEvents(
  userId: string,
  limit = 12
): Promise<ActivityEventRow[]> {
  const rows = await prisma.activityEvent.findMany({
    where: { user_id: userId },
    orderBy: { occurred_at: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as ActivityEventRow["kind"],
    title: r.title,
    detail: r.detail,
    href: r.href,
    occurredAt: r.occurred_at.toISOString(),
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
  await prisma.activityEvent.create({
    data: {
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? null,
      href: input.href ?? null,
      metadata: jsonInput(input.metadata ?? {}),
      occurred_at: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    },
  });
}

export async function getProjects(userId: string): Promise<ProjectRow[]> {
  const rows = await prisma.project.findMany({
    where: { user_id: userId },
    orderBy: [{ is_featured: "desc" }, { created_at: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    techStack: asStringArray(r.tech_stack),
    imageUrl: r.image_url,
    githubUrl: r.github_url,
    liveUrl: r.live_url,
    isFeatured: r.is_featured,
    source: r.source as ProjectRow["source"],
    createdAt: r.created_at.toISOString(),
  }));
}

export async function getAchievements(userId: string): Promise<AchievementRow[]> {
  const rows = await prisma.userAchievement.findMany({
    where: { user_id: userId },
    include: { achievement: true },
    orderBy: { unlocked_at: "desc" },
  });
  return rows.map((r) => ({
    code: r.achievement.code,
    title: r.achievement.title,
    description: r.achievement.description,
    icon: r.achievement.icon,
    tier: r.achievement.tier,
    unlockedAt: r.unlocked_at.toISOString(),
  }));
}

/**
 * Award every achievement whose threshold the user has genuinely met.
 *
 * Runs server-side after each sync against stored metrics only — there is no
 * code path that lets the frontend grant an achievement.
 */
export async function evaluateAchievements(userId: string): Promise<AchievementRow[]> {
  const metrics = await getAchievementMetrics(userId);
  const catalogue = await prisma.achievement.findMany();

  const valueFor: Record<string, number> = {
    problems: metrics.problems,
    streak: metrics.streak,
    repos: metrics.repos,
    platforms: metrics.platforms,
    projects: metrics.projects,
    active_days: metrics.activeDays,
    github: metrics.githubConnected ? 1 : 0,
  };

  const newlyUnlocked: AchievementRow[] = [];

  for (const award of catalogue) {
    const actual = valueFor[award.metric] ?? 0;
    if (actual < award.threshold) continue;

    let unlockedAt: Date;
    try {
      const inserted = await prisma.userAchievement.create({
        data: { user_id: userId, achievement_id: award.id },
      });
      unlockedAt = inserted.unlocked_at;
    } catch (error) {
      // Already unlocked — `on conflict do nothing`.
      if (isUniqueViolation(error)) continue;
      throw error;
    }

    newlyUnlocked.push({
      code: award.code,
      title: award.title,
      description: award.description,
      icon: award.icon,
      tier: award.tier,
      unlockedAt: unlockedAt.toISOString(),
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
  const rows = await prisma.notification.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    href: r.href,
    readAt: toIso(r.read_at),
    createdAt: r.created_at.toISOString(),
  }));
}

export async function createNotification(input: {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  href?: string | null;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? "",
      href: input.href ?? null,
    },
  });
}

export async function markNotificationsRead(
  userId: string,
  ids?: string[]
): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      user_id: userId,
      read_at: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { read_at: new Date() },
  });
}

/* ------------------------------------------------------------------ */
/* Sync jobs                                                           */
/* ------------------------------------------------------------------ */

export async function enqueueSyncJob(
  userId: string,
  platform: PlatformKey
): Promise<string> {
  const row = await prisma.syncJob.create({
    data: { user_id: userId, platform, status: "queued" },
    select: { id: true },
  });
  return row.id;
}

export async function getSyncJobs(userId: string, limit = 20) {
  const rows = await prisma.syncJob.findMany({
    where: { user_id: userId },
    orderBy: { queued_at: "desc" },
    take: limit,
    select: { platform: true, status: true, error: true, queued_at: true },
  });
  return rows.map((r) => ({
    platform: r.platform as PlatformKey,
    status: r.status,
    error: r.error,
    queuedAt: r.queued_at.toISOString(),
  }));
}

/**
 * Claim the oldest queued job.
 *
 * The guarded `updateMany` (status must still be 'queued') is the claim: two
 * workers racing for the same row cannot both win, which is what Postgres'
 * `for update skip locked` provided.
 */
export async function claimNextSyncJob(userId: string) {
  const next = await prisma.syncJob.findFirst({
    where: { user_id: userId, status: "queued" },
    orderBy: { queued_at: "asc" },
    select: { id: true, platform: true },
  });
  if (!next) return null;

  const claimed = await prisma.syncJob.updateMany({
    where: { id: next.id, status: "queued" },
    data: {
      status: "running",
      started_at: new Date(),
      attempt: { increment: 1 },
    },
  });
  if (claimed.count === 0) return null;

  return { id: next.id, platform: next.platform as PlatformKey };
}

export async function finishSyncJob(
  jobId: string,
  status: "succeeded" | "failed",
  error?: string | null,
  durationMs?: number
): Promise<void> {
  const row = await prisma.syncJob.update({
    where: { id: jobId },
    data: { status, error: error ?? null, finished_at: new Date() },
    select: { user_id: true, platform: true },
  });
  await prisma.syncLog.create({
    data: {
      user_id: row.user_id,
      platform: row.platform,
      status,
      message: error ?? null,
      duration_ms: durationMs ?? null,
    },
  });
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

  const rows = await prisma.question.findMany({
    where: search
      ? {
          OR: [
            { title: { contains: search } },
            { topic: { contains: search } },
          ],
        }
      : undefined,
    include: {
      user_questions: { where: { user_id: userId }, take: 1 },
    },
  });

  return rows
    .map((row) => {
      const mine = row.user_questions[0];
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        difficulty: row.difficulty,
        topic: row.topic,
        url: row.url,
        status: (mine?.status as TrackerQuestionRow["status"]) ?? "todo",
        note: mine?.note ?? null,
        solvedAt: toIso(mine?.solved_at),
        updatedAt: toIso(mine?.updated_at),
        // Ordering key: the old SQL ordered by coalesce(uq.updated_at, q.created_at).
        _sortKey: (mine?.updated_at ?? row.created_at).getTime(),
      };
    })
    .filter((row) => (status ? row.status === status : true))
    .sort((a, b) => b._sortKey - a._sortKey)
    .slice(0, limit)
    .map(({ _sortKey: _ignored, ...row }) => row);
}

/** Insert a question into the shared catalogue (idempotent on slug). */
export async function upsertQuestion(input: {
  slug: string;
  title: string;
  difficulty: string;
  topic?: string | null;
  url?: string | null;
}): Promise<string> {
  const row = await prisma.question.upsert({
    where: { slug: input.slug },
    create: {
      slug: input.slug,
      title: input.title,
      difficulty: input.difficulty,
      topic: input.topic ?? null,
      url: input.url ?? null,
    },
    update: { title: input.title },
    select: { id: true },
  });
  return row.id;
}

/** Set the caller's status for a question. */
export async function setQuestionStatus(
  userId: string,
  questionId: string,
  status: "todo" | "solved" | "review",
  note?: string | null
): Promise<void> {
  const existing = await prisma.userQuestion.findUnique({
    where: { user_id_question_id: { user_id: userId, question_id: questionId } },
  });

  // Solved date is set the first time the question is marked solved and
  // cleared again if the user moves it out of solved — same rule as before.
  const solvedAt =
    status === "solved" ? (existing?.solved_at ?? new Date()) : null;
  // `coalesce(excluded.note, existing.note)` — a blank note never erases one.
  const resolvedNote = note ?? existing?.note ?? null;

  await prisma.userQuestion.upsert({
    where: { user_id_question_id: { user_id: userId, question_id: questionId } },
    create: {
      user_id: userId,
      question_id: questionId,
      status,
      note: resolvedNote,
      solved_at: solvedAt,
    },
    update: { status, note: resolvedNote, solved_at: solvedAt },
  });
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

  const rows = await prisma.profile.findMany({
    where: {
      onboarding_completed: true,
      display_username: { not: null },
      ...(search
        ? {
            OR: [
              { display_username: { contains: search } },
              { display_name: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: [
      { total_solved: "desc" },
      { current_streak: "desc" },
      { created_at: "asc" },
    ],
    take: limit,
  });

  return rows
    .filter((row) => {
      const visibility = row.visibility as Visibility | null;
      return (visibility?.platforms ?? DEFAULT_VISIBILITY.platforms) === true;
    })
    .slice(0, limit)
    .map((r, i) => ({
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
  const where = { user_id_platform: { user_id: input.userId, platform: input.platform } };
  const existing = await prisma.platformAccount.findUnique({
    where,
    select: { connection_status: true },
  });

  const status = existing?.connection_status === "connected" ? "connected" : "linked";

  await prisma.platformAccount.upsert({
    where,
    create: {
      user_id: input.userId,
      platform: input.platform,
      username: input.username,
      profile_url: input.profileUrl,
      auth_type: input.authType,
      connection_status: "linked",
      sync_status: "idle",
    },
    update: {
      username: input.username,
      profile_url: input.profileUrl,
      connection_status: status,
    },
  });
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
  await prisma.platformAccount.deleteMany({
    where: { user_id: userId, platform, connection_status: "linked" },
  });
}

/** Every platform row regardless of status, for the /profile/create draft. */
export async function getPlatformLinks(userId: string): Promise<
  { platform: PlatformKey; username: string; profileUrl: string | null; connectionStatus: string }[]
> {
  const rows = await prisma.platformAccount.findMany({
    where: { user_id: userId },
    orderBy: { connected_at: "asc" },
    select: { platform: true, username: true, profile_url: true, connection_status: true },
  });
  return rows.map((r) => ({
    platform: r.platform as PlatformKey,
    username: r.username,
    profileUrl: r.profile_url,
    connectionStatus: r.connection_status,
  }));
}

/**
 * Mark the profile as complete.
 *
 * This is the ONLY place onboarding_completed is set to true, and it re-checks
 * the genuinely required fields before flipping the flag so a malformed request
 * cannot complete onboarding on its own. A profile is complete ONLY when it has:
 *
 *   - a display name
 *   - a claimed (unique) username
 *   - a college
 *   - at least one skill
 *
 * Photo and coding-platform connections are deliberately NOT required.
 */
export async function markProfileComplete(userId: string): Promise<boolean> {
  const profile = await getProfile(userId);
  if (!profile) return false;

  if (
    !profile.display_name?.trim() ||
    !profile.display_username?.trim() ||
    !profile.college?.trim()
  ) {
    return false;
  }

  const skills = await prisma.userSkill.count({ where: { user_id: userId } });
  if (skills === 0) return false;

  const updated = await prisma.profile.update({
    where: { user_id: userId },
    data: {
      onboarding_completed: true,
      // `coalesce(onboarding_completed_at, now())`: the first completion time is
      // kept, so re-running onboarding never moves "member since".
      onboarding_completed_at: profile.onboardingCompletedAt ?? new Date(),
      onboarding_step: 5,
    },
    select: { onboarding_completed: true },
  });
  return updated.onboarding_completed === true;
}

/* ==================================================================== */
/* Dashboard analytics                                                  */
/*                                                                      */
/* Every number here is derived from stored rows. The daily series is    */
/* the single source of truth, so streaks, heatmap, monthly and yearly   */
/* figures can never disagree with one another.                          */
/* ==================================================================== */

/**
 * How far back the daily series reaches. This is a payload bound, not a
 * business rule: it keeps one dashboard response small while still covering
 * multi-year histories.
 */
const DAILY_HISTORY_DAYS = 800;

/** The difficulty split an adapter recorded for one day. */
function difficultyTotal(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  const split = value as Record<string, unknown>;
  const pick = (key: string) => {
    const raw = split[key];
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : 0;
  };
  return pick("easy") + pick("medium") + pick("hard");
}

/**
 * The authoritative daily activity series, aggregated across all platforms.
 *
 * `activities` is the count the heatmap is shaded from; `problems` is the sum
 * of the difficulty split the adapters recorded, so the problems graph reports
 * solved problems rather than submissions. `byPlatform` preserves the split so
 * platform-specific figures stay separate from the totals.
 */
export async function getDailyActivity(userId: string): Promise<DailyActivity[]> {
  const rows = await prisma.activityDaily.findMany({
    where: {
      user_id: userId,
      count: { gt: 0 },
      day: { gte: daysAgo(DAILY_HISTORY_DAYS) },
    },
    select: { day: true, platform: true, count: true, difficulty: true },
  });

  const byDay = new Map<string, DailyActivity>();
  for (const row of rows) {
    const key = dayKey(row.day);
    const entry =
      byDay.get(key) ??
      ({ day: key, activities: 0, problems: 0, byPlatform: {} } as DailyActivity);
    const activities = Number(row.count ?? 0);
    entry.activities += activities;
    entry.problems += difficultyTotal(row.difficulty);
    const platform = row.platform as PlatformKey;
    entry.byPlatform[platform] = (entry.byPlatform[platform] ?? 0) + activities;
    byDay.set(key, entry);
  }

  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/* ------------------------------ streak block ----------------------------- */

export function buildStreakStats(daily: DailyActivity[], today = new Date()): StreakStats {
  const { current, longest } = computeStreaks(daily, today);
  const totals = sumSeries(daily);
  const yearPrefix = String(today.getFullYear());

  return {
    current,
    longest,
    activeDays: daily.filter((d) => d.activities > 0).length,
    activeDaysThisYear: daily.filter(
      (d) => d.activities > 0 && d.day.startsWith(yearPrefix)
    ).length,
    totalActivities: totals.activities,
    totalProblems: totals.problems,
    isEmpty: totals.activities === 0,
  };
}

/* ---------------------------- platform section --------------------------- */

/** Per-platform solved totals. Only platforms that really report a count. */
export async function getPlatformComparison(
  userId: string
): Promise<PlatformComparisonRow[]> {
  const rows = await prisma.codingStat.findMany({
    where: { user_id: userId, solved_total: { gt: 0 } },
    orderBy: [{ solved_total: "desc" }, { platform: "asc" }],
    select: { platform: true, solved_total: true },
  });

  return rows.map((row) => ({
    platform: row.platform as PlatformKey,
    label: PLATFORM_BY_KEY[row.platform as PlatformKey]?.label ?? row.platform,
    solved: Number(row.solved_total ?? 0),
  }));
}

/* ------------------------------ github block ----------------------------- */

/**
 * GitHub summary built strictly from what the adapter actually stored.
 *
 * Commits / pull requests / issues are left null because the adapter has no
 * honest source for them — the UI renders "—" instead of a guess.
 */
export async function getGitHubOverview(userId: string): Promise<GitHubOverview | null> {
  const row = await prisma.platformAccount.findFirst({
    where: {
      user_id: userId,
      platform: "github",
      connection_status: { not: "disconnected" },
    },
    include: { coding_stats: { take: 1 } },
  });
  if (!row) return null;

  const stats = row.coding_stats[0];
  const raw =
    typeof stats?.raw === "object" && stats.raw !== null
      ? (stats.raw as Record<string, unknown>)
      : {};
  const languages: GitHubLanguage[] = Array.isArray(raw.languages)
    ? (raw.languages as GitHubLanguage[]).filter(
        (l) => l && typeof l.name === "string" && typeof l.count === "number"
      )
    : [];

  return {
    username: row.username,
    profileUrl: row.profile_url,
    repositories: stats?.public_repos ?? null,
    followers: stats?.followers ?? null,
    following: typeof raw.following === "number" ? raw.following : null,
    contributions: stats?.contributions ?? null,
    commits: null,
    pullRequests: null,
    issues: null,
    stars: typeof raw.stars === "number" ? raw.stars : null,
    languages,
    lastSyncedAt: toIso(row.last_synced_at),
    syncStatus: row.sync_status as SyncStatus,
  };
}

/* --------------------------- monthly + yearly ---------------------------- */

export function buildMonthlyProgress(
  daily: DailyActivity[],
  today = new Date()
): MonthlyProgress {
  const months = aggregateMonths(daily);
  const currentKey = monthKeyOf(today);
  const previousDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousKey = monthKeyOf(previousDate);

  const current = months.find((m) => m.monthKey === currentKey) ?? null;
  const previous = months.find((m) => m.monthKey === previousKey) ?? null;
  const { current: currentStreak } = computeStreaks(daily, today);

  // Only compare when the previous month genuinely has problems to compare to.
  const problemsChangePercent =
    previous && previous.problems > 0
      ? Math.round((((current?.problems ?? 0) - previous.problems) / previous.problems) * 100)
      : null;

  return {
    label: `${monthLabel(currentKey)} ${currentKey.slice(0, 4)}`,
    monthKey: currentKey,
    problemsSolved: current?.problems ?? 0,
    activeDays: current?.activeDays ?? 0,
    activities: current?.activities ?? 0,
    currentStreak,
    previous: previous
      ? {
          label: previous.label,
          problemsSolved: previous.problems,
          activeDays: previous.activeDays,
          activities: previous.activities,
        }
      : null,
    problemsChangePercent,
    hasData: Boolean(current) || daily.length > 0,
  };
}

type MonthAggregateLike = { label: string; activities: number };

export function buildYearlyOverview(
  daily: DailyActivity[],
  topics: TopicProgressRow[],
  comparison: PlatformComparisonRow[],
  today = new Date()
): YearlyOverview {
  const year = today.getFullYear();
  const prefix = String(year);
  const yearDaily = daily.filter((d) => d.day.startsWith(prefix));
  const totals = sumSeries(yearDaily);
  const { longest } = computeStreaks(yearDaily, today);

  const months = aggregateMonths(yearDaily);
  const busiest = months.reduce<MonthAggregateLike | null>(
    (best, m) => (!best || m.activities > best.activities ? m : best),
    null
  );

  const mostSolved = topics
    .filter((t) => t.solved > 0)
    .reduce<TopicProgressRow | null>((best, t) => (!best || t.solved > best.solved ? t : best), null);

  const topPlatform = comparison[0] ?? null;

  return {
    year,
    problemsSolved: totals.problems,
    activeDays: yearDaily.filter((d) => d.activities > 0).length,
    longestStreak: longest,
    activities: totals.activities,
    mostActiveMonth: busiest
      ? { label: busiest.label, activities: busiest.activities }
      : null,
    mostSolvedTopic: mostSolved ? { topic: mostSolved.topic, solved: mostSolved.solved } : null,
    mostUsedPlatform: topPlatform
      ? {
          platform: topPlatform.platform,
          label: topPlatform.label,
          solved: topPlatform.solved,
        }
      : null,
    hasData: yearDaily.length > 0,
  };
}

/* ------------------------------ achievements ----------------------------- */

/**
 * The metric values every achievement threshold is checked against.
 * Computed from stored rows only — there is no client write path to these.
 */
export async function getAchievementMetrics(
  userId: string,
  daily?: DailyActivity[]
): Promise<{
  problems: number;
  streak: number;
  repos: number;
  platforms: number;
  projects: number;
  activeDays: number;
  githubConnected: boolean;
}> {
  const [profile, repoRows, platforms, projects, activeDayRows, githubRows] =
    await Promise.all([
      prisma.profile.findUnique({
        where: { user_id: userId },
        select: { total_solved: true, longest_streak: true },
      }),
      prisma.codingStat.findMany({
        where: { user_id: userId, platform: "github" },
        select: { public_repos: true },
      }),
      prisma.platformAccount.count({
        where: { user_id: userId, connection_status: "connected" },
      }),
      prisma.project.count({ where: { user_id: userId } }),
      prisma.activityDaily.groupBy({
        by: ["day"],
        where: { user_id: userId, count: { gt: 0 } },
      }),
      prisma.platformAccount.count({
        where: { user_id: userId, platform: "github", connection_status: "connected" },
      }),
    ]);

  const repos = repoRows
    .map((r) => r.public_repos)
    .filter((v): v is number => v !== null);

  const computedStreak = daily ? computeStreaks(daily).longest : 0;

  return {
    problems: Number(profile?.total_solved ?? 0),
    // Prefer the streak we can prove from daily activity; fall back to the
    // platform-reported figure when there is no daily history yet.
    streak: Math.max(Number(profile?.longest_streak ?? 0), computedStreak),
    repos: repos.length > 0 ? Math.max(...repos) : 0,
    platforms,
    projects,
    activeDays: activeDayRows.length,
    githubConnected: githubRows > 0,
  };
}

/**
 * Unlocked achievements plus the locked ones with real progress, so the UI can
 * show "43 / 100" without inventing anything.
 */
export async function getAchievementsSummary(
  userId: string,
  daily?: DailyActivity[]
): Promise<AchievementSummary> {
  const [unlocked, catalogue, metrics] = await Promise.all([
    getAchievements(userId),
    prisma.achievement.findMany({ orderBy: [{ threshold: "asc" }, { code: "asc" }] }),
    getAchievementMetrics(userId, daily),
  ]);

  const valueFor: Record<string, number> = {
    problems: metrics.problems,
    streak: metrics.streak,
    repos: metrics.repos,
    platforms: metrics.platforms,
    projects: metrics.projects,
    active_days: metrics.activeDays,
    github: metrics.githubConnected ? 1 : 0,
  };

  const unlockedCodes = new Set(unlocked.map((a) => a.code));

  const locked: LockedAchievement[] = catalogue
    .filter((a) => !unlockedCodes.has(a.code))
    .map((a) => {
      const actual = valueFor[a.metric] ?? 0;
      return {
        code: a.code,
        title: a.title,
        description: a.description,
        icon: a.icon,
        tier: a.tier,
        metric: a.metric,
        threshold: a.threshold,
        progress: Math.max(0, Math.min(actual, a.threshold)),
      };
    });

  return {
    unlocked,
    locked,
    unlockedCount: unlocked.length,
    totalCount: catalogue.length,
  };
}

/* ------------------------------ leaderboard ------------------------------ */

/**
 * Monthly leaderboard.
 *
 * Ranked by this calendar month's real activity, so the ranking resets by
 * itself on the 1st — no scheduled job. Only users with genuine activity this
 * month are listed, and only profiles that are public and hold a username.
 */
export async function getMonthlyLeaderboard(
  userId: string,
  limit = 50
): Promise<{ rows: MonthlyLeaderboardRow[]; available: boolean }> {
  const bounded = Math.min(Math.max(limit, 1), 100);
  try {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const rows = await prisma.activityDaily.findMany({
      where: { day: { gte: monthStart, lt: nextMonthStart } },
      select: { user_id: true, day: true, count: true, difficulty: true },
    });

    type MonthTotal = {
      user_id: string;
      problems: number;
      activities: number;
      days: Set<string>;
    };
    const byUser = new Map<string, MonthTotal>();
    for (const row of rows) {
      const entry =
        byUser.get(row.user_id) ?? {
          user_id: row.user_id,
          problems: 0,
          activities: 0,
          days: new Set<string>(),
        };
      entry.problems += difficultyTotal(row.difficulty);
      entry.activities += row.count;
      if (row.count > 0) entry.days.add(dayKey(row.day));
      byUser.set(row.user_id, entry);
    }
    if (byUser.size === 0) return { available: true, rows: [] };

    const profiles = await prisma.profile.findMany({
      where: {
        user_id: { in: [...byUser.keys()] },
        onboarding_completed: true,
        display_username: { not: null },
      },
    });

    const ranked = profiles
      .filter((p) => {
        const visibility = p.visibility as Visibility | null;
        return (visibility?.platforms ?? DEFAULT_VISIBILITY.platforms) === true;
      })
      .map((p) => {
        const totals = byUser.get(p.user_id)!;
        return {
          profile: p,
          problems: totals.problems,
          activeDays: totals.days.size,
          score: totals.problems * 10 + totals.activities,
        };
      })
      .sort((a, b) =>
        b.score - a.score ||
        b.problems - a.problems ||
        a.profile.created_at.getTime() - b.profile.created_at.getTime()
      )
      .slice(0, bounded);

    return {
      available: true,
      rows: ranked.map((entry, i) => ({
        rank: i + 1,
        username: entry.profile.display_username ?? "",
        displayName: entry.profile.display_name,
        avatarUrl: entry.profile.avatar_url,
        problemsSolved: entry.problems,
        activeDays: entry.activeDays,
        score: entry.score,
        isCurrentUser: entry.profile.user_id === userId,
      })),
    };
  } catch (error) {
    // A leaderboard problem must never take the whole dashboard down.
    console.error("[devora/dashboard] leaderboard unavailable", error);
    return { available: false, rows: [] };
  }
}

/* --------------------------- one-call analytics -------------------------- */

export type DashboardAnalytics = {
  daily: DailyActivity[];
  streak: StreakStats;
  platformComparison: PlatformComparisonRow[];
  github: GitHubOverview | null;
  monthly: MonthlyProgress;
  yearly: YearlyOverview;
  personalBests: PersonalBests;
  achievementsSummary: AchievementSummary;
  monthlyLeaderboard: MonthlyLeaderboardRow[];
  leaderboardAvailable: boolean;
};

/**
 * Everything the dashboard's charts and analytic sections need, in one call.
 *
 * The daily series is read once and every derived figure is computed from it,
 * so the client never has to fan out to a dozen endpoints (§28).
 */
export async function getDashboardAnalytics(userId: string): Promise<DashboardAnalytics> {
  const daily = await getDailyActivity(userId);

  const [platformComparison, github, achievementsSummary, leaderboard, topicsExplicit, topicsDerived] =
    await Promise.all([
      getPlatformComparison(userId),
      getGitHubOverview(userId),
      getAchievementsSummary(userId, daily),
      getMonthlyLeaderboard(userId),
      getTopicProgress(userId),
      deriveTopicProgressFromTracker(userId),
    ]);

  // Same rule the payload uses: tracker rows win, derived counts are the
  // fallback — so "most solved topic" can never disagree with the topic panel.
  const topics = topicsExplicit.length > 0 ? topicsExplicit : topicsDerived;

  return {
    daily,
    streak: buildStreakStats(daily),
    platformComparison,
    github,
    monthly: buildMonthlyProgress(daily),
    yearly: buildYearlyOverview(daily, topics, platformComparison),
    personalBests: computePersonalBests(daily),
    achievementsSummary,
    monthlyLeaderboard: leaderboard.rows,
    leaderboardAvailable: leaderboard.available,
  };
}

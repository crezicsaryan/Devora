/**
 * GeeksforGeeks adapter — public profile endpoints used by gfg's own pages.
 *
 * GfG's public surface is thin and occasionally changes. This adapter reads
 * what is genuinely published (solved counts and coding score) and returns
 * null for anything it cannot source, so the dashboard shows "—" instead of a
 * number nobody can verify.
 */

import type { PlatformKey } from "@/lib/validation";
import type { NormalizedStats } from "@/lib/db/repository";
import {
  PlatformError,
  platformFetch,
  platformFetchText,
  type AdapterActivity,
  type AdapterIdentity,
  type ConnectContext,
  type NormalizedSyncResult,
  type PlatformAdapter,
  type SyncContext,
} from "@/lib/platforms/types";

const BASE = "https://www.geeksforgeeks.org";

type GfgApiResponse = {
  // Shape varies; only these keys are relied upon, and every one is optional.
  data?: Record<string, unknown>;
  userHandle?: string;
  handle?: string;
  userName?: string;
  totalProblemsSolved?: number;
  total_problems_solved?: number;
  easy?: number;
  medium?: number;
  hard?: number;
  codingScore?: number;
  coding_score?: number;
  instituteRank?: number;
  institute_rank?: number;
  currentStreak?: number;
  current_streak?: number;
  maxStreak?: number;
  longest_streak?: number;
  [key: string]: unknown;
};

function pickNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

async function fetchProfile(username: string): Promise<GfgApiResponse> {
  try {
    const data = await platformFetch<GfgApiResponse>(
      `${BASE}/gfg-api/v2/profile/${encodeURIComponent(username)}/userdata`,
      { revalidate: 900, timeoutMs: 12_000 }
    );
    const payload =
      data.data && typeof data.data === "object"
        ? (data.data as Record<string, unknown>)
        : (data as Record<string, unknown>);
    if (!payload || Object.keys(payload).length === 0) {
      throw new PlatformError("not_found", "No GeeksforGeeks profile with that username.");
    }
    return payload as GfgApiResponse;
  } catch (error) {
    if (error instanceof PlatformError && error.reason === "not_found") throw error;
    if (error instanceof PlatformError && error.reason === "upstream_error") {
      throw new PlatformError(
        "unsupported",
        "GeeksforGeeks did not return profile data for that username."
      );
    }
    throw error;
  }
}

function buildStats(profile: GfgApiResponse): NormalizedStats {
  const flat = profile as unknown as Record<string, unknown>;
  const easy = pickNumber(flat, ["easy", "easyProblemsSolved", "easy_problems_solved"]);
  const medium = pickNumber(flat, ["medium", "mediumProblemsSolved", "medium_problems_solved"]);
  const hard = pickNumber(flat, ["hard", "hardProblemsSolved", "hard_problems_solved"]);

  const solved =
    pickNumber(flat, [
      "totalProblemsSolved",
      "total_problems_solved",
      "problemsSolved",
      "solved",
    ]) ?? (easy != null || medium != null || hard != null
      ? (easy ?? 0) + (medium ?? 0) + (hard ?? 0)
      : null);

  return {
    solvedTotal: solved,
    solvedEasy: easy,
    solvedMedium: medium,
    solvedHard: hard,
    rating: null,
    maxRating: null,
    rankLabel:
      pickNumber(flat, ["instituteRank", "institute_rank"]) != null
        ? `Institute rank #${pickNumber(flat, ["instituteRank", "institute_rank"])}`
        : null,
    contests: null,
    badges: null,
    reputation: pickNumber(flat, ["codingScore", "coding_score"]),
    followers: null,
    publicRepos: null,
    contributions: null,
    streakCurrent: pickNumber(flat, ["currentStreak", "current_streak"]),
    streakLongest: pickNumber(flat, ["maxStreak", "longest_streak"]),
    raw: { source: "gfg-public-profile" },
  };
}

/** The public profile page carries a small submission heat map. */
async function fetchActivity(username: string): Promise<AdapterActivity | null> {
  try {
    const html = await platformFetchText(
      `${BASE}/user/${encodeURIComponent(username)}/`,
      { revalidate: 900, timeoutMs: 12_000 }
    );
    const days: { day: string; count: number }[] = [];
    const pattern = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-count="(\d+)"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      days.push({ day: match[1], count: Number(match[2]) });
    }
    if (days.length === 0) return null;
    days.sort((a, b) => a.day.localeCompare(b.day));
    return { days, currentStreak: null, longestStreak: null };
  } catch {
    // No published heat map is not an error condition.
    return null;
  }
}

export const gfgAdapter: PlatformAdapter = {
  key: "gfg" as PlatformKey,
  label: "GeeksforGeeks",
  authType: "public",

  async connect(ctx: ConnectContext): Promise<AdapterIdentity | null> {
    if (!ctx.username) return null;
    await fetchProfile(ctx.username);
    return {
      username: ctx.username,
      externalUserId: null,
      profileUrl: `${BASE}/user/${ctx.username}/`,
      avatarUrl: null,
    };
  },

  async verify(username: string) {
    try {
      await fetchProfile(username);
      return { exists: true, message: `@${username}` };
    } catch (error) {
      if (error instanceof PlatformError && error.reason === "not_found") {
        return { exists: false, message: "No GeeksforGeeks profile with that username." };
      }
      if (
        error instanceof PlatformError &&
        (error.reason === "rate_limited" || error.reason === "unsupported")
      ) {
        return { exists: false, message: "GeeksforGeeks check unavailable right now." };
      }
      throw error;
    }
  },

  async fetchProfile(username: string): Promise<AdapterIdentity | null> {
    await fetchProfile(username);
    return {
      username,
      externalUserId: null,
      profileUrl: `${BASE}/user/${username}/`,
      avatarUrl: null,
    };
  },

  async fetchStats(username: string): Promise<NormalizedStats> {
    return buildStats(await fetchProfile(username));
  },

  async fetchActivity(username: string): Promise<AdapterActivity | null> {
    return fetchActivity(username);
  },

  normalize(raw: unknown, _identity: AdapterIdentity): NormalizedStats {
    return buildStats(raw as GfgApiResponse);
  },

  async sync(ctx: SyncContext): Promise<NormalizedSyncResult> {
    const profile = await fetchProfile(ctx.username);
    const stats = buildStats(profile);
    return {
      identity: {
        username: ctx.username,
        externalUserId: null,
        profileUrl: `${BASE}/user/${ctx.username}/`,
        avatarUrl: null,
      },
      stats,
      activity: await fetchActivity(ctx.username),
      events: [
        {
          kind: "platform_sync",
          title: "GeeksforGeeks synchronized",
          detail: stats.solvedTotal != null ? `${stats.solvedTotal} problems solved` : undefined,
          href: `${BASE}/user/${ctx.username}/`,
        },
      ],
    };
  },
};

/**
 * CodeChef adapter — public JSON endpoints that codechef.com itself uses to
 * render a user's public profile.
 *
 * No login is performed, no Cloudflare/anti-bot protection is circumvented,
 * and requests are cached. If CodeChef declines the request, the adapter
 * reports the failure honestly instead of inventing statistics.
 */

import type { PlatformKey } from "@/lib/validation";
import type { NormalizedStats } from "@/lib/db/repository";
import {
  PlatformError,
  platformFetch,
  currentStreakFromDays,
  longestStreakFromDays,
  type AdapterActivity,
  type AdapterIdentity,
  type ConnectContext,
  type NormalizedSyncResult,
  type PlatformAdapter,
  type SyncContext,
} from "@/lib/platforms/types";

type CodeChefProfile = {
  name?: string;
  username?: string;
  profile?: string;
  image?: string;
  ratingNumber?: number;
  stars?: string;
  highestRating?: number;
  globalRank?: number;
  countryRank?: number;
  countryCode?: string;
  occupation?: string;
  studentOrProfessional?: string;
  institution?: string;
};

type CodeChefRatingHistory = {
  code?: string;
  getyear?: string;
  getmonth?: string;
  getday?: string;
  rating?: string;
  rank?: string;
  name?: string;
};

async function fetchProfile(username: string): Promise<CodeChefProfile> {
  try {
    const data = await platformFetch<CodeChefProfile>(
      `https://www.codechef.com/users/${encodeURIComponent(username)}`,
      {
        headers: { Accept: "application/json" },
        revalidate: 900,
        timeoutMs: 12_000,
      }
    );
    if (!data || (!data.username && !data.name)) {
      throw new PlatformError("not_found", "No CodeChef profile with that username.");
    }
    return data;
  } catch (error) {
    if (error instanceof PlatformError && error.reason === "upstream_error") {
      // CodeChef serves HTML to non-browser clients; that is not a user error.
      throw new PlatformError(
        "unsupported",
        "CodeChef did not return profile data for that username."
      );
    }
    throw error;
  }
}

async function fetchRatingHistory(username: string): Promise<CodeChefRatingHistory[]> {
  try {
    return await platformFetch<CodeChefRatingHistory[]>(
      `https://www.codechef.com/users/${encodeURIComponent(username)}/rating_data`,
      { revalidate: 900, timeoutMs: 12_000 }
    );
  } catch {
    return [];
  }
}

function buildStats(
  profile: CodeChefProfile,
  history: CodeChefRatingHistory[]
): NormalizedStats {
  return {
    // CodeChef publishes a rating and a rank, not a solved count.
    solvedTotal: null,
    solvedEasy: null,
    solvedMedium: null,
    solvedHard: null,
    rating: profile.ratingNumber ?? null,
    maxRating: profile.highestRating ?? null,
    rankLabel: profile.stars ?? null,
    contests: history.length > 0 ? history.length : null,
    badges: null,
    reputation: profile.globalRank ? -profile.globalRank : null, // rank, stored signed-safe
    followers: null,
    publicRepos: null,
    contributions: null,
    streakCurrent: null,
    streakLongest: null,
    raw: {
      globalRank: profile.globalRank ?? null,
      countryRank: profile.countryRank ?? null,
      stars: profile.stars ?? null,
    },
  };
}

function activityFromHistory(history: CodeChefRatingHistory[]): AdapterActivity | null {
  const counts = new Map<string, number>();
  for (const entry of history) {
    if (!entry.getyear || !entry.getmonth || !entry.getday) continue;
    const day = `${entry.getyear}-${String(entry.getmonth).padStart(2, "0")}-${String(
      entry.getday
    ).padStart(2, "0")}`;
    if (Number.isNaN(new Date(day).getTime())) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const days = [...counts.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
  return {
    days,
    currentStreak: currentStreakFromDays(days),
    longestStreak: longestStreakFromDays(days),
  };
}

export const codechefAdapter: PlatformAdapter = {
  key: "codechef" as PlatformKey,
  label: "CodeChef",
  authType: "public",

  async connect(ctx: ConnectContext): Promise<AdapterIdentity | null> {
    if (!ctx.username) return null;
    return this.fetchProfile(ctx.username);
  },

  async verify(username: string) {
    try {
      const profile = await fetchProfile(username);
      return { exists: true, message: `@${profile.username ?? username}` };
    } catch (error) {
      if (error instanceof PlatformError && error.reason === "not_found") {
        return { exists: false, message: "No CodeChef profile with that username." };
      }
      if (
        error instanceof PlatformError &&
        (error.reason === "rate_limited" || error.reason === "unsupported")
      ) {
        return { exists: false, message: "CodeChef check unavailable right now." };
      }
      throw error;
    }
  },

  async fetchProfile(username: string): Promise<AdapterIdentity | null> {
    const profile = await fetchProfile(username);
    return {
      username: profile.username ?? username,
      externalUserId: null,
      profileUrl: `https://www.codechef.com/users/${profile.username ?? username}`,
      avatarUrl: profile.image ?? null,
    };
  },

  async fetchStats(username: string): Promise<NormalizedStats> {
    const [profile, history] = await Promise.all([
      fetchProfile(username),
      fetchRatingHistory(username),
    ]);
    return buildStats(profile, history);
  },

  async fetchActivity(username: string): Promise<AdapterActivity | null> {
    return activityFromHistory(await fetchRatingHistory(username));
  },

  normalize(raw: unknown, _identity: AdapterIdentity): NormalizedStats {
    const payload = raw as {
      profile: CodeChefProfile;
      history: CodeChefRatingHistory[];
    };
    return buildStats(payload.profile, payload.history);
  },

  async sync(ctx: SyncContext): Promise<NormalizedSyncResult> {
    const [profile, history] = await Promise.all([
      fetchProfile(ctx.username),
      fetchRatingHistory(ctx.username),
    ]);

    return {
      identity: {
        username: profile.username ?? ctx.username,
        externalUserId: null,
        profileUrl: `https://www.codechef.com/users/${profile.username ?? ctx.username}`,
        avatarUrl: profile.image ?? null,
      },
      stats: buildStats(profile, history),
      activity: activityFromHistory(history),
      events: [
        {
          kind: "platform_sync",
          title: "CodeChef synchronized",
          detail: profile.stars ? `${profile.stars} · ${profile.ratingNumber ?? "unrated"}` : undefined,
          href: `https://www.codechef.com/users/${profile.username ?? ctx.username}`,
        },
      ],
    };
  },
};

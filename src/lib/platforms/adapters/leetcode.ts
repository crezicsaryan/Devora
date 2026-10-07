/**
 * LeetCode adapter.
 *
 * Uses LeetCode's own public GraphQL endpoint, which is what leetcode.com
 * itself calls to render a public profile. No authentication is bypassed, no
 * anti-bot protection is circumvented, and requests are made server-side at a
 * low volume (one sync per user action, with revalidation caching).
 */

import type { PlatformKey } from "@/lib/validation";
import type { NormalizedStats } from "@/lib/db/repository";
import {
  PlatformError,
  platformFetch,
  toDayKey,
  type AdapterActivity,
  type AdapterIdentity,
  type ConnectContext,
  type NormalizedSyncResult,
  type PlatformAdapter,
  type SyncContext,
} from "@/lib/platforms/types";

const GRAPHQL = "https://leetcode.com/graphql/";

type LeetCodeProfileResponse = {
  data?: {
    matchedUser: {
      username: string;
      profile: {
        realName: string | null;
        userAvatar: string | null;
        ranking: number | null;
        reputation: number | null;
        aboutMe: string | null;
      };
      submitStatsGlobal?: {
        acSubmissionNum: { difficulty: string; count: number }[];
      };
      badges?: { id: string; displayName: string }[];
      userCalendar?: {
        activeYears: number[];
        streak: number | null;
        totalActiveDays: number | null;
        submissionCalendar: string | null;
      };
    } | null;
    userContestRanking?: {
      attendedContestsCount: number | null;
      rating: number | null;
      globalRanking: number | null;
      topPercentage: number | null;
      badge: { name: string } | null;
    } | null;
  };
  errors?: { message: string }[];
};

const PROFILE_QUERY = `
query devoraProfile($username: String!) {
  matchedUser(username: $username) {
    username
    profile { realName userAvatar ranking reputation aboutMe }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    badges { id displayName }
    userCalendar { activeYears streak totalActiveDays submissionCalendar }
  }
  userContestRanking(username: $username) {
    attendedContestsCount rating globalRanking topPercentage badge { name }
  }
}`;

function parseCalendar(calendar: string | null): AdapterActivity["days"] {
  if (!calendar) return [];
  let raw: Record<string, number>;
  try {
    raw = JSON.parse(calendar) as Record<string, number>;
  } catch {
    return [];
  }
  return Object.entries(raw)
    .map(([seconds, count]) => ({
      day: toDayKey(new Date(Number(seconds) * 1000)),
      count: Number(count) || 0,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

async function fetchProfile(username: string): Promise<LeetCodeProfileResponse["data"]> {
  const body = await platformFetch<LeetCodeProfileResponse>(GRAPHQL, {
    method: "POST",
    body: { query: PROFILE_QUERY, variables: { username } },
    headers: { Referer: `https://leetcode.com/u/${username}/` },
    revalidate: 600,
    timeoutMs: 12_000,
  });

  if (body.errors?.length) {
    throw new PlatformError("upstream_error", body.errors[0].message);
  }
  if (!body.data?.matchedUser) {
    throw new PlatformError("not_found", "No LeetCode profile with that username.");
  }
  return body.data;
}

function buildStats(data: LeetCodeProfileResponse["data"] | undefined): NormalizedStats {
  const user = data?.matchedUser;
  const counts = new Map(
    (user?.submitStatsGlobal?.acSubmissionNum ?? []).map((c) => [
      c.difficulty.toLowerCase(),
      c.count,
    ])
  );

  const contest = data?.userContestRanking;
  const calendar = parseCalendar(user?.userCalendar?.submissionCalendar ?? null);

  return {
    solvedTotal: counts.get("all") ?? null,
    solvedEasy: counts.get("easy") ?? null,
    solvedMedium: counts.get("medium") ?? null,
    solvedHard: counts.get("hard") ?? null,
    rating: contest?.rating != null ? Math.round(contest.rating) : null,
    maxRating: null,
    rankLabel: contest?.badge?.name ?? (user?.profile.ranking ? `#${user.profile.ranking}` : null),
    contests: contest?.attendedContestsCount ?? null,
    badges: user?.badges?.length ?? null,
    reputation: user?.profile.reputation ?? null,
    followers: null,
    publicRepos: null,
    contributions: null,
    streakCurrent: user?.userCalendar?.streak ?? null,
    streakLongest: null,
    raw: {
      calendarDays: calendar.length,
      totalActiveDays: user?.userCalendar?.totalActiveDays ?? null,
      topPercentage: contest?.topPercentage ?? null,
    },
  };
}

export const leetcodeAdapter: PlatformAdapter = {
  key: "leetcode" as PlatformKey,
  label: "LeetCode",
  authType: "public",

  async connect(ctx: ConnectContext): Promise<AdapterIdentity | null> {
    if (!ctx.username) return null;
    return this.fetchProfile(ctx.username);
  },

  async verify(username: string) {
    try {
      const data = await fetchProfile(username);
      return { exists: true, message: `@${data?.matchedUser?.username ?? username}` };
    } catch (error) {
      if (error instanceof PlatformError && error.reason === "not_found") {
        return { exists: false, message: "No LeetCode profile with that username." };
      }
      if (error instanceof PlatformError && error.reason === "rate_limited") {
        return { exists: false, message: "LeetCode is rate limiting checks. Try again shortly." };
      }
      throw error;
    }
  },

  async fetchProfile(username: string): Promise<AdapterIdentity | null> {
    const data = await fetchProfile(username);
    const user = data?.matchedUser;
    if (!user) return null;
    return {
      username: user.username,
      externalUserId: null,
      profileUrl: `https://leetcode.com/u/${user.username}/`,
      avatarUrl: user.profile.userAvatar,
    };
  },

  async fetchStats(username: string): Promise<NormalizedStats> {
    return buildStats(await fetchProfile(username));
  },

  async fetchActivity(username: string): Promise<AdapterActivity | null> {
    const data = await fetchProfile(username);
    const days = parseCalendar(data?.matchedUser?.userCalendar?.submissionCalendar ?? null);
    if (days.length === 0) return null;
    return {
      days,
      currentStreak: data?.matchedUser?.userCalendar?.streak ?? null,
      longestStreak: null,
    };
  },

  normalize(raw: unknown, _identity: AdapterIdentity): NormalizedStats {
    return buildStats(raw as LeetCodeProfileResponse["data"]);
  },

  async sync(ctx: SyncContext): Promise<NormalizedSyncResult> {
    const data = await fetchProfile(ctx.username);
    const user = data?.matchedUser;
    if (!user) throw new PlatformError("not_found", "LeetCode profile not found.");

    const identity: AdapterIdentity = {
      username: user.username,
      externalUserId: null,
      profileUrl: `https://leetcode.com/u/${user.username}/`,
      avatarUrl: user.profile.userAvatar,
    };

    const days = parseCalendar(user.userCalendar?.submissionCalendar ?? null);

    return {
      identity,
      stats: buildStats(data),
      activity:
        days.length > 0
          ? {
              days,
              currentStreak: user.userCalendar?.streak ?? null,
              longestStreak: null,
            }
          : null,
      events: [
        {
          kind: "platform_sync",
          title: "LeetCode synchronized",
          detail: identity.username,
          href: identity.profileUrl,
        },
      ],
    };
  },
};

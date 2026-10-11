/**
 * Codeforces adapter — official public API only.
 * https://codeforces.com/apiHelp
 *
 * Codeforces publishes a real, documented, unauthenticated API. It is also
 * strict about rate limiting, so requests here are cached and throttled by the
 * sync runner rather than hammered.
 */

import type { PlatformKey } from "@/lib/validation";
import type { NormalizedStats } from "@/lib/db/repository";
import {
  PlatformError,
  platformFetchJsonResult,
  classifyVerifyFailure,
  verifiedResult,
  toDayKey,
  currentStreakFromDays,
  longestStreakFromDays,
  type AdapterActivity,
  type AdapterIdentity,
  type ConnectContext,
  type NormalizedSyncResult,
  type PlatformAdapter,
  type SyncContext,
} from "@/lib/platforms/types";

const API = "https://codeforces.com/api";

type CfResponse<T> = { status: string; comment?: string; result: T };

type CfUser = {
  handle: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  city?: string;
  organization?: string;
  contribution: number;
  rank: string;
  rating: number;
  maxRank: string;
  maxRating: number;
  lastOnlineTimeSeconds: number;
  registrationTimeSeconds: number;
  friendOfCount: number;
  avatar: string;
  titlePhoto: string;
};

type CfSubmission = {
  id: number;
  verdict?: string;
  creationTimeSeconds: number;
  problem: {
    contestId?: number;
    index: string;
    name: string;
    rating?: number;
    tags: string[];
  };
};

/**
 * Codeforces reports its own errors inside the body, at a NON-200 status:
 * a missing handle is `400 {"status":"FAILED","comment":"handles: User with
 * handle x not found"}`. Reading that body is the only way to tell "no such
 * handle" (a valid answer about the user's input) apart from "Codeforces is
 * broken" — so this reads it instead of discarding the response on 4xx.
 */
async function cfGet<T>(path: string, revalidate = 600): Promise<T> {
  const res = await platformFetchJsonResult<CfResponse<T>>(`${API}/${path}`, {
    revalidate,
  });

  if (res.body && res.body.status === "OK") return res.body.result;

  const comment = res.body?.comment ?? "";
  if (/not found|no such user/i.test(comment) || res.status === 404) {
    throw new PlatformError("not_found", "No Codeforces handle with that name.");
  }
  if (/limit|too many/i.test(comment) || res.status === 429) {
    throw new PlatformError("rate_limited", "Codeforces is rate limiting requests.", true);
  }
  if (res.status >= 500) {
    throw new PlatformError(
      "upstream_error",
      `Codeforces returned an unexpected response (${res.status}).`,
      true
    );
  }
  throw new PlatformError(
    "upstream_error",
    comment || `Codeforces returned an unexpected response (${res.status}).`
  );
}

/**
 * Codeforces problem rating maps cleanly onto difficulty bands, which is why
 * Codeforces can report a difficulty split while LeetCode's API already does.
 */
function difficultyFor(rating: number | undefined): "easy" | "medium" | "hard" | null {
  if (rating == null) return null;
  if (rating < 1200) return "easy";
  if (rating < 1800) return "medium";
  return "hard";
}

function buildStats(user: CfUser, submissions: CfSubmission[]): NormalizedStats {
  const accepted = submissions.filter((s) => s.verdict === "OK");
  const solved = new Set<string>();
  const easy = new Set<string>();
  const medium = new Set<string>();
  const hard = new Set<string>();

  for (const sub of accepted) {
    const key = `${sub.problem.contestId ?? "x"}-${sub.problem.index}`;
    if (solved.has(key)) continue;
    solved.add(key);
    const band = difficultyFor(sub.problem.rating);
    if (band === "easy") easy.add(key);
    else if (band === "medium") medium.add(key);
    else if (band === "hard") hard.add(key);
  }

  return {
    solvedTotal: solved.size,
    solvedEasy: easy.size,
    solvedMedium: medium.size,
    solvedHard: hard.size,
    rating: user.rating ?? null,
    maxRating: user.maxRating ?? null,
    rankLabel: user.rank || null,
    contests: null, // filled by sync() from the rating history
    badges: null,
    reputation: user.contribution ?? null,
    followers: user.friendOfCount ?? null,
    publicRepos: null,
    contributions: null,
    streakCurrent: null,
    streakLongest: null,
    raw: { maxRank: user.maxRank },
  };
}

function activityFromSubmissions(submissions: CfSubmission[]): AdapterActivity | null {
  const counts = new Map<string, number>();
  for (const sub of submissions) {
    if (sub.verdict !== "OK") continue;
    const day = toDayKey(new Date(sub.creationTimeSeconds * 1000));
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

export const codeforcesAdapter: PlatformAdapter = {
  key: "codeforces" as PlatformKey,
  label: "Codeforces",
  authType: "public",

  async connect(ctx: ConnectContext): Promise<AdapterIdentity | null> {
    if (!ctx.username) return null;
    return this.fetchProfile(ctx.username);
  },

  async verify(username: string) {
    try {
      const users = await cfGet<CfUser[]>(
        `user.info?handles=${encodeURIComponent(username)}`,
        900
      );
      const user = users[0];
      if (!user) {
        return classifyVerifyFailure(
          new PlatformError("not_found", "No Codeforces handle with that name."),
          { statsAvailable: true, fallbackUsername: username }
        );
      }
      return verifiedResult({
        username: user.handle,
        profileUrl: `https://codeforces.com/profile/${user.handle}`,
        message: user.rating ? `@${user.handle} · ${user.rank || "rated"} ${user.rating}` : `@${user.handle}`,
        statsAvailable: true,
      });
    } catch (error) {
      return classifyVerifyFailure(error, {
        statsAvailable: true,
        fallbackUsername: username,
      });
    }
  },

  async fetchProfile(username: string): Promise<AdapterIdentity | null> {
    const users = await cfGet<CfUser[]>(
      `user.info?handles=${encodeURIComponent(username)}`,
      900
    );
    const user = users[0];
    if (!user) return null;
    return {
      username: user.handle,
      externalUserId: null,
      profileUrl: `https://codeforces.com/profile/${user.handle}`,
      avatarUrl: user.titlePhoto || user.avatar || null,
    };
  },

  async fetchStats(username: string): Promise<NormalizedStats> {
    const [users, submissions] = await Promise.all([
      cfGet<CfUser[]>(`user.info?handles=${encodeURIComponent(username)}`, 900),
      cfGet<CfSubmission[]>(
        `user.status?handle=${encodeURIComponent(username)}&from=1&count=10000`,
        600
      ),
    ]);
    const user = users[0];
    if (!user) throw new PlatformError("not_found", "Codeforces handle not found.");
    return buildStats(user, submissions);
  },

  async fetchActivity(username: string): Promise<AdapterActivity | null> {
    const submissions = await cfGet<CfSubmission[]>(
      `user.status?handle=${encodeURIComponent(username)}&from=1&count=10000`,
      600
    );
    return activityFromSubmissions(submissions);
  },

  normalize(raw: unknown, _identity: AdapterIdentity): NormalizedStats {
    const payload = raw as { user: CfUser; submissions: CfSubmission[] };
    return buildStats(payload.user, payload.submissions);
  },

  async sync(ctx: SyncContext): Promise<NormalizedSyncResult> {
    const handle = encodeURIComponent(ctx.username);
    const [users, submissions, rating] = await Promise.all([
      cfGet<CfUser[]>(`user.info?handles=${handle}`, 900),
      cfGet<CfSubmission[]>(`user.status?handle=${handle}&from=1&count=10000`, 600),
      cfGet<
        { contestId: number; contestName: string; rank: number; ratingUpdateTimeSeconds: number; newRating: number }[]
      >(`user.rating?handle=${handle}`, 900).catch(() => []),
    ]);

    const user = users[0];
    if (!user) throw new PlatformError("not_found", "Codeforces handle not found.");

    const stats = buildStats(user, submissions);
    stats.contests = rating.length > 0 ? rating.length : null;

    return {
      identity: {
        username: user.handle,
        externalUserId: null,
        profileUrl: `https://codeforces.com/profile/${user.handle}`,
        avatarUrl: user.titlePhoto || user.avatar || null,
      },
      stats,
      activity: activityFromSubmissions(submissions),
      events: [
        {
          kind: "platform_sync",
          title: "Codeforces synchronized",
          detail: `${stats.solvedTotal ?? 0} problems solved`,
          href: `https://codeforces.com/profile/${user.handle}`,
        },
      ],
    };
  },
};

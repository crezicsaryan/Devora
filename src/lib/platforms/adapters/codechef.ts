/**
 * CodeChef adapter.
 *
 * What CodeChef actually publishes (verified against the live site):
 *   - `GET /users/{handle}` returns the profile PAGE as HTML (200). There is no
 *     JSON profile API — the previous version of this adapter asked for
 *     `application/json` on this very URL, so `response.json()` always threw
 *     and a real, existing profile was reported as unverifiable.
 *   - A missing handle is answered with a 302 to the site home page, not a 404,
 *     so the final URL — not the status code — is what proves existence.
 *   - The page embeds `var all_rating = [...]`: the user's real contest history
 *     with rating, rank, name and date per contest.
 *   - `…/rating_data` is gone (404), so it is no longer requested.
 *
 * No login is performed, no anti-bot protection is circumvented, requests are
 * cached, and every figure stored comes from the embedded contest history.
 */

import type { PlatformKey } from "@/lib/validation";
import type { NormalizedStats } from "@/lib/db/repository";
import {
  PlatformError,
  platformFetchDocument,
  classifyVerifyFailure,
  verifiedResult,
  currentStreakFromDays,
  longestStreakFromDays,
  type AdapterActivity,
  type AdapterIdentity,
  type ConnectContext,
  type NormalizedSyncResult,
  type PlatformAdapter,
  type SyncContext,
} from "@/lib/platforms/types";

const BASE = "https://www.codechef.com";

type CodeChefRatingEntry = {
  code?: string;
  getyear?: string;
  getmonth?: string;
  getday?: string;
  rating?: string;
  rank?: string;
  name?: string;
  end_date?: string;
};

const PROFILE_PATH = (username: string) => `/users/${encodeURIComponent(username)}`;

/**
 * Fetch the profile page and decide whether it really is that user's profile.
 *
 * Two signals are required together, because neither is sufficient on its own:
 * the final URL must still be `/users/{handle}` (a missing handle bounces to
 * `/`), and the document must carry the profile's own rating block.
 */
async function fetchProfileDocument(username: string): Promise<{
  html: string;
  canonicalUsername: string;
}> {
  const doc = await platformFetchDocument(`${BASE}${PROFILE_PATH(username)}`, {
    revalidate: 900,
    timeoutMs: 12_000,
  });

  let finalPath = "";
  try {
    finalPath = new URL(doc.finalUrl).pathname;
  } catch {
    finalPath = "";
  }

  const segments = finalPath.split("/").filter(Boolean);
  const onProfile = segments.length === 2 && segments[0].toLowerCase() === "users";
  const finalHandle = onProfile ? decodeURIComponent(segments[1]) : "";
  const sameUser =
    finalHandle.length > 0 &&
    finalHandle.toLowerCase() === username.toLowerCase();

  if (!sameUser || !/all_rating\s*=/.test(doc.html)) {
    throw new PlatformError(
      "not_found",
      "No CodeChef profile with that username."
    );
  }

  return { html: doc.html, canonicalUsername: finalHandle };
}

/** The page's own embedded contest history. */
function parseRatingHistory(html: string): CodeChefRatingEntry[] {
  const match = /var\s+all_rating\s*=\s*(\[[\s\S]*?\]);/.exec(html);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as CodeChefRatingEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * CodeChef's published division bands. This is a deterministic function of the
 * rating the platform itself reports — it is a label for a real number, not an
 * invented statistic, and it stays null when there is no rating.
 */
function starLabel(rating: number | null): string | null {
  if (rating === null) return null;
  if (rating < 1400) return "1★";
  if (rating < 1600) return "2★";
  if (rating < 1800) return "3★";
  if (rating < 2000) return "4★";
  if (rating < 2200) return "5★";
  if (rating < 2500) return "6★";
  return "7★";
}

function numeric(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Newest last, so "current rating" is simply the final entry. */
function chronological(history: CodeChefRatingEntry[]): CodeChefRatingEntry[] {
  return [...history].sort((a, b) => {
    const at = new Date(a.end_date ?? "").getTime() || 0;
    const bt = new Date(b.end_date ?? "").getTime() || 0;
    return at - bt;
  });
}

function buildStats(history: CodeChefRatingEntry[]): NormalizedStats {
  const ordered = chronological(history);
  const ratings = ordered
    .map((entry) => numeric(entry.rating))
    .filter((v): v is number => v !== null);
  const current = ratings.length > 0 ? ratings[ratings.length - 1] : null;

  return {
    // CodeChef publishes a rating and a contest history, not a solved count —
    // so solved stays null and the dashboard shows "—" rather than a guess.
    solvedTotal: null,
    solvedEasy: null,
    solvedMedium: null,
    solvedHard: null,
    rating: current,
    maxRating: ratings.length > 0 ? Math.max(...ratings) : null,
    rankLabel: starLabel(current),
    contests: ordered.length > 0 ? ordered.length : null,
    badges: null,
    reputation: null,
    followers: null,
    publicRepos: null,
    contributions: null,
    streakCurrent: null,
    streakLongest: null,
    raw: {
      source: "codechef-profile-page",
      contests: ordered.length,
      latestRank: numeric(ordered[ordered.length - 1]?.rank),
      latestContest: ordered[ordered.length - 1]?.name ?? null,
    },
  };
}

/** Real contest dates, so the activity heatmap reflects actual participation. */
function activityFromHistory(history: CodeChefRatingEntry[]): AdapterActivity | null {
  const counts = new Map<string, number>();
  for (const entry of history) {
    let day: string | null = null;
    if (entry.end_date) {
      const parsed = new Date(entry.end_date.replace(" ", "T") + "Z");
      if (!Number.isNaN(parsed.getTime())) day = parsed.toISOString().slice(0, 10);
    }
    if (!day && entry.getyear && entry.getmonth && entry.getday) {
      day = `${entry.getyear}-${String(entry.getmonth).padStart(2, "0")}-${String(
        entry.getday
      ).padStart(2, "0")}`;
    }
    if (!day) continue;
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

async function load(username: string) {
  const { html, canonicalUsername } = await fetchProfileDocument(username);
  return { history: parseRatingHistory(html), canonicalUsername };
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
      const { history, canonicalUsername } = await load(username);
      return verifiedResult({
        username: canonicalUsername,
        profileUrl: `${BASE}/users/${canonicalUsername}`,
        message: history.length > 0
          ? `@${canonicalUsername} · ${history.length} rated contests`
          : `@${canonicalUsername}`,
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
    const { canonicalUsername } = await load(username);
    return {
      username: canonicalUsername,
      externalUserId: null,
      profileUrl: `${BASE}/users/${canonicalUsername}`,
      avatarUrl: null,
    };
  },

  async fetchStats(username: string): Promise<NormalizedStats> {
    return buildStats((await load(username)).history);
  },

  async fetchActivity(username: string): Promise<AdapterActivity | null> {
    return activityFromHistory((await load(username)).history);
  },

  normalize(raw: unknown, _identity: AdapterIdentity): NormalizedStats {
    return buildStats((raw as CodeChefRatingEntry[]) ?? []);
  },

  async sync(ctx: SyncContext): Promise<NormalizedSyncResult> {
    const { history, canonicalUsername } = await load(ctx.username);
    const stats = buildStats(history);

    return {
      identity: {
        username: canonicalUsername,
        externalUserId: null,
        profileUrl: `${BASE}/users/${canonicalUsername}`,
        avatarUrl: null,
      },
      stats,
      activity: activityFromHistory(history),
      events: [
        {
          kind: "platform_sync",
          title: "CodeChef synchronized",
          detail: stats.rating
            ? `${stats.rankLabel ?? "rated"} · ${stats.rating} rating`
            : `${history.length} rated contests`,
          href: `${BASE}/users/${canonicalUsername}`,
        },
      ],
    };
  },
};

/**
 * HackerRank adapter — link-only, deliberately.
 *
 * Verified against the live site (August 2026):
 *   - the legacy public endpoints (`/rest/hackers/{handle}/badges`,
 *     `/rest/hackers/{handle}/profile`, `/rest/contests/master/hackers/…`)
 *     all return 404;
 *   - `/api/hackers/{handle}/badges` returns the SPA's index.html with 200 —
 *     for ANY handle, including handles that do not exist;
 *   - `/profile/{handle}` likewise returns 200 and the same shell for a real
 *     and a non-existent handle.
 *
 * The previous version treated that shell as a live profile, which made it
 * report `exists: true` for usernames that do not exist — a fabricated
 * verification. Reporting the truth (we cannot verify) is strictly better than
 * inventing a positive, and the user can still keep their profile as a link.
 */

import type { PlatformKey } from "@/lib/validation";
import type { NormalizedStats } from "@/lib/db/repository";
import type { PlatformVerifyResult } from "@/lib/types";
import {
  PlatformError,
  type AdapterActivity,
  type AdapterIdentity,
  type ConnectContext,
  type NormalizedSyncResult,
  type PlatformAdapter,
  type SyncContext,
} from "@/lib/platforms/types";

const BASE = "https://www.hackerrank.com";

const PROFILE_URL = (username: string) => `${BASE}/profile/${encodeURIComponent(username)}`;

const NO_PUBLIC_SOURCE =
  "HackerRank no longer exposes a public profile API, so Devora cannot verify this account or import badges. Your profile link can be saved and shown.";

const LINK_ONLY_VERIFICATION: PlatformVerifyResult = {
  outcome: "VERIFICATION_UNAVAILABLE",
  exists: false,
  message: NO_PUBLIC_SOURCE,
  username: null,
  profileUrl: null,
  statsAvailable: false,
  canSaveLink: true,
};

function identityFrom(username: string): AdapterIdentity {
  return {
    username,
    externalUserId: null,
    profileUrl: PROFILE_URL(username),
    avatarUrl: null,
  };
}

const EMPTY_STATS: NormalizedStats = {
  solvedTotal: null,
  solvedEasy: null,
  solvedMedium: null,
  solvedHard: null,
  rating: null,
  maxRating: null,
  rankLabel: null,
  contests: null,
  badges: null,
  reputation: null,
  followers: null,
  publicRepos: null,
  contributions: null,
  streakCurrent: null,
  streakLongest: null,
  raw: { source: "hackerrank-link-only", reason: "no-public-statistics-source" },
};

export const hackerrankAdapter: PlatformAdapter = {
  key: "hackerrank" as PlatformKey,
  label: "HackerRank",
  authType: "public",

  async verify(): Promise<PlatformVerifyResult> {
    // A fresh object every call — see the note in the GfG adapter.
    return { ...LINK_ONLY_VERIFICATION };
  },

  async connect(ctx: ConnectContext): Promise<AdapterIdentity | null> {
    if (!ctx.username) return null;
    return identityFrom(ctx.username);
  },

  async fetchProfile(username: string): Promise<AdapterIdentity | null> {
    return identityFrom(username);
  },

  async fetchStats(): Promise<NormalizedStats> {
    throw new PlatformError("unsupported", NO_PUBLIC_SOURCE);
  },

  async fetchActivity(): Promise<AdapterActivity | null> {
    // HackerRank publishes no per-day submission history.
    return null;
  },

  normalize(): NormalizedStats {
    return EMPTY_STATS;
  },

  async sync(_ctx: SyncContext): Promise<NormalizedSyncResult> {
    throw new PlatformError("unsupported", NO_PUBLIC_SOURCE);
  },
};

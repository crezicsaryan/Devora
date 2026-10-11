/**
 * GeeksforGeeks adapter — link-only, deliberately.
 *
 * Verified against the live site (August 2026):
 *   - the public data endpoint this adapter used to call
 *     (`/gfg-api/v2/profile/{handle}/userdata`) now returns 404;
 *   - `/gfg-api/v2/profile/{handle}`, `/api/user/{handle}` and the
 *     practiceapi equivalents also return 404;
 *   - `/profile/{handle}` returns 200 for a real handle AND for a handle that
 *     does not exist (the page is a client-rendered shell that is byte-for-byte
 *     the same length either way), so it cannot prove existence.
 *
 * There is therefore no permitted source that can confirm a GfG handle, and
 * inventing one is exactly what the PRD forbids. The honest behaviour is to
 * let the user keep their GfG profile as a saved link, marked unverified, and
 * to never claim their GfG statistics were imported.
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

const BASE = "https://www.geeksforgeeks.org";

const PROFILE_URL = (username: string) => `${BASE}/profile/${encodeURIComponent(username)}`;

const NO_PUBLIC_SOURCE =
  "GeeksforGeeks does not publish a public statistics API, so Devora cannot verify this account. Your profile link can be saved and shown, but no figures will be imported.";

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

/** No figure can be sourced, so every one of them stays null. */
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
  raw: { source: "gfg-link-only", reason: "no-public-statistics-source" },
};

export const gfgAdapter: PlatformAdapter = {
  key: "gfg" as PlatformKey,
  label: "GeeksforGeeks",
  authType: "public",

  async verify(): Promise<PlatformVerifyResult> {
    // A fresh object every call: callers fill in `username`/`profileUrl`, and
    // handing out a shared constant would let one request's handle leak into
    // the next one's response.
    return { ...LINK_ONLY_VERIFICATION };
  },

  /**
   * Build the identity from the handle alone. No request is made, because there
   * is nothing to ask — the URL shape is public knowledge.
   */
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
    // GfG publishes no per-day submission history; null keeps the chart honest.
    return null;
  },

  normalize(): NormalizedStats {
    return EMPTY_STATS;
  },

  async sync(_ctx: SyncContext): Promise<NormalizedSyncResult> {
    throw new PlatformError("unsupported", NO_PUBLIC_SOURCE);
  },
};

/**
 * HackerRank adapter.
 *
 * HackerRank does not publish a general public profile API. Badges live on the
 * public profile page and are read here as structured data, server-side, once
 * per sync, with caching — the same permitted-public-data approach the PRD
 * allows. Where a number cannot be sourced truthfully, the adapter returns
 * null and the dashboard renders "—" rather than a fabricated figure.
 */

import type { PlatformKey } from "@/lib/validation";
import type { NormalizedStats } from "@/lib/db/repository";
import {
  PlatformError,
  platformFetchText,
  type AdapterActivity,
  type AdapterIdentity,
  type ConnectContext,
  type NormalizedSyncResult,
  type PlatformAdapter,
  type SyncContext,
} from "@/lib/platforms/types";

const BASE = "https://www.hackerrank.com";

type HrBadge = {
  name: string;
  stars: number;
};

async function fetchProfileHtml(username: string): Promise<string> {
  const html = await platformFetchText(
    `${BASE}/profile/${encodeURIComponent(username)}`,
    { revalidate: 900, timeoutMs: 12_000 }
  );
  if (/Page Not Found|profile not found/i.test(html) || html.length < 500) {
    throw new PlatformError("not_found", "No HackerRank profile with that username.");
  }
  return html;
}

/**
 * HackerRank embeds a JSON blob with the profile payload on the public page.
 * Reading it is the documented shape of the page, not a private endpoint.
 */
function extractEmbeddedJson(html: string): Record<string, unknown> | null {
  const match = /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseBadges(html: string): HrBadge[] {
  const badges: HrBadge[] = [];
  const seen = new Set<string>();
  const pattern = /data-badge-name="([^"]+)"[\s\S]{0,300}?data-badge-stars="(\d+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const [, name, stars] = match;
    if (seen.has(name)) continue;
    seen.add(name);
    badges.push({ name, stars: Number(stars) });
  }

  if (badges.length === 0) {
    // Fallback: badge titles are rendered as headings on the profile page.
    const alt = /class="[^"]*badge-title[^"]*"[^>]*>\s*([^<]{2,60})\s*</g;
    while ((match = alt.exec(html)) !== null) {
      const name = match[1].trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      badges.push({ name, stars: 0 });
    }
  }
  return badges;
}

function buildStats(badges: HrBadge[], solved: number | null): NormalizedStats {
  const totalStars = badges.reduce((sum, b) => sum + (b.stars || 0), 0);
  return {
    solvedTotal: solved,
    solvedEasy: null,
    solvedMedium: null,
    solvedHard: null,
    rating: null,
    maxRating: null,
    rankLabel:
      totalStars > 0 ? `${badges.length} badges · ${totalStars}★` : badges.length > 0 ? `${badges.length} badges` : null,
    contests: null,
    badges: badges.length > 0 ? badges.length : null,
    reputation: null,
    followers: null,
    publicRepos: null,
    contributions: null,
    streakCurrent: null,
    streakLongest: null,
    raw: { badges },
  };
}

export const hackerrankAdapter: PlatformAdapter = {
  key: "hackerrank" as PlatformKey,
  label: "HackerRank",
  authType: "public",

  async connect(ctx: ConnectContext): Promise<AdapterIdentity | null> {
    if (!ctx.username) return null;
    return this.fetchProfile(ctx.username);
  },

  async verify(username: string) {
    try {
      await fetchProfileHtml(username);
      return { exists: true, message: `@${username}` };
    } catch (error) {
      if (error instanceof PlatformError && error.reason === "not_found") {
        return { exists: false, message: "No HackerRank profile with that username." };
      }
      if (error instanceof PlatformError && error.reason === "rate_limited") {
        return { exists: false, message: "HackerRank is rate limiting checks. Try again shortly." };
      }
      throw error;
    }
  },

  async fetchProfile(username: string): Promise<AdapterIdentity | null> {
    await fetchProfileHtml(username);
    return {
      username,
      externalUserId: null,
      profileUrl: `${BASE}/profile/${username}`,
      avatarUrl: null,
    };
  },

  async fetchStats(username: string): Promise<NormalizedStats> {
    const html = await fetchProfileHtml(username);
    return buildStats(parseBadges(html), null);
  },

  async fetchActivity(): Promise<AdapterActivity | null> {
    // HackerRank publishes no per-day submission history. Returning null keeps
    // the activity chart honest instead of inventing a series.
    return null;
  },

  normalize(raw: unknown, _identity: AdapterIdentity): NormalizedStats {
    return buildStats((raw as HrBadge[]) ?? [], null);
  },

  async sync(ctx: SyncContext): Promise<NormalizedSyncResult> {
    const html = await fetchProfileHtml(ctx.username);
    const badges = parseBadges(html);
    const embedded = extractEmbeddedJson(html);

    let solved: number | null = null;
    if (embedded) {
      const text = JSON.stringify(embedded);
      const solvedMatch = /"challenges_solved"\s*:\s*(\d+)/.exec(text);
      if (solvedMatch) solved = Number(solvedMatch[1]);
    }

    return {
      identity: {
        username: ctx.username,
        externalUserId: null,
        profileUrl: `${BASE}/profile/${ctx.username}`,
        avatarUrl: null,
      },
      stats: buildStats(badges, solved),
      activity: null,
      events: [
        {
          kind: "platform_sync",
          title: "HackerRank synchronized",
          detail: badges.length > 0 ? `${badges.length} badges` : undefined,
          href: `${BASE}/profile/${ctx.username}`,
        },
      ],
    };
  },
};

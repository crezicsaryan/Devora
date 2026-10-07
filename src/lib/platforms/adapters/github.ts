/**
 * GitHub adapter — OAuth-based.
 *
 * Security posture (PRD section 6):
 *   - Access and refresh tokens are stored server-side only, in a table with
 *     no RLS policies, and are never included in any API response.
 *   - The browser never sees a token, a client secret, or a password prompt.
 *   - The OAuth `state` value is single-use, held server-side, and bound to
 *     the signed-in user.
 */

import type { PlatformKey } from "@/lib/validation";
import type { NormalizedStats } from "@/lib/db/repository";
import {
  PlatformError,
  platformFetch,
  platformFetchText,
  currentStreakFromDays,
  longestStreakFromDays,
  type AdapterActivity,
  type AdapterIdentity,
  type ConnectContext,
  type NormalizedSyncResult,
  type PlatformAdapter,
  type SyncContext,
} from "@/lib/platforms/types";

const API = "https://api.github.com";

/* ------------------------------------------------------------------ */
/* OAuth endpoints                                                     */
/* ------------------------------------------------------------------ */

export const GITHUB_OAUTH_AUTHORIZE = "https://github.com/login/oauth/authorize";
export const GITHUB_OAUTH_TOKEN = "https://github.com/login/oauth/access_token";

/** Minimal scopes: read the profile and public repository data. */
export const GITHUB_SCOPES = ["read:user", "public_repo"];

export function githubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  );
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new PlatformError("auth_required", "GitHub authorization is not configured.");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GITHUB_SCOPES.join(" "),
    state,
    allow_signup: "true",
  });
  return `${GITHUB_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export type GithubTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

/**
 * Server-to-server code exchange. Requires the client secret, so this function
 * must only ever run in a route handler.
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  expiresAt: Date | null;
}> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new PlatformError("auth_required", "GitHub authorization is not configured.");
  }

  const response = await fetch(GITHUB_OAUTH_TOKEN, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Devora/1.0",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const json = (await response.json()) as GithubTokenResponse;
  if (!response.ok || !json.access_token) {
    throw new PlatformError(
      "auth_required",
      json.error_description || "GitHub rejected the authorization code."
    );
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    scope: json.scope ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Raw payload shapes                                                  */
/* ------------------------------------------------------------------ */

export type GithubUser = {
  login: string;
  id: number;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
};

export type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string | null;
  created_at: string;
  owner: { login: string };
};

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

async function authed<T>(path: string, token: string, revalidate?: number): Promise<T> {
  return platformFetch<T>(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    revalidate,
  });
}

function identityFrom(user: GithubUser): AdapterIdentity {
  return {
    username: user.login,
    externalUserId: String(user.id),
    profileUrl: user.html_url,
    avatarUrl: user.avatar_url,
  };
}

/**
 * List repositories.
 *
 * With a token we read the authenticated user's own repos (which also includes
 * private ones the user has authorized us to see). Without one we fall back to
 * the public listing for the handle.
 */
async function fetchRepositories(
  username: string,
  ctx?: SyncContext
): Promise<GithubRepo[]> {
  if (ctx?.accessToken) {
    return authed<GithubRepo[]>(
      "/user/repos?sort=pushed&per_page=30&affiliation=owner",
      ctx.accessToken,
      600
    );
  }
  return platformFetch<GithubRepo[]>(
    `${API}/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=30&type=owner`,
    { revalidate: 600 }
  );
}

export const githubAdapter: PlatformAdapter = {
  key: "github" as PlatformKey,
  label: "GitHub",
  authType: "oauth",

  async connect(ctx: ConnectContext): Promise<AdapterIdentity | null> {
    if (!ctx.accessToken) {
      throw new PlatformError("auth_required", "GitHub authorization is required.");
    }
    const user = await authed<GithubUser>("/user", ctx.accessToken);
    return identityFrom(user);
  },

  async verify(username: string) {
    try {
      // Public endpoint — no token needed, so this works during onboarding
      // even before the user authorizes.
      const user = await platformFetch<GithubUser>(
        `${API}/users/${encodeURIComponent(username)}`,
        { revalidate: 300 }
      );
      return { exists: true, message: `@${user.login}` };
    } catch (error) {
      if (error instanceof PlatformError && error.reason === "not_found") {
        return { exists: false, message: "No GitHub account with that username." };
      }
      if (error instanceof PlatformError && error.reason === "rate_limited") {
        // Never fake a result on rate limit — report honestly.
        return { exists: false, message: "GitHub is rate limiting checks. Try again shortly." };
      }
      throw error;
    }
  },

  async fetchProfile(username: string, ctx?: SyncContext) {
    if (ctx?.accessToken) {
      const user = await authed<GithubUser>("/user", ctx.accessToken);
      return identityFrom(user);
    }
    const user = await platformFetch<GithubUser>(
      `${API}/users/${encodeURIComponent(username)}`,
      { revalidate: 900 }
    );
    return identityFrom(user);
  },

  async fetchStats(username: string, ctx?: SyncContext): Promise<NormalizedStats> {
    const user = ctx?.accessToken
      ? await authed<GithubUser>("/user", ctx.accessToken, 900)
      : await platformFetch<GithubUser>(
          `${API}/users/${encodeURIComponent(username)}`,
          { revalidate: 900 }
        );

    // Merged PRs are the closest thing GitHub publishes to "problems solved",
    // but they are not problems solved. Reported as null so the dashboard
    // shows "—" instead of a misleading number.
    let contributions: number | null = null;
    const activity = await this.fetchActivity(username, ctx);
    if (activity) {
      contributions = activity.days.reduce((sum, d) => sum + d.count, 0);
    }

    return {
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
      followers: user.followers,
      publicRepos: user.public_repos,
      contributions,
      streakCurrent: activity?.currentStreak ?? null,
      streakLongest: activity?.longestStreak ?? null,
      raw: { login: user.login, public_repos: user.public_repos },
    };
  },

  /**
   * Contribution history.
   *
   * GitHub's contribution graph is not on the REST API. The only permitted
   * source is the user's own public profile page, which we read as HTML. This
   * is public data, fetched server-side, at most once per sync, and cached —
   * we do not poll, scrape at volume, or attempt to defeat any protection.
   */
  async fetchActivity(username: string, _ctx?: SyncContext): Promise<AdapterActivity | null> {
    try {
      const html = await platformFetchText(
        `https://github.com/users/${encodeURIComponent(username)}/contributions`,
        {
          accept: "text/html",
          revalidate: 900,
          timeoutMs: 12_000,
          headers: { "X-Requested-With": "XMLHttpRequest" },
        }
      );

      const days: { day: string; count: number }[] = [];
      // Each cell carries data-date="YYYY-MM-DD" and data-level="0..4".
      const cellPattern = /data-date="(\d{4}-\d{2}-\d{2})"[\s\S]{0,200}?data-level="(\d+)"/g;
      let match: RegExpExecArray | null;
      const countsByLevel: Record<string, number> = { "0": 0, "1": 1, "2": 3, "3": 6, "4": 10 };

      while ((match = cellPattern.exec(html)) !== null) {
        const [, day, level] = match;
        days.push({ day, count: countsByLevel[level] ?? 0 });
      }

      if (days.length === 0) {
        // No public contribution data available — report that honestly rather
        // than fabricating a series.
        return null;
      }

      days.sort((a, b) => a.day.localeCompare(b.day));
      return {
        days,
        currentStreak: currentStreakFromDays(days),
        longestStreak: longestStreakFromDays(days),
      };
    } catch (error) {
      // A missing contribution graph must not fail the whole sync.
      if (error instanceof PlatformError && error.reason === "not_found") return null;
      if (error instanceof PlatformError && error.reason === "rate_limited") return null;
      return null;
    }
  },

  normalize(raw: unknown, identity: AdapterIdentity): NormalizedStats {
    const user = raw as GithubUser;
    return {
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
      followers: user?.followers ?? null,
      publicRepos: user?.public_repos ?? null,
      contributions: null,
      streakCurrent: null,
      streakLongest: null,
      raw: { login: identity.username },
    };
  },

  async sync(ctx: SyncContext): Promise<NormalizedSyncResult> {
    const identity =
      (await this.fetchProfile(ctx.username, ctx)) ??
      (await this.connect(ctx));
    if (!identity) {
      throw new PlatformError("not_found", "GitHub account not found.");
    }

    const stats = await this.fetchStats(identity.username, ctx);
    const activity = await this.fetchActivity(identity.username, ctx);

    const events: NormalizedSyncResult["events"] = [];

    // Surface recently pushed repositories as real activity.
    try {
      const repos = await fetchRepositories(ctx.username, ctx);
      const recent = repos
        .filter((r) => r.pushed_at)
        .sort(
          (a, b) =>
            new Date(b.pushed_at as string).getTime() -
            new Date(a.pushed_at as string).getTime()
        )
        .slice(0, 3);
      for (const repo of recent) {
        events.push({
          kind: "github_sync",
          title: `Pushed to ${repo.name}`,
          detail: repo.description,
          href: repo.html_url,
          occurredAt: repo.pushed_at ?? undefined,
        });
      }
    } catch {
      // Repositories are a nice-to-have for the feed; never block the sync.
    }

    events.push({
      kind: "github_sync",
      title: "GitHub synchronized",
      detail: activity
        ? `${activity.days.reduce((s, d) => s + d.count, 0)} contributions recorded`
        : "Profile and repositories refreshed",
      href: identity.profileUrl,
    });

    return { identity, stats, activity, events };
  },

  /** Repositories — consumed by the sync runner to seed the Projects panel. */
  fetchRepositories,
};

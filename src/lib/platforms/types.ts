/**
 * The reusable platform adapter contract.
 *
 * PRD requirement 7: six platforms must not become six bespoke systems. Every
 * platform — including GitHub — implements this interface, and the sync runner
 * only ever talks to `PlatformAdapter`. Adding a seventh platform means writing
 * one file in ./adapters and registering it; nothing else changes.
 *
 * Pipeline enforced by the runner:
 *
 *   Frontend -> Backend API -> PlatformAdapter -> External API / public data
 *            -> normalize() -> Database -> Dashboard
 *
 * The frontend never calls an external platform directly.
 */

import type { PlatformKey } from "@/lib/validation";
import type { NormalizedStats } from "@/lib/db/repository";

export type SyncFailureReason =
  | "not_found"
  | "private"
  | "rate_limited"
  | "upstream_error"
  | "network"
  | "unsupported"
  | "auth_required";

export class PlatformError extends Error {
  readonly reason: SyncFailureReason;
  readonly retryable: boolean;

  constructor(reason: SyncFailureReason, message: string, retryable = false) {
    super(message);
    this.name = "PlatformError";
    this.reason = reason;
    this.retryable = retryable;
  }
}

export type AdapterIdentity = {
  /** The username as the platform itself spells it. */
  username: string;
  externalUserId: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
};

export type AdapterActivityDay = {
  /** YYYY-MM-DD in the platform's own reporting timezone. */
  day: string;
  count: number;
  difficulty?: Record<string, number>;
};

export type AdapterActivity = {
  days: AdapterActivityDay[];
  currentStreak: number | null;
  longestStreak: number | null;
};

export type NormalizedSyncResult = {
  identity: AdapterIdentity;
  stats: NormalizedStats;
  activity: AdapterActivity | null;
  /** Events worth surfacing in "Recent Activity" (e.g. a repo was pushed to). */
  events?: {
    kind: "github_sync" | "platform_sync";
    title: string;
    detail?: string | null;
    href?: string | null;
    occurredAt?: string;
  }[];
};

export type ConnectContext = {
  userId: string;
  /** OAuth token, present only for platforms connected via authorization. */
  accessToken?: string | null;
  refreshToken?: string | null;
  /** Handle supplied by the user for public-data platforms. */
  username?: string;
};

export type SyncContext = ConnectContext & {
  /** The handle already stored on the account row. */
  username: string;
};

export interface PlatformAdapter {
  readonly key: PlatformKey;
  readonly label: string;
  /** 'oauth' platforms authorize; 'public' platforms read permitted public data. */
  readonly authType: "oauth" | "public";

  /**
   * Resolve an account from an authorization grant or a supplied handle.
   * Returns null when the account cannot be found.
   */
  connect(ctx: ConnectContext): Promise<AdapterIdentity | null>;

  /**
   * Cheap existence check for a public handle. Used by the onboarding UI to
   * confirm a username is real before the user moves on. Never throws for a
   * missing account — returns `{ exists: false }`.
   */
  verify(username: string): Promise<{ exists: boolean; message?: string }>;

  /** Profile-level identity + headline numbers. */
  fetchProfile(username: string, ctx?: SyncContext): Promise<AdapterIdentity | null>;

  /** Platform-specific statistics. */
  fetchStats(username: string, ctx?: SyncContext): Promise<NormalizedStats>;

  /** Daily activity series, where the platform exposes one. */
  fetchActivity(username: string, ctx?: SyncContext): Promise<AdapterActivity | null>;

  /**
   * Map a raw upstream payload onto the shared shape.
   * Kept separate from fetching so it can be unit-tested without the network.
   */
  normalize(raw: unknown, identity: AdapterIdentity): NormalizedStats;

  /** Full pipeline used by the sync runner. */
  sync(ctx: SyncContext): Promise<NormalizedSyncResult>;

  /**
   * Optional: repository listing, implemented by platforms that have one
   * (currently GitHub). The sync runner uses it to seed the Projects panel.
   * Kept structurally typed so nothing has to import a platform-specific type.
   */
  fetchRepositories?(username: string, ctx?: SyncContext): Promise<AdapterRepository[]>;
}

/** The subset of a repository the sync runner cares about. */
export type AdapterRepository = {
  /** Stable upstream id, used as `external_id` for idempotent upserts. */
  id: number | string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count?: number;
  fork: boolean;
  archived: boolean;
  pushed_at: string | null;
};

/* ------------------------------------------------------------------ */
/* Shared HTTP helper                                                  */
/* ------------------------------------------------------------------ */

const USER_AGENT =
  "Devora/1.0 (+https://devora.app; developer profile aggregator)";

export type HttpOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  /** Seconds to cache the response. All platforms are read-only snapshots. */
  revalidate?: number;
  timeoutMs?: number;
  accept?: string;
};

/**
 * One HTTP entry point for every adapter.
 *
 * Respects the externally-imposed limits rather than trying to work around
 * them: honest User-Agent, short timeout, optional revalidation cache, and a
 * 429 mapped to a retryable rate-limit error. No adapter bypasses
 * authentication, rate limits or anti-bot systems.
 */
export async function platformFetch<T>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: options.accept ?? "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      next: options.revalidate ? { revalidate: options.revalidate } : undefined,
      cache: options.revalidate ? undefined : "no-store",
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw new PlatformError("network", "The platform took too long to respond.", true);
    }
    throw new PlatformError("network", "Could not reach the platform.", true);
  }
  clearTimeout(timeout);

  if (response.status === 429) {
    throw new PlatformError(
      "rate_limited",
      "The platform is rate limiting requests. Try again shortly.",
      true
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new PlatformError(
      "auth_required",
      "The platform refused this request. Your connection may need to be renewed.",
      true
    );
  }
  if (response.status === 404) {
    throw new PlatformError("not_found", "No such account on this platform.");
  }
  if (!response.ok) {
    throw new PlatformError(
      "upstream_error",
      `The platform returned an unexpected response (${response.status}).`,
      response.status >= 500
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new PlatformError("upstream_error", "The platform returned unreadable data.");
  }
}

/** Fetch plain text (used by platforms that only expose HTML fragments). */
export async function platformFetchText(
  url: string,
  options: HttpOptions = {}
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: options.accept ?? "text/html,application/xhtml+xml",
        ...options.headers,
      },
      signal: controller.signal,
      next: options.revalidate ? { revalidate: options.revalidate } : undefined,
      cache: options.revalidate ? undefined : "no-store",
    });
    if (!response.ok) {
      throw new PlatformError(
        response.status === 404 ? "not_found" : "upstream_error",
        `The platform returned ${response.status}.`
      );
    }
    return await response.text();
  } catch (error) {
    if (error instanceof PlatformError) throw error;
    throw new PlatformError("network", "Could not reach the platform.", true);
  } finally {
    clearTimeout(timeout);
  }
}

/** YYYY-MM-DD for a Date, in UTC, matching Postgres `date`. */
export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Longest run of consecutive active days within a daily series.
 * Used to derive streaks from GitHub's contribution calendar, which is the
 * only streak evidence GitHub actually publishes.
 */
export function longestStreakFromDays(days: AdapterActivityDay[]): number {
  const active = days
    .filter((d) => d.count > 0)
    .map((d) => d.day)
    .sort();
  if (active.length === 0) return 0;

  let longest = 1;
  let run = 1;
  for (let i = 1; i < active.length; i++) {
    const prev = new Date(`${active[i - 1]}T00:00:00Z`).getTime();
    const cur = new Date(`${active[i]}T00:00:00Z`).getTime();
    run = cur - prev === 86_400_000 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  return longest;
}

/** Current run of consecutive active days ending at the most recent day. */
export function currentStreakFromDays(days: AdapterActivityDay[]): number {
  const byDay = new Map(days.map((d) => [d.day, d.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  // Allow the streak to survive a day that has not been logged yet.
  for (let offset = 0; offset < 400; offset++) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const key = toDayKey(d);
    const count = byDay.get(key) ?? 0;
    if (count > 0) {
      streak++;
      continue;
    }
    if (offset === 0) continue; // today may simply not have been recorded
    break;
  }
  return streak;
}

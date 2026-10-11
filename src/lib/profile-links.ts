/**
 * Profile links — the eight entries collected on /profile/create.
 *
 * Design rule (this is the whole point of the module):
 *   Providing a URL stores a *link*. It does not prove the account exists, and
 *   it must never be presented as a verified connection or produce statistics.
 *   Verification is a separate, explicit step (`/api/platforms/verify`), and
 *   statistics only ever come from a real adapter sync.
 *
 * So the output of this module is deliberately named `linked` — never
 * `connected` — and carries no numbers.
 */

import { validateUrl } from "@/lib/validation";
import type { PlatformKey } from "@/lib/validation";

/** The eight rows shown under "Connect your existing profiles". */
export type LinkKey =
  | "github"
  | "linkedin"
  | "leetcode"
  | "gfg"
  | "codechef"
  | "codeforces"
  | "hackerrank"
  | "portfolio";

export type LinkSpec = {
  key: LinkKey;
  label: string;
  /** Where the link is persisted. */
  storage: { kind: "platform"; platform: PlatformKey } | { kind: "profile"; column: string };
  /** Accepted hostname (and any subdomain of it). */
  host: string;
  /**
   * Path to a real asset in /public, or "" when no asset exists — the UI then
   * renders an inline SVG for that key. Kept explicit so we never reference a
   * logo file that is not actually there.
   */
  logo: string;
  placeholder: string;
  /** Pulls the handle out of the URL path. Returns null when absent. */
  handleFromPath: (pathname: string) => string | null;
  note: string;
};

/** First non-empty path segment — the common shape for most platforms. */
function firstSegment(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg ?? null;
}

/** `/users/{handle}` / `/u/{handle}` / `/profile/{handle}` style prefixes. */
function afterPrefix(pathname: string, prefix: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0].toLowerCase() === prefix) return parts[1] ?? null;
  return null;
}

export const LINK_SPECS: LinkSpec[] = [
  {
    key: "github",
    label: "GitHub",
    storage: { kind: "platform", platform: "github" },
    host: "github.com",
    logo: "/platform-logos/github-white.png",
    placeholder: "https://github.com/username",
    handleFromPath: firstSegment,
    note: "Connect with OAuth to verify and sync activity, or just paste your profile URL.",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    storage: { kind: "profile", column: "linkedin_url" },
    host: "linkedin.com",
    logo: "",
    placeholder: "https://www.linkedin.com/in/username",
    handleFromPath: (p) => afterPrefix(p, "in"),
    note: "Saved as a profile link. Devora never scrapes LinkedIn.",
  },
  {
    key: "leetcode",
    label: "LeetCode",
    storage: { kind: "platform", platform: "leetcode" },
    host: "leetcode.com",
    logo: "/platform-logos/leetcode.png",
    placeholder: "https://leetcode.com/u/username",
    handleFromPath: (p) => afterPrefix(p, "u") ?? firstSegment(p),
    note: "Link only — no statistics until you sync.",
  },
  {
    key: "gfg",
    label: "GeeksforGeeks",
    storage: { kind: "platform", platform: "gfg" },
    host: "geeksforgeeks.org",
    logo: "/platform-logos/gfg.png",
    placeholder: "https://geeksforgeeks.org/profile/username",
    // GfG's live profile URL is `/profile/{handle}`. The legacy `/user/{handle}`
    // shape is still accepted, but it must come SECOND: with the old ordering a
    // `/profile/crezicsaryan` link extracted the literal handle "profile".
    handleFromPath: (p) =>
      afterPrefix(p, "profile") ?? afterPrefix(p, "user") ?? firstSegment(p),
    note: "Link only — no statistics until you sync.",
  },
  {
    key: "codechef",
    label: "CodeChef",
    storage: { kind: "platform", platform: "codechef" },
    host: "codechef.com",
    logo: "/platform-logos/codechef.png",
    placeholder: "https://www.codechef.com/users/username",
    handleFromPath: (p) => afterPrefix(p, "users") ?? firstSegment(p),
    note: "Link only — no statistics until you sync.",
  },
  {
    key: "codeforces",
    label: "Codeforces",
    storage: { kind: "platform", platform: "codeforces" },
    host: "codeforces.com",
    logo: "/platform-logos/codeforces.png",
    placeholder: "https://codeforces.com/profile/username",
    handleFromPath: (p) => afterPrefix(p, "profile") ?? firstSegment(p),
    note: "Link only — no statistics until you sync.",
  },
  {
    key: "hackerrank",
    label: "HackerRank",
    storage: { kind: "platform", platform: "hackerrank" },
    host: "hackerrank.com",
    logo: "/platform-logos/hackerrank.png",
    placeholder: "https://www.hackerrank.com/profile/username",
    handleFromPath: (p) => afterPrefix(p, "profile") ?? firstSegment(p),
    note: "Link only — no statistics until you sync.",
  },
  {
    key: "portfolio",
    label: "Portfolio / Personal Website",
    storage: { kind: "profile", column: "portfolio_url" },
    host: "",
    logo: "",
    placeholder: "https://your-site.dev",
    handleFromPath: () => null,
    note: "Any http(s) URL. Shown as a clickable link on your profile.",
  },
];

export const LINK_BY_KEY: Record<LinkKey, LinkSpec> = Object.fromEntries(
  LINK_SPECS.map((s) => [s.key, s])
) as Record<LinkKey, LinkSpec>;

/** Only the coding platforms can be synced; LinkedIn/portfolio are plain links. */
export const SYNCABLE_LINK_KEYS: LinkKey[] = LINK_SPECS.filter(
  (s) => s.storage.kind === "platform"
).map((s) => s.key);

/**
 * The canonical profile URL for a platform and handle.
 *
 * Mirrors the `placeholder` shapes above, so a handle typed by hand and a URL
 * pasted by hand end up storing the same link.
 */
const PLATFORM_PATH: Record<PlatformKey, (handle: string) => string> = {
  github: (h) => `/${h}`,
  leetcode: (h) => `/u/${h}`,
  gfg: (h) => `/profile/${h}`,
  codechef: (h) => `/users/${h}`,
  codeforces: (h) => `/profile/${h}`,
  hackerrank: (h) => `/profile/${h}`,
};

export function profileUrlFor(platform: PlatformKey, handle: string): string {
  const spec = LINK_BY_KEY[platform as LinkKey];
  const path = PLATFORM_PATH[platform]?.(encodeURIComponent(handle));
  if (!spec || !path) return "";
  return `https://${spec.host}${path}`;
}

/** Characters a platform handle may contain. Anything else is rejected. */
const HANDLE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;

export type ResolvedPlatformInput = {
  /** The handle, or null when the input was a URL we could not read a handle from. */
  username: string | null;
  /** The canonical profile URL when we could build or validate one. */
  url: string | null;
  /** A user-facing reason the input cannot be used. */
  error: string | null;
};

/**
 * Accept EITHER a handle or a profile URL for one platform.
 *
 * Rules that matter:
 *   - A URL is validated against the platform's own host, so a LeetCode field
 *     can never hold a github.com link.
 *   - A handle is taken out of the path with that platform's own rule; if no
 *     handle can be found the input is REJECTED rather than guessing at part
 *     of the path.
 *   - Input is never silently truncated: an over-long value is an error, not a
 *     quieter version of itself.
 */
export function resolvePlatformInput(
  platform: PlatformKey,
  input: unknown
): ResolvedPlatformInput {
  const spec = LINK_BY_KEY[platform as LinkKey];
  if (!spec) {
    return { username: null, url: null, error: "Unknown platform." };
  }

  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) {
    return {
      username: null,
      url: null,
      error: "Enter your username or paste your profile URL.",
    };
  }
  if (raw.length > 200) {
    return {
      username: null,
      url: null,
      error: "That is longer than a username or profile URL should be.",
    };
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
  const looksLikeUrl =
    hasScheme || raw.includes("/") || raw.toLowerCase().includes(spec.host);

  if (!looksLikeUrl) {
    if (!HANDLE_RE.test(raw)) {
      return {
        username: null,
        url: null,
        error: `${spec.label} usernames can contain letters, numbers, dots, underscores and hyphens only.`,
      };
    }
    return { username: raw, url: profileUrlFor(platform, raw), error: null };
  }

  const parsed = parseProfileLink(platform as LinkKey, raw);
  if (parsed.error) {
    return { username: null, url: null, error: parsed.error };
  }
  if (!parsed.url || !parsed.username) {
    return {
      username: null,
      url: parsed.url ?? null,
      error: `We could not find a ${spec.label} username in that URL. Paste the link to your profile page.`,
    };
  }

  return {
    username: parsed.username,
    // Keep the URL the user gave us, but only after it passed host validation —
    // never rewrite it into something they did not type.
    url: parsed.url,
    error: null,
  };
}

export type ParsedLink = {
  key: LinkKey;
  /** Canonical URL, or "" when the field was left empty. */
  url: string;
  /** Handle when it could be derived, otherwise null. Never invented. */
  username: string | null;
  error: string | null;
};

/**
 * Validate one profile link.
 *
 * An empty value is not an error — every field on the page is optional.
 * A non-empty value must be a real http(s) URL on the expected host.
 */
export function parseProfileLink(key: LinkKey, input: unknown): ParsedLink {
  const spec = LINK_BY_KEY[key];
  if (!spec) {
    return { key, url: "", username: null, error: "Unknown link." };
  }

  const result = validateUrl(input, {
    requiredHost: spec.host || undefined,
    label: spec.label,
  });

  if (result.error) {
    return { key, url: "", username: null, error: result.error };
  }
  if (!result.url) {
    // Empty input: valid, but nothing to store.
    return { key, url: "", username: null, error: null };
  }

  let username: string | null = null;
  try {
    const path = new URL(result.url).pathname;
    const raw = spec.handleFromPath(path);
    if (raw) {
      // A handle must be URL-safe; anything else means we cannot derive one,
      // which is fine — we still keep the link.
      const cleaned = decodeURIComponent(raw).replace(/[^A-Za-z0-9._-]/g, "");
      username = cleaned.length > 0 && cleaned.length <= 60 ? cleaned : null;
    }
  } catch {
    username = null;
  }

  return { key, url: result.url, username, error: null };
}

/**
 * Validate every link field at once.
 * Returns the parsed links plus the first human-readable error, if any.
 */
export function parseProfileLinks(input: Record<string, unknown>): {
  links: ParsedLink[];
  errors: string[];
} {
  const links: ParsedLink[] = [];
  const errors: string[] = [];

  for (const spec of LINK_SPECS) {
    const parsed = parseProfileLink(spec.key, input[spec.key]);
    links.push(parsed);
    if (parsed.error) errors.push(parsed.error);
  }

  return { links, errors };
}

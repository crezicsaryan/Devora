/**
 * Server-side validation and sanitisation.
 *
 * Rule of record: the browser is never trusted. Every value that reaches the
 * database passes through this module first, regardless of what the UI already
 * checked. The UI performs the same checks for fast feedback only.
 */

import { z } from "zod";

/** Characters allowed in a Devora handle: letters, numbers, underscore, hyphen. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

export const MAX_SKILLS = 60;
export const MAX_PROJECTS = 24;
export const MAX_BIO = 320;
export const MAX_DISPLAY_NAME = 60;
export const MAX_LOCATION = 80;
export const MAX_COLLEGE = 120;
export const MAX_PROJECT_DESC = 600;
export const MAX_PROJECT_TECH = 12;

export const DEVELOPER_ROLES = [
  "Student",
  "Software Developer",
  "Full Stack Developer",
  "Backend Developer",
  "Frontend Developer",
  "AI/ML Developer",
  "Competitive Programmer",
  "Other",
] as const;

export const PLATFORM_KEYS = [
  "github",
  "leetcode",
  "gfg",
  "codechef",
  "codeforces",
  "hackerrank",
] as const;

export type PlatformKey = (typeof PLATFORM_KEYS)[number];

/**
 * Strip control characters, collapse runs of whitespace, trim, and hard-cap.
 * Prevents stored markup, zero-width trickery and unbounded strings.
 */
export function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Like sanitizeText but keeps line breaks (bios, descriptions). */
export function sanitizeMultiline(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function normalizeUsername(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

/** A handle that will survive the DB's unique index. */
export function isValidUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN &&
    username.length <= USERNAME_MAX &&
    USERNAME_PATTERN.test(username)
  );
}

export type UrlField = {
  /** Accepts a bare host (`github.com/me`) the way developers usually type it. */
  value: string;
  /** Canonical absolute URL, or null when the input was empty. */
  url: string | null;
  error: string | null;
};

/**
 * Validate a user-supplied URL.
 *
 * Because people type "github.com/me" rather than "https://github.com/me",
 * a missing scheme is added before parsing. Only http/https survive, which
 * blocks `javascript:` and `data:` payloads from ever being stored.
 */
export function validateUrl(
  input: unknown,
  options: { requiredHost?: string; label?: string } = {}
): UrlField {
  const label = options.label ?? "URL";
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return { value: "", url: null, error: null };

  let candidate = raw;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { value: raw, url: null, error: `${label} is not a valid link.` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      value: raw,
      url: null,
      error: `${label} must start with http:// or https://.`,
    };
  }

  // A hostname with no dot is almost always a typo, except localhost.
  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".") && host !== "localhost") {
    return { value: raw, url: null, error: `${label} is missing a domain.` };
  }

  if (options.requiredHost) {
    const expected = options.requiredHost.toLowerCase();
    if (host !== expected && !host.endsWith(`.${expected}`)) {
      return {
        value: raw,
        url: null,
        error: `${label} must be a ${expected} link.`,
      };
    }
  }

  parsed.hash = "";
  return { value: raw, url: parsed.toString(), error: null };
}

/** Accepts an email-shaped string or an empty value. */
export function validateOptionalEmail(input: unknown): {
  value: string;
  error: string | null;
} {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return { value: "", error: null };
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw) && raw.length <= 254;
  return ok
    ? { value: raw.toLowerCase(), error: null }
    : { value: raw, error: "Email address looks invalid." };
}

/**
 * Profile photo reference. Accepts ONLY an https URL pointing at object
 * storage (or any https image the user pastes).
 *
 * Image binaries are never stored in the database: the client uploads the
 * cropped photo to object storage first (POST /api/profile/photo), and only
 * the resulting URL is ever persisted.
 */
export function validateAvatar(input: unknown): {
  value: string | null;
  error: string | null;
} {
  if (input === null || input === undefined || input === "") {
    return { value: null, error: null };
  }
  if (typeof input !== "string") {
    return { value: null, error: "Profile photo must be an image." };
  }

  if (input.startsWith("data:")) {
    return {
      value: null,
      error: "Upload the photo to storage first — raw image data is not accepted.",
    };
  }

  const parsed = validateUrl(input, { label: "Photo URL" });
  if (parsed.error || !parsed.url) {
    return { value: null, error: parsed.error ?? "Photo URL is invalid." };
  }
  // An http image on an https page is blocked by the browser as mixed content,
  // so the avatar would silently fail to render. Require https here.
  if (!parsed.url.startsWith("https://")) {
    return { value: null, error: "Photo URL must use https." };
  }
  return { value: parsed.url, error: null };
}

/**
 * Server-side photo upload payload: the cropped image as a data URL.
 * PNG/JPEG/WebP only, hard-capped so one request cannot exhaust memory.
 */
export const MAX_PHOTO_BYTES = 2_000_000;

export type ParsedImage = { buffer: Buffer; contentType: string };

export function parseDataUrlImage(
  input: unknown,
  maxBytes = MAX_PHOTO_BYTES
): { value: ParsedImage; error: null } | { value: null; error: string } {
  if (typeof input !== "string" || !input.startsWith("data:")) {
    return { value: null, error: "That photo could not be read." };
  }
  const match = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(input);
  if (!match) {
    return { value: null, error: "Use a PNG, JPEG or WebP image." };
  }
  const buffer = Buffer.from(match[3].replace(/\s+/g, ""), "base64");
  if (buffer.length === 0) {
    return { value: null, error: "That photo could not be read." };
  }
  if (buffer.length > maxBytes) {
    return {
      value: null,
      error: `That photo is too large after processing (max ${Math.round(maxBytes / 1_000_000)} MB).`,
    };
  }
  return { value: { buffer, contentType: match[1] }, error: null };
}

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

export const profileStepSchema = z.object({
  displayName: z
    .string()
    .transform((v) => sanitizeText(v, MAX_DISPLAY_NAME))
    .refine((v) => v.length >= 1, "Display name is required."),
  username: z
    .string()
    // Deliberately NOT `normalizeUsername` here: silently stripping invalid
    // characters would hand the user a handle they did not choose
    // ("john.doe" -> "johndoe"). We trim and lower-case, then reject anything
    // that still contains a character we do not allow.
    .transform((v) => v.trim().toLowerCase())
    .refine(
      (v) => /^[a-z0-9_-]*$/.test(v),
      "Usernames can only contain letters, numbers, underscores and hyphens — no spaces or symbols."
    )
    .refine(
      (v) => v.length >= USERNAME_MIN,
      `Username must be at least ${USERNAME_MIN} characters.`
    )
    .refine(
      (v) => v.length <= USERNAME_MAX,
      `Username must be ${USERNAME_MAX} characters or fewer.`
    ),
  bio: z
    .string()
    .optional()
    .transform((v) => sanitizeMultiline(v ?? "", MAX_BIO)),
  developerRole: z
    .string()
    .optional()
    .transform((v) => sanitizeText(v ?? "", 60))
    .refine(
      (v) => v === "" || (DEVELOPER_ROLES as readonly string[]).includes(v),
      "Pick a role from the list."
    ),
  location: z
    .string()
    .optional()
    .transform((v) => sanitizeText(v ?? "", MAX_LOCATION)),
  // Present in edit saves too; the create route additionally requires it.
  college: z
    .string()
    .optional()
    .transform((v) => sanitizeText(v ?? "", MAX_COLLEGE)),
  avatarUrl: z.string().optional().nullable(),
});

export type ProfileStepInput = z.infer<typeof profileStepSchema>;

export const skillsStepSchema = z.object({
  skills: z
    .array(z.string())
    .max(MAX_SKILLS, `Select at most ${MAX_SKILLS} skills.`)
    .transform((list) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const entry of list) {
        const name = sanitizeText(entry, 40);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue; // duplicate skills are dropped, not rejected
        seen.add(key);
        out.push(name);
      }
      return out;
    }),
});

/**
 * The social step contract.
 *
 * Hosts are pinned for the platforms that have one, so a LinkedIn field can
 * only ever hold a linkedin.com link. Portfolio/website stay free-form but must
 * still be real http(s) URLs. Every field is optional.
 *
 * Output shape: each field becomes `{ value, url, error }` — callers decide
 * whether a non-null `error` is fatal (the API route collects them and returns
 * the first).
 */
const optionalHostUrl = (host: string | null, label: string) =>
  z
    .string()
    .optional()
    .transform((v) => validateUrl(v, host ? { requiredHost: host, label } : { label }));

export const socialStepSchema = z.object({
  linkedin: optionalHostUrl("linkedin.com", "LinkedIn"),
  github: optionalHostUrl("github.com", "GitHub"),
  twitter: optionalHostUrl("x.com", "X"),
  portfolio: optionalHostUrl(null, "Portfolio"),
  website: optionalHostUrl(null, "Website"),
  email: z
    .string()
    .optional()
    .transform((v) => validateOptionalEmail(v)),
});

export const projectSchema = z.object({
  name: z
    .string()
    .transform((v) => sanitizeText(v, 80))
    .refine((v) => v.length >= 1, "Project name is required."),
  description: z
    .string()
    .optional()
    .transform((v) => sanitizeMultiline(v ?? "", MAX_PROJECT_DESC)),
  techStack: z
    .array(z.string())
    .optional()
    .transform((list) =>
      (list ?? [])
        .map((t) => sanitizeText(t, 30))
        .filter(Boolean)
        .slice(0, MAX_PROJECT_TECH)
    ),
  githubUrl: z.string().optional(),
  liveUrl: z.string().optional(),
  imageUrl: z.string().optional(),
});

/**
 * Legacy handle-only connect payload. Kept so existing callers keep working;
 * new code should use `platformLinkSchema`, which also accepts a profile URL.
 */
export const platformConnectSchema = z.object({
  platform: z.enum(PLATFORM_KEYS),
  username: z
    .string()
    .transform((v) => sanitizeText(v, 60))
    .refine((v) => v.length >= 1, "Username is required."),
});

/**
 * Everything a user can save a link for: the six coding platforms plus the two
 * link-only profile fields. LinkedIn and portfolio live on the profile row, and
 * are never presented as synchronized integrations.
 */
export const LINK_TARGET_KEYS = [
  ...PLATFORM_KEYS,
  "linkedin",
  "portfolio",
] as const;

export type LinkTargetKey = (typeof LINK_TARGET_KEYS)[number];

/**
 * One platform connect / link payload.
 *
 * `input` is a handle OR a profile URL. It is deliberately NOT run through
 * `sanitizeText`: that would trim a too-long value into a valid-looking one and
 * hand the user a different handle than they typed. Length is validated here
 * and the URL/handle parsing happens in `resolvePlatformInput`.
 */
export const platformLinkSchema = z.object({
  platform: z.enum(LINK_TARGET_KEYS),
  input: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length >= 1, "Enter your username or your profile URL.")
    .refine(
      (v) => v.length <= 200,
      "That is longer than a username or profile URL should be."
    ),
});

/** Turn a Zod error into a single human-readable, user-safe message. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? "That value doesn't look right.";
}

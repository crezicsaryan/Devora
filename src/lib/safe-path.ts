/**
 * Internal redirect targets.
 *
 * A `?next=` value that arrives from the browser is only ever safe to hand to
 * `new URL(value, origin)` when it is a real in-app path. The naive test
 * `value.startsWith("/")` is not enough: `//evil.com` also starts with a slash,
 * and `new URL("//evil.com", "https://app.example")` resolves to
 * `https://evil.com` — an open redirect. Backslashes are rejected too, because
 * some URL parsers normalise `\` to `/`.
 *
 * Same rule the auth routes apply inline; kept here so the GitHub handshake
 * validates its `next` identically in every place it reads one.
 */
export function safeNextPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}

import { createBrowserClient } from "@supabase/ssr";

export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Map an unexpected auth failure — dead project URL, DNS failure, paused
 * project, CORS — to a message the user can act on, instead of failing
 * silently (which looked like "the button does nothing").
 */
const NETWORK_ERROR_RE =
  /failed to fetch|networkerror|load failed|fetch failed|network request failed|err_name_not_resolved|dns/i;

const OFFLINE_HINT =
  "Can't reach the auth server. Check that NEXT_PUBLIC_SUPABASE_URL in devora/.env.local points to a live Supabase project, then restart the dev server.";

/** Wrap a caught exception thrown out of an auth call. */
export function describeAuthFailure(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  return describeAuthMessage(raw);
}

/** Upgrade the message from a resolved Supabase `{ error }` result. */
export function describeAuthMessage(message: string): string {
  if (NETWORK_ERROR_RE.test(message)) return OFFLINE_HINT;
  return message || "Something went wrong. Please try again.";
}

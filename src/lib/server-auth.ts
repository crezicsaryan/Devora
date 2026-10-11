/**
 * Server-side authentication for API route handlers.
 *
 * Every private route calls `requireUser()`. There is no route in this app
 * that reads user data without going through it, and no route accepts a user
 * id from the request body — the id always comes from the verified session.
 */

import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { ensureProfile } from "@/lib/db/repository";

export type AuthedUser = {
  id: string;
  email: string | null;
  name: string;
  /** OAuth avatar (e.g. Google picture) when the provider supplies one. */
  avatarUrl: string | null;
};

export class UnauthorizedError extends Error {
  constructor(message = "You need to be signed in.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Resolve the signed-in user from the request cookies.
 *
 * Supabase's `getUser()` validates the JWT with the auth server, so a forged
 * or expired cookie cannot produce a user here.
 */
export async function getSessionUser(): Promise<AuthedUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  // Use the deprecated CookieMethodsServerDeprecated API (get/set) which
  // correctly handles multi-session cookies (sb-<project>-auth-token.0/1).
  // The newer getAll/setAll API has a bug with this format.
  const supabase = createServerClient(url, key, {
    cookies: {
      get(name: string) {
        const cookie = cookieStore.get(name);
        return cookie?.value ?? undefined;
      },
      set(name: string, value: string, options) {
        // Route handlers can set cookies; a failure here is non-fatal because
        // the proxy refreshes the session on the next navigation.
        try {
          cookieStore.set(name, value, options);
        } catch {
          /* read-only context */
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name) ||
    user.email?.split("@")[0] ||
    "Developer";

  // Google (and other OIDC providers) put the profile picture in the JWT
  // metadata. It is used once, as the INITIAL avatar for a brand-new profile —
  // a photo the user uploads to Devora storage afterwards always wins and is
  // never overwritten by this value.
  const oauthAvatar =
    (typeof meta?.avatar_url === "string" && meta.avatar_url.startsWith("https://") && meta.avatar_url) ||
    (typeof meta?.picture === "string" && meta.picture.startsWith("https://") && meta.picture) ||
    null;

  return { id: user.id, email: user.email ?? null, name, avatarUrl: oauthAvatar };
}

/** Throwing variant for route handlers. */
export async function requireUser(): Promise<AuthedUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Throwing variant that also guarantees a profiles row exists. */
export async function requireProfileUser() {
  const user = await requireUser();
  // The OAuth avatar only applies at first creation — ensureProfile never
  // touches an existing row, so a manually uploaded photo always wins.
  await ensureProfile(user.id, user.email, user.name, user.avatarUrl);
  return user;
}

/** Standard JSON error response; never leaks internals. */
export function errorResponse(error: unknown, fallback = "Something went wrong.") {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  console.error("[devora/api]", error);
  const message = error instanceof Error ? error.message : fallback;
  // Surface validation-style messages, hide anything that smells internal.
  const safe =
    /(already taken|required|invalid|must |too (large|long)|not configured)/i.test(
      message
    )
      ? message
      : fallback;
  return NextResponse.json({ error: safe }, { status: 400 });
}

export function okResponse<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

/**
 * Proxy (Next.js 16's replacement for `middleware.ts`).
 *
 * Responsibilities, in order:
 *   1. Refresh the Supabase session cookie on every request.
 *   2. Bounce signed-out users away from private routes.
 *   3. Route signed-in users to the right place based on onboarding state.
 *
 * This is a *coarse* gate only. The authoritative onboarding check lives in the
 * database and is enforced again by `/dashboard`'s server component and by
 * `/api/session`; the proxy never treats a cookie as proof of completion.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that require a session. */
const PROTECTED_PREFIXES = ["/app", "/dashboard", "/profile/create"];
/** Auth screens a signed-in user should not see again. */
const AUTH_ROUTES = ["/login", "/signup"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Auth not configured yet — let the app render its own "not configured" UI.
  if (!url || !key) return supabaseResponse;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser().
  // A mistake here can make sessions randomly drop.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // 1. Signed out on a private route -> login, remembering where they wanted to go.
  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Signed in, sitting on an auth screen -> send them onward.
  //    /auth/continue asks the database where this user belongs: a completed
  //    profile goes straight to /dashboard, an unfinished one to
  //    /profile/create. No completed user is ever re-shown onboarding.
  if (user && AUTH_ROUTES.includes(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/continue";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/app/:path*", "/dashboard/:path*", "/profile/create", "/login", "/signup"],
};

/**
 * GET /auth/continue — the post-authentication router.
 *
 * Every sign-in path (password, OAuth, email verification) funnels through
 * here so the "onboarding or dashboard?" decision is made once, on the server,
 * from the database — never from a cookie, localStorage, or the client's guess.
 *
 * The decision is delegated to /api/session, whose `onboardingCompleted` value
 * comes straight from `public.profiles`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieMethodsServerDeprecated } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const explicitNext = searchParams.get("next");

  // The caller may insist on a destination (e.g. a deep link). Honour it, but
  // only if it is a same-site path — never an absolute URL.
  if (explicitNext && explicitNext.startsWith("/") && !explicitNext.startsWith("//")) {
    return NextResponse.redirect(`${origin}${explicitNext}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.redirect(`${origin}/dashboard`);

  // Use the deprecated CookieMethodsServerDeprecated API (get/set) which
  // correctly handles multi-session cookies (sb-<project>-auth-token.0/1).
  // The newer getAll/setAll API has a bug with this format.
  const cookies: CookieMethodsServerDeprecated = {
    get(name: string) {
      return request.cookies.get(name)?.value ?? undefined;
    },
    set(name: string, value: string, options) {
      // Cookies are set on the response after auth state changes.
      // The response is built up via setAll elsewhere; this set is for
      // incremental cookie updates during the auth flow.
      const response = NextResponse.next({ request });
      response.cookies.set(name, value, options);
    },
  };

  const supabase = createServerClient(url, key, { cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(`${origin}/login`);

  // Read the authoritative flag. If the database is unreachable we default to
  // the dashboard rather than trapping the user in onboarding.
  let destination = "/dashboard";
  try {
    const { hasDatabase } = await import("@/lib/db/prisma");
    if (hasDatabase()) {
      const { isOnboardingComplete } = await import("@/lib/db/repository");
      const done = await isOnboardingComplete(user.id);
      destination = done ? "/dashboard" : "/profile/create";
    }
  } catch {
    destination = "/dashboard";
  }

  const response = NextResponse.next({ request });
  const redirect = NextResponse.redirect(`${origin}${destination}`);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

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

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(`${origin}/login`);

  // Read the authoritative flag. If the database is unreachable we default to
  // the dashboard rather than trapping the user in onboarding.
  let destination = "/dashboard";
  try {
    const { hasDatabase } = await import("@/lib/db/pool");
    if (hasDatabase()) {
      const { isOnboardingComplete } = await import("@/lib/db/repository");
      const done = await isOnboardingComplete(user.id);
      destination = done ? "/dashboard" : "/profile/create";
    }
  } catch {
    destination = "/dashboard";
  }

  const redirect = NextResponse.redirect(`${origin}${destination}`);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

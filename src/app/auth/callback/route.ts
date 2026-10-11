import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieMethodsServerDeprecated } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");

  // Only accept same-site paths as an explicit destination, and fall back to
  // the server-side resolver which knows whether onboarding is finished.
  const next =
    requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/auth/continue";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.redirect(`${origin}/login?error=auth_not_configured`);
  }

  if (code) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.next({ request });
      const redirect = NextResponse.redirect(`${origin}${next}`);
      for (const cookie of response.cookies.getAll()) {
        redirect.cookies.set(cookie);
      }
      return redirect;
    }
  }

  // auth code missing/invalid → back to login
  return NextResponse.redirect(`${origin}/login?error=auth_code_invalid`);
}

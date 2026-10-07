/**
 * GET /api/platforms/github/authorize
 *
 * Starts the GitHub OAuth handshake.
 *
 * Security properties:
 *   - Requires a signed-in Devora user; the state token is bound to that user.
 *   - The state token is random, single-use and stored server-side with a
 *     10-minute expiry, which blocks CSRF on the callback.
 *   - The client secret never leaves the server; the browser only ever sees a
 *     redirect to github.com.
 */

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db/pool";
import { errorResponse, requireUser } from "@/lib/server-auth";
import {
  buildAuthorizeUrl,
  githubOAuthConfigured,
} from "@/lib/platforms/adapters/github";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();

    if (!githubOAuthConfigured()) {
      return NextResponse.redirect(
        new URL(
          "/profile/create?platform_error=github_not_configured",
          request.nextUrl.origin
        )
      );
    }

    const state = randomBytes(32).toString("hex");
    const next = request.nextUrl.searchParams.get("next") ?? "/profile/create";

    await query(
      `insert into public.oauth_states (state, user_id, provider, next, expires_at)
       values ($1, $2, 'github', $3, now() + interval '10 minutes')`,
      [state, user.id, next.startsWith("/") ? next : "/profile/create"]
    );

    // Opportunistic cleanup of expired handshakes.
    await query(`delete from public.oauth_states where expires_at < now()`).catch(
      () => undefined
    );

    const redirectUri = new URL("/api/platforms/github/callback", request.nextUrl.origin)
      .toString();

    return NextResponse.redirect(buildAuthorizeUrl(state, redirectUri));
  } catch (error) {
    return errorResponse(error, "Could not start GitHub authorization.");
  }
}

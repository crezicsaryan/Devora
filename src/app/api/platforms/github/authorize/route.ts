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
import { prisma } from "@/lib/db/prisma";
import { safeNextPath } from "@/lib/safe-path";
import { errorResponse, requireUser } from "@/lib/server-auth";
import {
  buildAuthorizeUrl,
  githubOAuthConfigured,
} from "@/lib/platforms/adapters/github";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();

    // Validated before anything else, so the not-configured path can send the
    // user back to the page they started from instead of a hardcoded one.
    const next = safeNextPath(
      request.nextUrl.searchParams.get("next"),
      "/profile/create"
    );

    if (!githubOAuthConfigured()) {
      const callback = new URL(
        "/api/platforms/github/callback",
        request.nextUrl.origin
      ).toString();
      const url = new URL(next, request.nextUrl.origin);
      url.searchParams.set("platform_error", "github_not_configured");
      // Names the exact missing variables and the exact callback URL, so the
      // required configuration is never a guess.
      url.searchParams.set(
        "platform_message",
        `GitHub OAuth is not configured: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are missing. Callback URL: ${callback}`
      );
      return NextResponse.redirect(url);
    }

    const state = randomBytes(32).toString("hex");

    await prisma.oauthState.create({
      data: {
        state,
        user_id: user.id,
        provider: "github",
        next,
        expires_at: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // Opportunistic cleanup of expired handshakes.
    await prisma.oauthState
      .deleteMany({ where: { expires_at: { lt: new Date() } } })
      .catch(() => undefined);

    const redirectUri = new URL("/api/platforms/github/callback", request.nextUrl.origin)
      .toString();

    return NextResponse.redirect(buildAuthorizeUrl(state, redirectUri));
  } catch (error) {
    return errorResponse(error, "Could not start GitHub authorization.");
  }
}

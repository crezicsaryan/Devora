/**
 * GET /api/public/[username] — a Devora profile as the public sees it.
 *
 * Delegates to `loadPublicProfile`, which reads the profile's visibility map
 * and only includes fields explicitly marked public. Bio, location, email,
 * socials, skills, platforms and projects each have their own switch, and
 * nothing else is ever included.
 *
 * (On Postgres this was the `devora_public_profile()` SQL function; MySQL has
 * no equivalent, so the same projection lives in src/lib/db/public-profile.ts.)
 */

import { loadPublicProfile } from "@/lib/db/public-profile";
import { errorResponse, okResponse } from "@/lib/server-auth";
import { normalizeUsername } from "@/lib/validation";
import type { RouteParams } from "@/lib/route-params";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: RouteParams<{ username: string }>
) {
  try {
    const { username } = await ctx.params;
    const normalized = normalizeUsername(decodeURIComponent(username));

    if (!normalized) {
      return errorResponse(new Error("Username is required."), "Username is required.");
    }

    const profile = await loadPublicProfile(normalized);
    if (!profile) {
      return okResponse({ found: false }, { status: 404 });
    }

    return okResponse({ found: true, profile });
  } catch (error) {
    return errorResponse(error, "Could not load that profile.");
  }
}

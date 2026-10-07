/**
 * GET /api/public/[username] — a Devora profile as the public sees it.
 *
 * Delegates to the `devora_public_profile` Postgres function, which reads the
 * profile's visibility map and only includes fields explicitly marked public.
 * Bio, location, email, socials, skills, platforms and projects each have their
 * own switch, and nothing else is ever included.
 */

import { queryOne } from "@/lib/db/pool";
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

    const row = await queryOne<{ devora_public_profile: unknown }>(
      `select public.devora_public_profile($1) as devora_public_profile`,
      [normalized]
    );

    const profile = row?.devora_public_profile ?? null;
    if (!profile || (typeof profile === "object" && Object.keys(profile).length === 0)) {
      return okResponse({ found: false }, { status: 404 });
    }

    return okResponse({ found: true, profile });
  } catch (error) {
    return errorResponse(error, "Could not load that profile.");
  }
}

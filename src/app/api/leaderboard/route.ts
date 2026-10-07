/**
 * GET /api/leaderboard?q= — public ranking by solved count.
 *
 * Reads only visible, public profile fields. The caller is flagged so their own
 * row can be highlighted.
 */

import type { NextRequest } from "next/server";
import { getLeaderboard } from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const search = request.nextUrl.searchParams.get("q") ?? undefined;
    const rows = await getLeaderboard(user.id, { search });
    return okResponse({ rows });
  } catch (error) {
    return errorResponse(error, "Could not load the leaderboard.");
  }
}

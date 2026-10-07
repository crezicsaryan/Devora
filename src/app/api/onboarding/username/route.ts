/**
 * GET /api/onboarding/username?u=aryan
 *
 * Real-time availability for the onboarding form. Deliberately usable by a
 * signed-out visitor so the check works before the session settles, and it
 * only ever returns a boolean plus a message — no account data leaks.
 */

import type { NextRequest } from "next/server";
import { checkUsername } from "@/lib/db/repository";
import { errorResponse, getSessionUser, okResponse } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("u") ?? "";
  try {
    const me = await getSessionUser();
    const result = await checkUsername(raw, me?.id);
    return okResponse(result);
  } catch (error) {
    return errorResponse(error, "Could not check that username right now.");
  }
}

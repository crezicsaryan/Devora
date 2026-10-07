/**
 * GET /api/platforms/verify?platform=leetcode&u=handle
 *
 * Cheap existence check for the onboarding UI, so the user gets feedback
 * before they press Connect. Delegates to the same adapter that will perform
 * the real sync — one code path, not two.
 */

import type { NextRequest } from "next/server";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import { getAdapter } from "@/lib/platforms/registry";
import { PlatformError } from "@/lib/platforms/types";
import { PLATFORM_KEYS, type PlatformKey } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireProfileUser();

    const platform = request.nextUrl.searchParams.get("platform") as PlatformKey | null;
    const username = request.nextUrl.searchParams.get("u") ?? "";

    if (!platform || !PLATFORM_KEYS.includes(platform)) {
      return errorResponse(new Error("Unknown platform."), "Unknown platform.");
    }
    if (username.trim().length < 1) {
      return okResponse({ exists: false, message: "Enter your username." });
    }

    const adapter = getAdapter(platform);
    if (adapter.authType === "oauth") {
      return okResponse({
        exists: false,
        message: "This platform connects through authorization.",
        requiresOAuth: true,
      });
    }

    const verdict = await adapter.verify(username.trim());
    return okResponse(verdict);
  } catch (error) {
    if (error instanceof PlatformError) {
      return okResponse({ exists: false, message: error.message });
    }
    return errorResponse(error, "Could not verify that username.");
  }
}

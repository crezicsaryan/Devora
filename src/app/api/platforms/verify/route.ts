/**
 * GET /api/platforms/verify?platform=leetcode&u=handle-or-url
 *
 * Cheap, classified existence check for the platforms UI, so the user gets an
 * answer before they press Connect. Delegates to the same adapter that will
 * perform the real sync — one code path, not two.
 *
 * The response is a `PlatformVerifyResult`, never a bare boolean: the caller
 * needs to know whether the account is missing, or whether we simply could not
 * check. Returning `exists: false` for a timeout is what made every platform
 * look like it was rejecting valid usernames.
 */

import type { NextRequest } from "next/server";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import { getAdapter } from "@/lib/platforms/registry";
import { resolvePlatformInput } from "@/lib/profile-links";
import type { PlatformVerifyResult } from "@/lib/types";
import { PLATFORM_BY_KEY } from "@/lib/types";
import { PLATFORM_KEYS, type PlatformKey } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireProfileUser();

    const platform = request.nextUrl.searchParams.get("platform") as PlatformKey | null;
    const raw =
      request.nextUrl.searchParams.get("u") ??
      request.nextUrl.searchParams.get("input") ??
      "";

    if (!platform || !PLATFORM_KEYS.includes(platform)) {
      return errorResponse(new Error("Unknown platform."), "Unknown platform.");
    }

    const meta = PLATFORM_BY_KEY[platform];
    const trimmed = raw.trim();
    if (!trimmed) {
      return errorResponse(
        new Error("Enter your username or your profile URL."),
        "Enter your username or your profile URL."
      );
    }

    const resolved = resolvePlatformInput(platform, trimmed);
    if (resolved.error || !resolved.username) {
      return errorResponse(
        new Error(resolved.error ?? "That profile link is not valid."),
        resolved.error ?? "That profile link is not valid."
      );
    }

    const adapter = getAdapter(platform);
    const verdict = await adapter.verify(resolved.username);

    // Spread into a NEW object rather than mutating the verdict: an adapter is
    // free to return a cached value, and writing the caller's handle into it
    // would make the next request see this one's data.
    const result: PlatformVerifyResult = {
      ...verdict,
      // Prefer the handle/URL the platform itself reported; otherwise fall back
      // to what we resolved from the user's input.
      username: verdict.username ?? resolved.username,
      profileUrl: verdict.profileUrl ?? resolved.url,
    };

    return okResponse({ ...result, linkOnly: meta.linkOnly });
  } catch (error) {
    return errorResponse(error, "Could not verify that profile.");
  }
}

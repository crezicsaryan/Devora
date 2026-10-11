/**
 * DELETE /api/platforms/[platform] — disconnect a platform.
 *
 * Removes the linked account, its OAuth tokens (including GitHub's), its
 * statistics and its activity series, then recomputes the dashboard aggregates
 * so the numbers immediately reflect reality.
 */

import type { NextRequest } from "next/server";
import {
  computeProfileCompletion,
  getConnectedPlatforms,
  markAccountDisconnected,
  updateProfile,
} from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import type { RouteParams } from "@/lib/route-params";
import { PLATFORM_KEYS, type PlatformKey } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  ctx: RouteParams<{ platform: string }>
) {
  try {
    const user = await requireProfileUser();
    const { platform } = await ctx.params;

    // LinkedIn and the personal website are plain profile links — clearing the
    // field is the whole operation, and there is no account row to remove.
    if (platform === "linkedin" || platform === "portfolio") {
      await updateProfile(
        user.id,
        platform === "linkedin"
          ? { socials: { linkedin: "" } }
          : { socials: { portfolio: "" } }
      );
      const completion = await computeProfileCompletion(user.id);
      return okResponse({
        ok: true,
        platform,
        connectionStatus: "disconnected",
        platforms: [],
        completion,
      });
    }

    if (!PLATFORM_KEYS.includes(platform as PlatformKey)) {
      return errorResponse(new Error("Unknown platform."), "Unknown platform.");
    }

    await markAccountDisconnected(user.id, platform as PlatformKey);

    const [platforms, completion] = await Promise.all([
      getConnectedPlatforms(user.id),
      computeProfileCompletion(user.id),
    ]);

    return okResponse({
      ok: true,
      platform,
      connectionStatus: "disconnected",
      platforms: platforms.map((p) => ({
        platform: p.account.platform,
        username: p.account.username,
        status: p.account.connectionStatus,
      })),
      completion,
    });
  } catch (error) {
    return errorResponse(error, "Could not disconnect that platform.");
  }
}

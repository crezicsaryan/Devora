/**
 * GET  /api/platforms               — connection state for every platform
 * POST /api/platforms               — connect a public-data platform by handle
 *
 * The browser never calls an external platform. This route resolves the handle
 * through the platform's adapter, and only stores the account once the adapter
 * confirms it exists.
 */

import type { NextRequest } from "next/server";
import {
  computeProfileCompletion,
  getConnectedPlatforms,
  upsertPlatformAccount,
} from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import { getAdapter } from "@/lib/platforms/registry";
import { PlatformError } from "@/lib/platforms/types";
import { firstIssue, platformConnectSchema } from "@/lib/validation";
import { evaluateAchievements } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireProfileUser();
    const platforms = await getConnectedPlatforms(user.id);
    return okResponse({
      platforms: platforms.map((p) => ({
        platform: p.account.platform,
        username: p.account.username,
        status: p.account.connectionStatus,
        syncStatus: p.account.syncStatus,
        syncError: p.account.syncError,
        lastSyncedAt: p.account.lastSyncedAt,
        profileUrl: p.account.profileUrl,
      })),
    });
  } catch (error) {
    return errorResponse(error, "Could not load connected platforms.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const body = (await request.json()) as unknown;

    const parsed = platformConnectSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(new Error(firstIssue(parsed.error)), "Check the username.");
    }
    const { platform, username } = parsed.data;

    const adapter = getAdapter(platform);

    if (adapter.authType === "oauth") {
      return errorResponse(
        new Error("This platform connects through authorization, not a username."),
        "Use the Connect button instead."
      );
    }

    // Confirm the handle really exists before storing anything.
    const verdict = await adapter.verify(username);
    if (!verdict.exists) {
      return errorResponse(
        new Error(verdict.message ?? "We could not find that profile."),
        verdict.message ?? "We could not find that profile."
      );
    }

    const identity = await adapter.connect({ userId: user.id, username });
    if (!identity) {
      return errorResponse(new Error("We could not find that profile."), "Profile not found.");
    }

    await upsertPlatformAccount({
      userId: user.id,
      platform,
      username: identity.username,
      externalUserId: identity.externalUserId,
      profileUrl: identity.profileUrl,
      avatarUrl: identity.avatarUrl,
      authType: adapter.authType,
      connectionStatus: "connected",
    });

    const completion = await computeProfileCompletion(user.id);
    await evaluateAchievements(user.id).catch(() => undefined);

    return okResponse({
      ok: true,
      platform,
      username: identity.username,
      profileUrl: identity.profileUrl,
      connectionStatus: "connected",
      syncStatus: "idle",
      completion,
    });
  } catch (error) {
    if (error instanceof PlatformError) {
      return errorResponse(new Error(error.message), error.message);
    }
    return errorResponse(error, "Could not connect that platform.");
  }
}

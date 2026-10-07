/**
 * POST /api/platforms/[platform]/sync — re-sync one platform.
 *
 * The sync runs synchronously here (not in the background) because the user
 * explicitly asked for it and expects the fresh numbers when the spinner
 * stops. A failure is reported with the platform's own reason, never masked.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getConnectedPlatforms,
  getSyncJobs,
} from "@/lib/db/repository";
import { errorResponse, requireProfileUser } from "@/lib/server-auth";
import { runPlatformSync } from "@/lib/platforms/sync-runner";
import { PLATFORM_KEYS, type PlatformKey } from "@/lib/validation";
import type { RouteParams } from "@/lib/route-params";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  ctx: RouteParams<{ platform: string }>
) {
  try {
    const user = await requireProfileUser();
    const { platform } = await ctx.params;

    if (!PLATFORM_KEYS.includes(platform as PlatformKey)) {
      return errorResponse(new Error("Unknown platform."), "Unknown platform.");
    }

    const outcome = await runPlatformSync(user.id, platform as PlatformKey);
    const [platforms, jobs] = await Promise.all([
      getConnectedPlatforms(user.id),
      getSyncJobs(user.id, 10),
    ]);

    const current = platforms.find((p) => p.account.platform === platform);

    return NextResponse.json(
      {
        ok: outcome.ok,
        platform,
        error: outcome.ok ? null : outcome.error,
        connectionStatus: current?.account.connectionStatus ?? "error",
        syncStatus: current?.account.syncStatus ?? (outcome.ok ? "ok" : "failed"),
        lastSyncedAt: current?.account.lastSyncedAt ?? null,
        jobs: jobs.filter((j) => j.platform === platform).slice(0, 3),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error, "Could not sync that platform.");
  }
}

/**
 * POST /api/onboarding/complete
 *
 * The only route that can set onboarding_completed = true.
 *
 * It re-verifies the required work server-side (identity + at least a display
 * name and username), then queues the initial sync and processes it. Onboarding
 * never fails because a platform sync failed — failures are stored on the
 * account row and surfaced as "Sync failed — Retry" on the dashboard.
 */

import { after } from "next/server";
import { queryOne } from "@/lib/db/pool";
import {
  computeProfileCompletion,
  createNotification,
  getProfile,
  getSkills,
  markProfileComplete,
  recordActivityEvent,
  recomputeAggregates,
} from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import { queueAndProcessAll } from "@/lib/platforms/sync-runner";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireProfileUser();
    const profile = await getProfile(user.id);

    if (!profile) {
      return errorResponse(new Error("Profile is missing."), "Could not find your profile.");
    }

    // Server-side gate. A client claiming it finished onboarding is not
    // evidence — the profile must genuinely have all four required fields
    // (name, username, college, at least one skill) before the flag flips.
    if (!profile.display_name?.trim()) {
      return errorResponse(
        new Error("Display name is required."),
        "Add your display name first."
      );
    }
    if (!profile.display_username?.trim()) {
      return errorResponse(
        new Error("Username is required."),
        "Claim a username first."
      );
    }
    if (!profile.college?.trim()) {
      return errorResponse(
        new Error("College is required."),
        "Add your college first."
      );
    }
    const skills = await getSkills(user.id);
    if (skills.length === 0) {
      return errorResponse(
        new Error("At least one skill is required."),
        "Add at least one skill first."
      );
    }

    const alreadyComplete = profile.onboarding_completed;

    if (!alreadyComplete) {
      // The single, SQL-gated completion write — same rule every sign-in path
      // funnels through.
      const completed = await markProfileComplete(user.id);
      if (!completed) {
        const message =
          "Your name, username, college and at least one skill are required to finish.";
        return errorResponse(new Error(message), message);
      }

      await recordActivityEvent({
        userId: user.id,
        kind: "system",
        title: "Welcome to Devora",
        detail: "Your developer profile is live.",
        href: "/dashboard",
      });
      await createNotification({
        userId: user.id,
        kind: "system",
        title: "Your Devora profile is ready",
        body: "You can edit everything from Settings at any time.",
        href: "/dashboard/profile",
      });
    }

    const completion = await computeProfileCompletion(user.id);
    await recomputeAggregates(user.id);

    // The initial sync runs after the response is sent, so the redirect is
    // never blocked on external platform latency (PRD section 10).
    after(async () => {
      try {
        await queueAndProcessAll(user.id);
      } catch (error) {
        console.error("[devora/onboarding] initial sync failed", error);
      }
    });

    const platformCount = await queryOne<{ n: string }>(
      `select count(*)::text as n from public.platform_accounts
        where user_id = $1 and connection_status = 'connected'`,
      [user.id]
    );

    return okResponse({
      ok: true,
      onboardingCompleted: true,
      completion,
      syncingPlatforms: Number(platformCount?.n ?? 0),
    });
  } catch (error) {
    return errorResponse(error, "Could not finish onboarding.");
  }
}

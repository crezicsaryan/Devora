/**
 * GET /api/session — post-authentication routing decision.
 *
 * The single source of truth for "where should this user land right now?".
 *
 * The answer is derived from the database (profiles.onboarding_completed),
 * never from localStorage. Called by the client straight after a successful
 * sign-in or email verification, and by the profile creation page when it needs
 * to know whether the user is already finished.
 */

import { getProfile } from "@/lib/db/repository";
import { errorResponse, getSessionUser, okResponse } from "@/lib/server-auth";
import { hasDatabase } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return okResponse({ authenticated: false, onboardingCompleted: false, redirectTo: "/login" });
    }

    if (!hasDatabase()) {
      // Auth works but the onboarding schema is not reachable. Send the user to
      // the existing dashboard rather than a page that cannot load.
      return okResponse({
        authenticated: true,
        onboardingCompleted: true,
        redirectTo: "/dashboard",
        // Name comes from the verified session (OAuth metadata / email), not
        // the database, so the greeting still works while the DB is down.
        name: user.name,
        avatarUrl: user.avatarUrl,
        warning: "database_unavailable",
      });
    }

    const profile = await getProfile(user.id);
    const onboardingCompleted = profile?.onboarding_completed === true;

    return okResponse({
      authenticated: true,
      name: user.name,
      avatarUrl: user.avatarUrl,
      onboardingCompleted,
      hasUsername: Boolean(profile?.display_username),
      onboardingStep: profile?.onboarding_step ?? 1,
      // Incomplete -> the single profile creation page. Complete -> the dashboard.
      redirectTo: onboardingCompleted ? "/dashboard" : "/profile/create",
    });
  } catch (error) {
    return errorResponse(error, "Could not resolve your session.");
  }
}

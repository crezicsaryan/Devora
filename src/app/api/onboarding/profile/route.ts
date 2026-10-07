/**
 * Onboarding draft persistence.
 *
 * GET   /api/onboarding/profile  -> current draft + completion flags
 * PATCH /api/onboarding/profile  -> save step 1 (identity)
 *
 * Server-side validation and username claiming both happen here. The client
 * cannot mark onboarding complete through this route — only
 * POST /api/onboarding/complete can, and only after the required steps exist.
 */

import type { NextRequest } from "next/server";
import {
  claimUsername,
  computeProfileCompletion,
  getProfile,
  getSkills,
  releaseUsername,
  updateProfile,
} from "@/lib/db/repository";
import {
  errorResponse,
  okResponse,
  requireProfileUser,
} from "@/lib/server-auth";
import { firstIssue, profileStepSchema, validateAvatar } from "@/lib/validation";
import { getConnectedPlatforms } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireProfileUser();
    const [profile, skills, platforms] = await Promise.all([
      getProfile(user.id),
      getSkills(user.id),
      getConnectedPlatforms(user.id),
    ]);
    const completion = await computeProfileCompletion(user.id);

    return okResponse({
      profile: {
        displayName: profile?.display_name ?? "",
        username: profile?.display_username ?? "",
        college: profile?.college ?? "",
        bio: profile?.bio ?? "",
        developerRole: profile?.developer_role ?? "",
        location: profile?.location ?? "",
        avatarUrl: profile?.avatar_url ?? "",
        email: profile?.email ?? user.email ?? "",
        socials: {
          linkedin: profile?.linkedin_url ?? "",
          github: profile?.portfolio_url ?? "",
          twitter: profile?.twitter_url ?? "",
          portfolio: profile?.portfolio_url ?? "",
          website: profile?.website ?? "",
        },
      },
      skills,
      platforms: platforms.map((p) => ({
        platform: p.account.platform,
        username: p.account.username,
        status: p.account.connectionStatus,
      })),
      onboardingCompleted: profile?.onboarding_completed ?? false,
      onboardingStep: profile?.onboarding_step ?? 1,
      completion,
    });
  } catch (error) {
    return errorResponse(error, "Could not load your onboarding draft.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const body = (await request.json()) as Record<string, unknown>;

    const parsed = profileStepSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(new Error(firstIssue(parsed.error)), "Check the highlighted fields.");
    }
    const data = parsed.data;

    // College is a required profile field. The edit form always sends it, so
    // an empty value here means the user tried to clear it — never allowed
    // while the field is mandatory (spec §3/§12).
    if (body.college !== undefined && !data.college) {
      const message = "College is required.";
      return errorResponse(new Error(message), message);
    }

    const avatar = validateAvatar(body.avatarUrl);
    if (avatar.error) {
      return errorResponse(new Error(avatar.error), "Check your profile photo.");
    }

    // Re-check availability server-side: the frontend check is only a hint.
    const current = await getProfile(user.id);
    const currentUsername = current?.display_username ?? null;
    const usernameChanged = currentUsername !== data.username;

    if (usernameChanged) {
      const claim = await claimUsername(user.id, data.username);
      if (!claim.ok) return errorResponse(new Error(claim.error), claim.error);
      // The old handle is released only after the new one is secured.
      await releaseUsername(user.id).catch(() => undefined);
      await claimUsername(user.id, data.username);
    }

    await updateProfile(user.id, {
      displayName: data.displayName,
      // Only write college when the request carried it, so a payload from an
      // older client cannot wipe the field.
      ...(body.college !== undefined ? { college: data.college } : {}),
      bio: data.bio,
      developerRole: data.developerRole,
      location: data.location,
      avatarUrl: avatar.value,
      username: data.username,
      usernameNormalized: data.username.toLowerCase(),
    });

    const completion = await computeProfileCompletion(user.id);
    return okResponse({ ok: true, username: data.username, completion });
  } catch (error) {
    return errorResponse(error, "Could not save your profile.");
  }
}

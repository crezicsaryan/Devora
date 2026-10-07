/**
 * Settings.
 *
 * GET   /api/settings  — visibility + completion breakdown for the Settings page
 * PATCH /api/settings  — visibility toggles
 *
 * Only the owner can read or change these; the user id always comes from the
 * session, never from the request.
 */

import type { NextRequest } from "next/server";
import {
  computeProfileCompletion,
  getProfile,
  updateProfile,
} from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import { DEFAULT_VISIBILITY, type Visibility } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireProfileUser();
    const [profile, completion] = await Promise.all([
      getProfile(user.id),
      computeProfileCompletion(user.id),
    ]);

    return okResponse({
      visibility: (profile?.visibility as Visibility) ?? DEFAULT_VISIBILITY,
      email: profile?.email ?? user.email ?? "",
      username: profile?.display_username ?? "",
      completion,
    });
  } catch (error) {
    return errorResponse(error, "Could not load settings.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const body = (await request.json()) as { visibility?: Partial<Visibility> };

    const allowed: (keyof Visibility)[] = [
      "avatar",
      "bio",
      "role",
      "location",
      "skills",
      "platforms",
      "socials",
      "projects",
      "email",
    ];

    const patch: Partial<Visibility> = {};
    for (const key of allowed) {
      const value = body.visibility?.[key];
      if (typeof value === "boolean") patch[key] = value;
    }

    if (Object.keys(patch).length === 0) {
      return errorResponse(new Error("Nothing to update."), "Nothing to update.");
    }

    await updateProfile(user.id, { visibility: patch });
    const profile = await getProfile(user.id);
    return okResponse({
      ok: true,
      visibility: (profile?.visibility as Visibility) ?? DEFAULT_VISIBILITY,
    });
  } catch (error) {
    return errorResponse(error, "Could not save your visibility settings.");
  }
}

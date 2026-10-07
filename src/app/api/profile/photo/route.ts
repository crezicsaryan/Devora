/**
 * POST   /api/profile/photo — upload a cropped profile photo to object storage
 * DELETE /api/profile/photo — remove the current photo
 *
 * The database stores ONLY the resulting public URL (profiles.avatar_url) —
 * never the image binary. The client crops/resizes in the browser and sends a
 * compact data URL; this route validates it server-side (MIME type, size),
 * uploads it to storage under profiles/{userId}/, and updates the profile.
 *
 * Failure semantics (spec §6/§16): an upload failure never destroys the
 * existing photo — the previous URL stays in the database and the user can
 * simply retry. Old photo objects are cleaned up best-effort after a
 * successful replace.
 */

import type { NextRequest } from "next/server";
import {
  deleteProfilePhotos,
  hasStorage,
  putProfilePhoto,
} from "@/lib/storage";
import { updateProfile, getProfile } from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import { parseDataUrlImage } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Same-origin https path for one user's photo objects. */
function belongsToUser(path: string, userId: string): boolean {
  return path.startsWith(`profiles/${userId}/`);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireProfileUser();

    if (!hasStorage()) {
      return errorResponse(
        new Error("Photo storage is not configured on this server."),
        "Photo upload is not available right now — you can still complete your profile without a photo."
      );
    }

    const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
    const parsed = parseDataUrlImage(body?.image);
    if (!parsed.value) {
      return errorResponse(new Error(parsed.error), parsed.error);
    }

    const previous = (await getProfile(user.id))?.avatar_url ?? null;

    const stored = await putProfilePhoto(user.id, parsed.value);

    await updateProfile(user.id, { avatarUrl: stored.url });

    // Replace succeeded — clean the old object (only ever our own namespace,
    // and never a third-party URL such as a Google avatar).
    if (previous) {
      try {
        const old = new URL(previous).pathname;
        const marker = `/${process.env.DEVORA_STORAGE_BUCKET || "devora-photos"}/`;
        const idx = old.indexOf(marker);
        const oldPath = idx >= 0 ? decodeURIComponent(old.slice(idx + marker.length)) : null;
        if (oldPath && belongsToUser(oldPath, user.id) && oldPath !== stored.path) {
          await deleteProfilePhotos(user.id, stored.path);
        }
      } catch {
        /* previous URL was external (e.g. Google) — nothing to clean up */
      }
    }

    return okResponse({ ok: true, url: stored.url });
  } catch (error) {
    return errorResponse(
      error,
      "Could not upload your photo. Your current photo is unchanged — please try again."
    );
  }
}

export async function DELETE() {
  try {
    const user = await requireProfileUser();
    const previous = (await getProfile(user.id))?.avatar_url ?? null;

    await updateProfile(user.id, { avatarUrl: null });

    if (previous) {
      try {
        const old = new URL(previous).pathname;
        const marker = `/${process.env.DEVORA_STORAGE_BUCKET || "devora-photos"}/`;
        const idx = old.indexOf(marker);
        const oldPath = idx >= 0 ? decodeURIComponent(old.slice(idx + marker.length)) : null;
        if (oldPath && belongsToUser(oldPath, user.id)) {
          await deleteProfilePhotos(user.id);
        }
      } catch {
        /* external URL — nothing to clean up */
      }
    }

    return okResponse({ ok: true });
  } catch (error) {
    return errorResponse(
      error,
      "Could not remove your photo. Please try again."
    );
  }
}

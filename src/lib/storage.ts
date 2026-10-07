/**
 * Server-only object storage for profile photos.
 *
 * Devora's existing storage provider is Supabase Storage (part of the Supabase
 * project the app already uses), so it is the driver here. The design keeps a
 * narrow interface — `putProfilePhoto` / `deleteProfilePhotos` / `hasStorage` —
 * so an S3-compatible driver (STORAGE_ENDPOINT / STORAGE_BUCKET /
 * STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY) can be added later without
 * touching any call site.
 *
 * Rules this module enforces:
 *
 *   - The DATABASE NEVER stores image bytes. Callers receive a public URL and
 *     save only that (profiles/{userId}/profile-photo-<ts>.<ext>).
 *   - Credentials come from environment variables and are read server-side
 *     only ("server-only" import). The service role key must never be exposed
 *     with a NEXT_PUBLIC_ prefix.
 *   - Every object is namespaced under profiles/<userId>/ — a user can never
 *     read or remove another user's photo through this layer.
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = "devora-photos";

export type StoredPhoto = {
  /** Absolute https URL, safe to store in profiles.avatar_url. */
  url: string;
  /** Bucket-relative path, used for later cleanup. */
  path: string;
};

function bucketName(): string {
  return process.env.DEVORA_STORAGE_BUCKET || DEFAULT_BUCKET;
}

/** True when the server has everything it needs to store photos. */
export function hasStorage(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Photo storage is not configured: SUPABASE_SERVICE_ROLE_KEY is missing on the server."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/**
 * Store a validated, already-cropped profile photo.
 *
 * Each upload gets a fresh timestamped key so browsers never serve a stale
 * cached image after "Change photo".
 */
export async function putProfilePhoto(
  userId: string,
  photo: { buffer: Buffer; contentType: string }
): Promise<StoredPhoto> {
  const supabase = adminClient();
  const bucket = bucketName();
  const path = `profiles/${userId}/profile-photo-${Date.now()}.${extensionFor(
    photo.contentType
  )}`;

  const { error } = await supabase.storage.from(bucket).upload(path, photo.buffer, {
    contentType: photo.contentType,
    upsert: false,
  });
  if (error) {
    console.error("[devora/storage] upload failed:", error.message);
    throw new Error("The photo could not be stored. Please try again.");
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error("The photo could not be stored. Please try again.");
  }
  return { url: data.publicUrl, path };
}

/**
 * Best-effort cleanup of this user's previous photo objects.
 *
 * Never throws: a failed delete must not break a profile that just saved a
 * new photo. Orphaned objects are harmless — only the URL in the database is
 * ever displayed.
 */
export async function deleteProfilePhotos(userId: string, keepPath?: string): Promise<void> {
  if (!hasStorage()) return;
  try {
    const supabase = adminClient();
    const bucket = bucketName();
    const prefix = `profiles/${userId}/`;

    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error || !data || data.length === 0) return;

    const stale = data
      .map((object) => prefix + object.name)
      .filter((path) => path !== keepPath);
    if (stale.length === 0) return;

    await supabase.storage.from(bucket).remove(stale);
  } catch (error) {
    console.error("[devora/storage] cleanup failed:", error);
  }
}

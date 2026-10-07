"use client";

/**
 * Client-side image preparation for the profile photo.
 *
 * Crop/resize happens in the browser on a canvas, then the result is handed to
 * the server as a compact square JPEG data URL. This keeps uploads small and
 * means the avatar is already the right shape before it ever reaches the DB.
 */

export const AVATAR_SIZE = 512;
export const AVATAR_QUALITY = 0.88;

export type CropState = {
  /** Rendered size of the source image inside the square viewport, in px. */
  width: number;
  height: number;
  /** Top-left offset of the image within the viewport, in px. */
  x: number;
  y: number;
};

/** The minimum scale that lets the image cover the square viewport. */
export function coverScale(
  naturalWidth: number,
  naturalHeight: number,
  viewport: number
): number {
  if (naturalWidth <= 0 || naturalHeight <= 0) return 1;
  return Math.max(viewport / naturalWidth, viewport / naturalHeight);
}

export function initialCrop(
  naturalWidth: number,
  naturalHeight: number,
  viewport: number
): CropState {
  const scale = coverScale(naturalWidth, naturalHeight, viewport);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    width,
    height,
    x: (viewport - width) / 2,
    y: (viewport - height) / 2,
  };
}

/** Keep the image covering the viewport: no gaps at any edge. */
export function clampCrop(crop: CropState, viewport: number): CropState {
  const width = Math.max(crop.width, viewport);
  const height = Math.max(crop.height, viewport);
  return {
    width,
    height,
    x: Math.min(0, Math.max(viewport - width, crop.x)),
    y: Math.min(0, Math.max(viewport - height, crop.y)),
  };
}

/**
 * Render the cropped region to a square JPEG data URL.
 * Returns null if the browser cannot decode the image.
 */
export async function cropToDataUrl(
  image: HTMLImageElement,
  crop: CropState,
  viewport: number,
  size = AVATAR_SIZE
): Promise<string | null> {
  try {
    const scale = size / viewport;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#0b0b0d";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      image,
      -crop.x * scale,
      -crop.y * scale,
      crop.width * scale,
      crop.height * scale
    );

    return canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
  } catch {
    return null;
  }
}

export async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// JPG/JPEG, PNG and WebP only (spec §4) — GIF is not accepted for avatars.
export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Initials for the default avatar when no photo is uploaded. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "D";
  if (parts.length === 1) return (parts[0][0] ?? "D").toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

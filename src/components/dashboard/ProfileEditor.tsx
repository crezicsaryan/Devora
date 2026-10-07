"use client";

/**
 * Profile editor (post-onboarding).
 *
 * Reuses the same validated endpoints as onboarding, so there is exactly one
 * write path for profile data and one set of server-side rules.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { DEVELOPER_ROLES } from "@/lib/validation";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  cropToDataUrl,
  initialCrop,
  clampCrop,
  loadImage,
  readFileAsDataUrl,
  initialsOf,
  type CropState,
} from "@/lib/avatar";
import styles from "@/app/dashboard/dashboard.module.css";

const VIEWPORT = 248;

type UsernameState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; message: string }
  | { kind: "taken"; message: string }
  | { kind: "invalid"; message: string };

export function ProfileEditor() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [college, setCollege] = useState("");
  const [bio, setBio] = useState("");
  const [developerRole, setDeveloperRole] = useState("");
  const [location, setLocation] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [email, setEmail] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [usernameState, setUsernameState] = useState<UsernameState>({ kind: "idle" });
  const [completion, setCompletion] = useState(0);

  // crop state
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const dragRef = useRef<{ x: number; y: number; start: CropState } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    api.onboardingDraft().then((res) => {
      if (!alive) return;
      if (res.ok) {
        const p = res.data.profile;
        setDisplayName(p.displayName ?? "");
        setUsername(p.username ?? "");
        setOriginalUsername(p.username ?? "");
        setCollege(p.college ?? "");
        setBio(p.bio ?? "");
        setDeveloperRole(p.developerRole ?? "");
        setLocation(p.location ?? "");
        setAvatarUrl(p.avatarUrl ?? "");
        setEmail(p.email ?? "");
        setCompletion(res.data.completion?.percent ?? 0);
      } else if (res.status === 401) {
        router.replace("/login?next=/dashboard/profile");
        return;
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [router]);

  /* --------------------- username availability check -------------------- */

  useEffect(() => {
    const trimmed = username.trim().toLowerCase();
    let alive = true;

    // All state changes happen inside the debounce timer, so nothing is set
    // synchronously during the effect's commit phase.
    const t = setTimeout(async () => {
      if (!alive) return;
      if (!trimmed || trimmed === originalUsername.toLowerCase()) {
        setUsernameState({ kind: "idle" });
        return;
      }
      if (!/^[a-z0-9_-]{3,30}$/.test(trimmed)) {
        setUsernameState({
          kind: "invalid",
          message: "3–30 characters: letters, numbers, underscore or hyphen.",
        });
        return;
      }

      setUsernameState({ kind: "checking" });
      const res = await api.usernameAvailability(trimmed);
      if (!alive) return;
      if (!res.ok) {
        setUsernameState({ kind: "idle" });
        return;
      }
      setUsernameState(
        res.data.available
          ? { kind: "available", message: `@${trimmed} is available` }
          : { kind: "taken", message: res.data.message || `@${trimmed} is taken` }
      );
    }, 380);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [username, originalUsername]);

  /* ------------------------------- photo -------------------------------- */

  const acceptFile = useCallback(async (file: File) => {
    setError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Use a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That image is larger than 8 MB.");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) {
      setError("Could not read that file.");
      return;
    }
    const img = await loadImage(dataUrl);
    if (!img) {
      setError("Could not decode that image.");
      return;
    }
    setCropSource(dataUrl);
    setCropImage(img);
    setCrop(initialCrop(img.naturalWidth, img.naturalHeight, VIEWPORT));
  }, []);

  /**
   * Crop, then upload straight to object storage — the database only ever
   * stores the returned https URL. On failure the old photo stays untouched
   * and the editor stays open for a retry.
   */
  const applyCrop = useCallback(async () => {
    if (!cropImage || !crop) return;
    const out = await cropToDataUrl(cropImage, crop, VIEWPORT);
    if (!out) {
      setError("Could not crop that image.");
      return;
    }
    setUploadingPhoto(true);
    const res = await api.uploadProfilePhoto(out);
    setUploadingPhoto(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAvatarUrl(res.data.url);
    setCropSource(null);
    setCropImage(null);
    setCrop(null);
  }, [cropImage, crop]);

  /** Clear the stored photo (if any) and the local preview. */
  const removePhoto = useCallback(async () => {
    const previous = avatarUrl;
    setAvatarUrl("");
    const res = await api.removeProfilePhoto();
    if (!res.ok) {
      setAvatarUrl(previous);
      setError(res.error);
    }
  }, [avatarUrl]);

  /* ------------------------------ save --------------------------------- */

  const save = useCallback(async () => {
    setError(null);
    setSaved(false);

    if (!displayName.trim()) {
      setError("Your display name cannot be empty.");
      return;
    }
    if (!college.trim()) {
      setError("Your college is required.");
      return;
    }
    if (usernameState.kind === "taken" || usernameState.kind === "invalid") {
      setError("Pick a username that is available before saving.");
      return;
    }

    setSaving(true);
    const res = await api.saveProfileStep({
      displayName: displayName.trim(),
      username: username.trim().toLowerCase() || undefined,
      college: college.trim(),
      bio,
      developerRole,
      location,
      avatarUrl,
    });
    setSaving(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOriginalUsername(res.data.username);
    setUsername(res.data.username);
    setUsernameState({ kind: "idle" });
    setCompletion(res.data.completion.percent);
    setSaved(true);
  }, [displayName, username, college, bio, developerRole, location, avatarUrl, usernameState]);

  if (loading) {
    return (
      <>
        <h1 className={styles.pageTitle}>My Profile</h1>
        <div className={styles.skeleton} style={{ height: 420, marginTop: 18 }} />
      </>
    );
  }

  return (
    <>
      <div className={styles.sectionHead} style={{ marginBottom: 20 }}>
        <div>
          <h1 className={styles.pageTitle} style={{ marginBottom: 4 }}>
            My Profile
          </h1>
          <p className={styles.pageSub}>
            Everything here appears on your public Devora profile.
          </p>
        </div>
        <span className={styles.pill} data-tone={completion === 100 ? "ok" : "accent"}>
          {completion}% complete
        </span>
      </div>

      {error && (
        <div className={styles.banner} data-tone="error">
          <span>{error}</span>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.formActions} style={{ marginTop: 0, marginBottom: 4, gap: 14 }}>
          <span
            className={styles.avatar}
            style={{ width: 64, height: 64, flexBasis: 64, fontSize: 20, borderRadius: 14 }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: cropImage ? "scale(1.001)" : undefined,
                }}
              />
            ) : (
              initialsOf(displayName || "Developer")
            )}
          </span>
          <button
            type="button"
            className={styles.btnSubtle}
            onClick={() => fileRef.current?.click()}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? "Uploading…" : avatarUrl ? "Edit photo" : "Upload photo"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              className={styles.btnSubtle}
              onClick={() => void removePhoto()}
              disabled={uploadingPhoto}
            >
              Remove photo
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void acceptFile(f);
              e.target.value = "";
            }}
          />
        </div>

        {cropSource && crop && cropImage && (
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                position: "relative",
                width: VIEWPORT,
                height: VIEWPORT,
                maxWidth: "100%",
                overflow: "hidden",
                borderRadius: 14,
                border: "1px solid #252529",
                background: "#0b0b0d",
                cursor: "grab",
                touchAction: "none",
              }}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                dragRef.current = { x: e.clientX, y: e.clientY, start: crop };
              }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                if (!d) return;
                setCrop(
                  clampCrop(
                    { ...d.start, x: d.start.x + (e.clientX - d.x), y: d.start.y + (e.clientY - d.y) },
                    VIEWPORT
                  )
                );
              }}
              onPointerUp={() => (dragRef.current = null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cropSource}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  left: crop.x,
                  top: crop.y,
                  width: crop.width,
                  height: crop.height,
                  userSelect: "none",
                }}
              />
            </div>

            <div className={styles.formActions}>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={crop.width / (cropImage.naturalWidth * (VIEWPORT / cropImage.naturalWidth))}
                onChange={(e) => {
                  const zoom = Number(e.target.value);
                  const base = Math.max(VIEWPORT / cropImage.naturalWidth, VIEWPORT / cropImage.naturalHeight);
                  const scale = base * zoom;
                  const width = cropImage.naturalWidth * scale;
                  const height = cropImage.naturalHeight * scale;
                  setCrop(
                    clampCrop(
                      { width, height, x: (VIEWPORT - width) / 2, y: (VIEWPORT - height) / 2 },
                      VIEWPORT
                    )
                  );
                }}
                style={{ flex: "1 1 160px", maxWidth: 240 }}
                aria-label="Zoom"
              />
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={applyCrop}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? "Uploading…" : "Apply crop"}
              </button>
              <button
                type="button"
                className={styles.btnSubtle}
                onClick={() => {
                  setCropSource(null);
                  setCropImage(null);
                  setCrop(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className={styles.fieldGrid} style={{ marginTop: 22 }}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="pe-name">
              Display name
            </label>
            <input
              id="pe-name"
              className={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              placeholder="Aryan Sharma"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="pe-username">
              Username
            </label>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#6b7280",
                  fontSize: 13.5,
                }}
              >
                @
              </span>
              <input
                id="pe-username"
                className={styles.input}
                style={{ paddingLeft: 26 }}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                maxLength={30}
                placeholder="your-handle"
              />
            </div>
            {usernameState.kind !== "idle" && (
              <span
                className={styles.hint}
                style={{
                  color:
                    usernameState.kind === "available"
                      ? "#34d399"
                      : usernameState.kind === "checking"
                        ? "#9ca3af"
                        : "#f87171",
                }}
              >
                {usernameState.kind === "checking"
                  ? "Checking availability…"
                  : `${usernameState.kind === "available" ? "✓ " : "✕ "}${usernameState.message}`}
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="pe-college">
              College
            </label>
            <input
              id="pe-college"
              className={styles.input}
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              maxLength={120}
              placeholder="IIT Delhi"
              autoComplete="organization"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="pe-role">
              Developer role
            </label>
            <select
              id="pe-role"
              className={styles.select}
              value={developerRole}
              onChange={(e) => setDeveloperRole(e.target.value)}
            >
              <option value="">Select a role</option>
              {DEVELOPER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="pe-location">
              Location <span style={{ color: "#6b7280" }}>(optional)</span>
            </label>
            <input
              id="pe-location"
              className={styles.input}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={80}
              placeholder="Bengaluru, India"
            />
          </div>

          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label className={styles.label} htmlFor="pe-bio">
              Bio
            </label>
            <textarea
              id="pe-bio"
              className={styles.textarea}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={320}
              placeholder="Backend engineer who enjoys graph problems and shipping side projects."
            />
            <span className={styles.hint}>{bio.length}/320</span>
          </div>

          <div className={`${styles.field} ${styles.fieldFull}`}>
            <span className={styles.label}>Email</span>
            <input className={styles.input} value={email} readOnly disabled />
            <span className={styles.hint}>
              Your email is managed by your account and is never shown publicly unless you enable
              it in Settings.
            </span>
          </div>
        </div>

        <div className={styles.formActions}>
          <button type="button" className={styles.btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && <span className={styles.savedNote}>✓ Saved</span>}
        </div>
      </div>
    </>
  );
}

"use client";

/**
 * Step 1 — Profile.
 *
 * Photo (drag & drop + crop), display name, unique username with live
 * availability, bio, developer role and optional location. Nothing here is
 * mandatory beyond a display name and a usable username, per the PRD's rule
 * against demanding unnecessary personal information.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { DEVELOPER_ROLES } from "@/lib/validation";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  clampCrop,
  cropToDataUrl,
  initialCrop,
  initialsOf,
  loadImage,
  readFileAsDataUrl,
  type CropState,
} from "@/lib/avatar";
import type { OnboardingDraft } from "@/components/onboarding/OnboardingFlow";
import styles from "@/app/onboarding/onboarding.module.css";

const VIEWPORT = 232;

type UsernameState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; message: string }
  | { kind: "taken"; message: string }
  | { kind: "invalid"; message: string };

export function ProfileStep({
  draft,
  patch,
  onError,
}: {
  draft: OnboardingDraft;
  patch: (values: Partial<OnboardingDraft>) => void;
  onError: (message: string | null) => void;
}) {
  const [usernameState, setUsernameState] = useState<UsernameState>({ kind: "idle" });

  // Cropper
  const [cropSource, setCropSource] = useState<{ src: string; image: HTMLImageElement } | null>(null);
  const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, width: VIEWPORT, height: VIEWPORT });
  const [dragging, setDragging] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number; crop: CropState } | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ----------------------- username availability ----------------------- */

  useEffect(() => {
    const value = draft.username.trim();
    let alive = true;

    // Everything — including the "checking" state — runs inside the debounce
    // timer, so no state is set synchronously while React is committing.
    const timer = setTimeout(async () => {
      if (!alive) return;
      if (value.length === 0) {
        setUsernameState({ kind: "idle" });
        return;
      }
      if (!/^[a-z0-9_-]*$/.test(value)) {
        setUsernameState({
          kind: "invalid",
          message: "Only letters, numbers, underscores and hyphens.",
        });
        return;
      }
      if (value.length < 3) {
        setUsernameState({ kind: "invalid", message: "At least 3 characters." });
        return;
      }

      setUsernameState({ kind: "checking" });
      const res = await api.usernameAvailability(value);
      if (!alive) return;
      if (!res.ok) {
        setUsernameState({ kind: "idle" });
        return;
      }
      if (res.data.available) {
        setUsernameState({ kind: "available", message: "Username available" });
      } else if (res.data.reason === "taken") {
        setUsernameState({ kind: "taken", message: "Username already taken" });
      } else {
        setUsernameState({ kind: "invalid", message: res.data.message });
      }
    }, 380); // debounce: one request per pause in typing

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [draft.username]);

  /* --------------------------- photo handling -------------------------- */

  const acceptFile = useCallback(
    async (file: File) => {
      onError(null);
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        onError("Use a PNG, JPEG, WebP or GIF image.");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        onError("That image is larger than 8 MB. Pick a smaller file.");
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl) {
        onError("That image could not be read.");
        return;
      }
      const image = await loadImage(dataUrl);
      if (!image) {
        onError("That image could not be decoded.");
        return;
      }
      setCropSource({ src: dataUrl, image });
      setCrop(initialCrop(image.naturalWidth, image.naturalHeight, VIEWPORT));
    },
    [onError]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDropActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void acceptFile(file);
    },
    [acceptFile]
  );

  const applyCrop = useCallback(async () => {
    if (!cropSource) return;
    setProcessing(true);
    const dataUrl = await cropToDataUrl(cropSource.image, crop, VIEWPORT);
    setProcessing(false);
    if (!dataUrl) {
      onError("Cropping failed. Try a different image.");
      return;
    }
    patch({ avatarUrl: dataUrl });
    setCropSource(null);
  }, [cropSource, crop, patch, onError]);

  const useOriginal = useCallback(() => {
    if (!cropSource) return;
    patch({ avatarUrl: cropSource.src });
    setCropSource(null);
  }, [cropSource, patch]);

  /* ---------------------------- crop dragging -------------------------- */

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragging || !dragOrigin.current) return;
      const dx = event.clientX - dragOrigin.current.x;
      const dy = event.clientY - dragOrigin.current.y;
      setCrop(
        clampCrop(
          {
            ...dragOrigin.current.crop,
            x: dragOrigin.current.crop.x + dx,
            y: dragOrigin.current.crop.y + dy,
          },
          VIEWPORT
        )
      );
    },
    [dragging]
  );

  const zoomBy = useCallback(
    (factor: number) => {
      if (!cropSource) return;
      setCrop((prev) => {
        const nextScale = (prev.width / VIEWPORT) * factor;
        const clamped = Math.min(Math.max(nextScale, 1), 5);
        const ratio = clamped / (prev.width / VIEWPORT);
        const width = prev.width * ratio;
        const height = prev.height * ratio;
        const centerX = (VIEWPORT / 2 - prev.x) * ratio;
        const centerY = (VIEWPORT / 2 - prev.y) * ratio;
        return clampCrop(
          { width, height, x: VIEWPORT / 2 - centerX, y: VIEWPORT / 2 - centerY },
          VIEWPORT
        );
      });
    },
    [cropSource]
  );

  const initials = useMemo(() => initialsOf(draft.displayName || draft.username), [
    draft.displayName,
    draft.username,
  ]);

  /* -------------------------------- render ---------------------------- */

  return (
    <div className={styles.stepWrap}>
      <header className={styles.stepHead}>
        <h2 className={styles.stepTitle}>Let&apos;s build your developer profile.</h2>
        <p className={styles.stepSub}>This is how people will discover you on Devora.</p>
      </header>

      {/* -------- photo -------- */}
      <div className={styles.photoRow}>
        <div
          className={`${styles.photoDrop} ${dropActive ? styles.photoDropActive : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          aria-label="Upload a profile photo"
        >
          {draft.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.avatarUrl} alt="Profile preview" className={styles.photoImg} />
          ) : (
            <span className={styles.photoFallback}>{initials}</span>
          )}
          <span className={styles.photoOverlay}>
            <CameraGlyph />
          </span>
        </div>

        <div className={styles.photoInfo}>
          <div className={styles.photoTitle}>Profile photo</div>
          <p className={styles.photoHint}>
            Drag &amp; drop an image, or click to browse. You can reposition and
            zoom before saving.
          </p>
          <div className={styles.photoActions}>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              {draft.avatarUrl ? "Replace photo" : "Upload photo"}
            </button>
            {draft.avatarUrl && (
              <button
                type="button"
                className={styles.textBtn}
                onClick={() => patch({ avatarUrl: "" })}
              >
                Remove
              </button>
            )}
          </div>
          <p className={styles.photoNote}>
            No photo? We&apos;ll use a clean default avatar with your initials.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void acceptFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* -------- cropper -------- */}
      {cropSource && (
        <div className={styles.cropper} role="dialog" aria-label="Adjust your photo">
          <div
            className={styles.cropStage}
            style={{ width: VIEWPORT, height: VIEWPORT }}
            onPointerDown={(e) => {
              setDragging(true);
              dragOrigin.current = { x: e.clientX, y: e.clientY, crop };
            }}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDragging(false)}
            onPointerLeave={() => setDragging(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cropSource.src}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: crop.x,
                top: crop.y,
                width: crop.width,
                height: crop.height,
                maxWidth: "none",
                userSelect: "none",
              }}
            />
            <span className={styles.cropRing} aria-hidden="true" />
          </div>

          <div className={styles.cropControls}>
            <div className={styles.cropZoomRow}>
              <button type="button" className={styles.zoomBtn} onClick={() => zoomBy(0.9)}>
                −
              </button>
              <input
                type="range"
                min={100}
                max={500}
                value={Math.round((crop.width / VIEWPORT) * 100)}
                onChange={(e) => {
                  const target = Number(e.target.value) / 100;
                  const current = crop.width / VIEWPORT;
                  zoomBy(target / current);
                }}
                className={styles.zoomRange}
                aria-label="Zoom"
              />
              <button type="button" className={styles.zoomBtn} onClick={() => zoomBy(1.1)}>
                +
              </button>
            </div>
            <div className={styles.cropActions}>
              <button type="button" className={styles.textBtn} onClick={useOriginal}>
                Use as-is
              </button>
              <button type="button" className={styles.textBtn} onClick={() => setCropSource(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.primarySmall}
                onClick={applyCrop}
                disabled={processing}
              >
                {processing ? "Saving…" : "Apply crop"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------- fields -------- */}
      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Display name</span>
          <input
            className={styles.input}
            value={draft.displayName}
            onChange={(e) => patch({ displayName: e.target.value })}
            placeholder="Aryan Singh"
            maxLength={60}
            autoComplete="name"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Username</span>
          <div className={styles.usernameWrap}>
            <span className={styles.usernamePrefix}>devora.app/</span>
            <input
              className={styles.input}
              value={draft.username}
              onChange={(e) =>
                patch({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })
              }
              placeholder="aryan"
              maxLength={30}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <span className={styles.helper}>
            {usernameState.kind === "checking" && (
              <span className={styles.helperNeutral}>Checking availability…</span>
            )}
            {usernameState.kind === "available" && (
              <span className={styles.helperOk}>✓ {usernameState.message}</span>
            )}
            {usernameState.kind === "taken" && (
              <span className={styles.helperBad}>✕ {usernameState.message}</span>
            )}
            {usernameState.kind === "invalid" && (
              <span className={styles.helperBad}>{usernameState.message}</span>
            )}
            {usernameState.kind === "idle" && (
              <span className={styles.helperNeutral}>
                Letters, numbers, underscores and hyphens. No spaces.
              </span>
            )}
          </span>
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>
          Bio <span className={styles.optional}>optional</span>
        </span>
        <textarea
          className={styles.textarea}
          value={draft.bio}
          onChange={(e) => patch({ bio: e.target.value.slice(0, 320) })}
          placeholder="Full Stack Developer | CSE Student | Open Source Enthusiast"
          rows={3}
          maxLength={320}
        />
        <span className={styles.counter}>{draft.bio.length}/320</span>
      </label>

      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span className={styles.label}>
            Developer role <span className={styles.optional}>optional</span>
          </span>
          <select
            className={styles.select}
            value={draft.developerRole}
            onChange={(e) => patch({ developerRole: e.target.value })}
          >
            <option value="">Select your role</option>
            {DEVELOPER_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            Location <span className={styles.optional}>optional</span>
          </span>
          <input
            className={styles.input}
            value={draft.location}
            onChange={(e) => patch({ location: e.target.value.slice(0, 80) })}
            placeholder="Bhopal, India"
            maxLength={80}
          />
        </label>
      </div>

      <p className={styles.privacyNote}>
        Only what you add here appears on your profile. Everything is editable
        later, and you control what is public in Settings.
      </p>
    </div>
  );
}

function CameraGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 5h-3.2l-1.4-2H8.6L7.2 5H4a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2zm-8 13a5 5 0 110-10 5 5 0 010 10zm0-2.2a2.8 2.8 0 100-5.6 2.8 2.8 0 000 5.6z"
      />
    </svg>
  );
}

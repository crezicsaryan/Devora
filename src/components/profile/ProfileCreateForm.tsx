"use client";

/**
 * /profile/create — the single-page profile creation form.
 *
 * Two rules shape everything here:
 *
 *  1. NO FAKE DATA. The preview renders only what the user has actually typed
 *     or what came back from the database. A platform is never labelled
 *     "Connected" unless `connectionStatus === "connected"` — providing a URL
 *     produces "Linked", and an untouched card produces "Not connected".
 *     There are no statistics on this page at all.
 *
 *  2. A FAILED SAVE NEVER LOSES WORK. On error we keep every field, show the
 *     real message, and leave the button ready to retry. We only redirect once
 *     the server confirms the profile is saved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api, apiFetch } from "@/lib/api-client";
import { DEVELOPER_ROLES } from "@/lib/validation";
import {
  LINK_SPECS,
  parseProfileLink,
  type LinkKey,
  type ParsedLink,
} from "@/lib/profile-links";
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
import styles from "@/app/profile/create/profile-create.module.css";

const VIEWPORT = 240;
const MAX_SKILLS = 60;

type UsernameState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; message: string }
  | { kind: "taken"; message: string }
  | { kind: "invalid"; message: string };

/** Mirrors the `skills` table seed, used only when the catalogue is unreachable. */
const FALLBACK_CATALOGUE: { slug: string; name: string; category: string }[] = [
  ["java", "Java"], ["javascript", "JavaScript"], ["typescript", "TypeScript"],
  ["python", "Python"], ["c", "C"], ["cpp", "C++"], ["csharp", "C#"],
  ["go", "Go"], ["rust", "Rust"], ["kotlin", "Kotlin"], ["php", "PHP"],
  ["ruby", "Ruby"], ["swift", "Swift"], ["sql", "SQL"], ["bash", "Bash"],
].map(([slug, name]) => ({ slug, name, category: "language" })).concat(
  [
    ["react", "React"], ["nextjs", "Next.js"], ["nodejs", "Node.js"],
    ["express", "Express"], ["nestjs", "NestJS"], ["spring-boot", "Spring Boot"],
    ["django", "Django"], ["flask", "Flask"], ["mongodb", "MongoDB"],
    ["mysql", "MySQL"], ["postgresql", "PostgreSQL"], ["redis", "Redis"],
    ["docker", "Docker"], ["kubernetes", "Kubernetes"], ["git", "Git"],
    ["aws", "AWS"], ["firebase", "Firebase"], ["tailwind", "Tailwind CSS"],
    ["graphql", "GraphQL"], ["rest-api", "REST API"], ["linux", "Linux"],
    ["tensorflow", "TensorFlow"], ["pytorch", "PyTorch"], ["vercel", "Vercel"],
    ["jwt", "JWT"], ["socketio", "Socket.IO"], ["prisma", "Prisma"],
  ].map(([slug, name]) => ({ slug, name, category: "technology" }))
);

type LinkRow = {
  platform: string;
  username: string;
  profileUrl: string | null;
  connectionStatus: string;
  connected: boolean;
};

export function ProfileCreateForm() {
  const router = useRouter();

  /* ------------------------------ state ------------------------------- */

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [college, setCollege] = useState("");
  const [bio, setBio] = useState("");
  const [developerRole, setDeveloperRole] = useState("");
  const [location, setLocation] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [usernameState, setUsernameState] = useState<UsernameState>({ kind: "idle" });

  const [skills, setSkills] = useState<string[]>([]);
  const [catalogue, setCatalogue] = useState(FALLBACK_CATALOGUE);
  const [skillTab, setSkillTab] = useState<"language" | "technology">("language");
  const [skillQuery, setSkillQuery] = useState("");
  const [customSkill, setCustomSkill] = useState("");

  const [links, setLinks] = useState<Record<LinkKey, string>>({
    github: "", linkedin: "", leetcode: "", gfg: "",
    codechef: "", codeforces: "", hackerrank: "", portfolio: "",
  });
  const [linkErrors, setLinkErrors] = useState<Partial<Record<LinkKey, string>>>({});
  const [linkedState, setLinkedState] = useState<Record<string, LinkRow>>({});

  // photo
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const dragRef = useRef<{ x: number; y: number; start: CropState } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ----------------------------- bootstrap ---------------------------- */

  /**
   * Load the saved draft. Called on mount, and again after the GitHub OAuth
   * round-trip so the GitHub row reflects the real connection.
   */
  const loadDraft = useCallback(async (): Promise<boolean> => {
    const res = await apiFetch<{
      profile: {
        displayName: string; username: string; college: string; bio: string;
        developerRole: string; location: string; avatarUrl: string;
      };
      skills: string[];
      links: LinkRow[];
      socials: { linkedin: string; portfolio: string };
      onboardingCompleted: boolean;
    }>("/api/profile/create");

    if (!res.ok) {
      if (res.status === 401) {
        router.replace("/login?next=/profile/create");
        return false;
      }
      setError(res.error);
      return false;
    }

    const d = res.data;
    setDisplayName(d.profile.displayName ?? "");
    setUsername(d.profile.username ?? "");
    setOriginalUsername(d.profile.username ?? "");
    setCollege(d.profile.college ?? "");
    setBio(d.profile.bio ?? "");
    setDeveloperRole(d.profile.developerRole ?? "");
    setLocation(d.profile.location ?? "");
    setAvatarUrl(d.profile.avatarUrl ?? "");
    setSkills(d.skills ?? []);

    // Existing rows come from the database — never guessed.
    const byPlatform: Record<string, LinkRow> = {};
    for (const row of d.links ?? []) byPlatform[row.platform] = row;
    setLinkedState(byPlatform);

    setLinks((prev) => ({
      ...prev,
      github: byPlatform.github?.profileUrl ?? "",
      leetcode: byPlatform.leetcode?.profileUrl ?? "",
      gfg: byPlatform.gfg?.profileUrl ?? "",
      codechef: byPlatform.codechef?.profileUrl ?? "",
      codeforces: byPlatform.codeforces?.profileUrl ?? "",
      hackerrank: byPlatform.hackerrank?.profileUrl ?? "",
      linkedin: d.socials?.linkedin ?? "",
      portfolio: d.socials?.portfolio ?? "",
    }));

    return true;
  }, [router]);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const ok = await loadDraft();
      if (!alive) return;

      if (ok) {
        // The catalogue is a nicety; the fallback keeps the page usable if the
        // database is unreachable.
        const cat = await api.skillCatalogue();
        if (!alive) return;
        if (cat.ok && cat.data.catalogue.length > 0) {
          setCatalogue(cat.data.catalogue);
        }
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [loadDraft]);

  /* --------------------- GitHub OAuth round-trip ----------------------- */

  useEffect(() => {
    let alive = true;

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("platform_connected");
      const failed = params.get("platform_error");
      if (!connected && !failed) return;

      // Clean the query string so a refresh does not re-announce the event.
      window.history.replaceState({}, "", "/profile/create");
      if (!alive) return;

      if (connected === "github") {
        setNotice("GitHub connected successfully.");
        // Re-read so the row shows the real connection, not a stale draft.
        await loadDraft();
        return;
      }

      setError(
        params.get("platform_message") ||
          (failed === "github_not_configured"
            ? "GitHub authorization is not configured on this deployment yet. You can still paste your profile URL."
            : "GitHub could not be connected. You can try again, or paste your profile URL instead.")
      );
    })();

    return () => {
      alive = false;
    };
  }, [loadDraft]);

  /* --------------------- username availability check ------------------- */

  useEffect(() => {
    const value = username.trim().toLowerCase();
    let alive = true;

    // Everything happens inside the debounce timer so no state is written
    // synchronously during the effect's commit phase.
    const timer = setTimeout(async () => {
      if (!alive) return;
      if (!value || value === originalUsername.toLowerCase()) {
        setUsernameState({ kind: "idle" });
        return;
      }
      if (!/^[a-z0-9_-]*$/.test(value)) {
        setUsernameState({
          kind: "invalid",
          message: "Letters, numbers, underscores and hyphens only — no spaces.",
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
        setUsernameState({ kind: "available", message: `@${value} is available` });
      } else if (res.data.reason === "taken") {
        setUsernameState({ kind: "taken", message: `@${value} is already taken` });
      } else {
        setUsernameState({ kind: "invalid", message: res.data.message });
      }
    }, 380);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [username, originalUsername]);

  /* ----------------------------- photo -------------------------------- */

  const acceptFile = useCallback(async (file: File) => {
    setError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Use a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That image is larger than 8 MB. Pick a smaller file.");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) {
      setError("That image could not be read.");
      return;
    }
    const image = await loadImage(dataUrl);
    if (!image) {
      setError("That image could not be decoded.");
      return;
    }
    setCropSource(dataUrl);
    setCropImage(image);
    setCrop(initialCrop(image.naturalWidth, image.naturalHeight, VIEWPORT));
  }, []);

  /**
   * Crop, then upload straight to object storage. The database only ever
   * receives the https URL this returns — never the image binary. On failure
   * the editor stays open so the user can simply press Apply again.
   */
  const applyCrop = useCallback(async () => {
    if (!cropImage || !crop) return;
    const out = await cropToDataUrl(cropImage, crop, VIEWPORT);
    if (!out) {
      setError("That image could not be cropped.");
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

  const cancelCrop = useCallback(() => {
    setCropSource(null);
    setCropImage(null);
    setCrop(null);
  }, []);

  /* ----------------------------- skills -------------------------------- */

  const addSkill = useCallback((raw: string) => {
    const name = raw.trim();
    if (!name) return;
    setSkills((prev) => {
      if (prev.length >= MAX_SKILLS) return prev;
      // Duplicates are never added, case-insensitively.
      if (prev.some((s) => s.toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, name];
    });
  }, []);

  const removeSkill = useCallback((name: string) => {
    setSkills((prev) => prev.filter((s) => s !== name));
  }, []);

  const visibleCatalogue = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    return catalogue.filter(
      (s) => s.category === skillTab && (!q || s.name.toLowerCase().includes(q))
    );
  }, [catalogue, skillTab, skillQuery]);

  /* ------------------------------ links -------------------------------- */

  const setLink = useCallback((key: LinkKey, value: string) => {
    setLinks((prev) => ({ ...prev, [key]: value }));
    setLinkErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /**
   * Validate one field on blur. This is for fast feedback only — the server
   * re-validates every URL on save, because the browser is never trusted.
   */
  const validateLink = useCallback((key: LinkKey) => {
    const value = links[key];
    if (!value.trim()) {
      setLinkErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    const parsed: ParsedLink = parseProfileLink(key, value);
    setLinkErrors((prev) => {
      const next = { ...prev };
      if (parsed.error) next[key] = parsed.error;
      else delete next[key];
      return next;
    });
  }, [links]);

  /* ------------------------------ submit ------------------------------- */

  const submit = useCallback(async () => {
    setError(null);

    if (!displayName.trim()) {
      setError("Your display name is required.");
      return;
    }
    if (usernameState.kind === "taken" || usernameState.kind === "invalid") {
      setError("Choose an available username before continuing.");
      return;
    }
    if (!college.trim()) {
      setError("Your college is required.");
      return;
    }
    if (skills.length === 0) {
      setError("Add at least one skill to continue.");
      return;
    }

    setSaving(true);
    const res = await apiFetch<{
      ok: true;
      username: string;
      completion: { percent: number };
      redirectTo: string;
    }>("/api/profile/create", {
      json: {
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        college: college.trim(),
        bio,
        developerRole,
        location,
        avatarUrl,
        skills,
        ...links,
      },
    });

    if (!res.ok) {
      // Keep every field exactly as the user left it and let them retry.
      setSaving(false);
      setError(res.error);
      return;
    }

    // Only now — after the server confirms — do we leave the page.
    router.replace(res.data.redirectTo || "/dashboard");
    router.refresh();
  }, [displayName, username, college, bio, developerRole, location, avatarUrl, skills, links, usernameState, router]);

  /* ------------------------------ render ------------------------------- */

  if (loading) {
    return (
      <div className={styles.cols}>
        <div>
          <div className={styles.skeleton} style={{ height: 320, marginBottom: 20 }} />
          <div className={styles.skeleton} style={{ height: 260, marginBottom: 20 }} />
          <div className={styles.skeleton} style={{ height: 420 }} />
        </div>
        <div className={styles.skeleton} style={{ height: 460 }} />
      </div>
    );
  }

  const canSubmit =
    displayName.trim().length > 0 &&
    username.trim().length >= 3 &&
    usernameState.kind !== "taken" &&
    usernameState.kind !== "invalid" &&
    college.trim().length > 0 &&
    skills.length > 0 &&
    !saving &&
    !uploadingPhoto;

  return (
    <>
      {notice && !error && (
        <div className={styles.banner} data-tone="info" role="status">
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className={styles.banner} data-tone="error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className={styles.bannerDismiss}
            onClick={() => setError(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div className={styles.cols}>
        {/* ============================ form ============================ */}
        <div>
          {/* ---------- profile information ---------- */}
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2 className={styles.cardTitle}>Profile information</h2>
                <div className={styles.cardSub}>
                  name, username, college and one skill are required
                </div>
              </div>
            </div>

            <div className={styles.photoRow}>
              <div className={styles.photoPreview}>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" />
                ) : (
                  initialsOf(displayName || "Devora")
                )}
              </div>
              <div className={styles.photoActions}>
                <div className={styles.photoBtns}>
                  <button
                    type="button"
                    className={styles.btnSmall}
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingPhoto}
                  >
                    {avatarUrl ? "Change photo" : "Upload photo"}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      className={styles.btnSmall}
                      onClick={() => void removePhoto()}
                      disabled={uploadingPhoto}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
                <span className={styles.hint}>
                  PNG, JPEG or WebP · up to 8 MB. Optional — crop and zoom after picking.
                </span>
              </div>
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
              <div>
                <div
                  className={styles.cropStage}
                  onPointerDown={(e) => {
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    dragRef.current = { x: e.clientX, y: e.clientY, start: crop };
                  }}
                  onPointerMove={(e) => {
                    const d = dragRef.current;
                    if (!d) return;
                    setCrop(
                      clampCrop(
                        {
                          ...d.start,
                          x: d.start.x + (e.clientX - d.x),
                          y: d.start.y + (e.clientY - d.y),
                        },
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
                      left: crop.x,
                      top: crop.y,
                      width: crop.width,
                      height: crop.height,
                    }}
                  />
                </div>
                <div className={styles.cropControls}>
                  <input
                    type="range"
                    className={styles.zoom}
                    min={1}
                    max={3}
                    step={0.01}
                    aria-label="Zoom"
                    onChange={(e) => {
                      const zoom = Number(e.target.value);
                      const base = Math.max(
                        VIEWPORT / cropImage.naturalWidth,
                        VIEWPORT / cropImage.naturalHeight
                      );
                      const scale = base * zoom;
                      const width = cropImage.naturalWidth * scale;
                      const height = cropImage.naturalHeight * scale;
                      setCrop(
                        clampCrop(
                          {
                            width,
                            height,
                            x: (VIEWPORT - width) / 2,
                            y: (VIEWPORT - height) / 2,
                          },
                          VIEWPORT
                        )
                      );
                    }}
                  />
                  <button
                    type="button"
                    className={styles.btnSmall}
                    onClick={applyCrop}
                    disabled={uploadingPhoto}
                  >
                    {uploadingPhoto ? "Uploading…" : "Apply crop"}
                  </button>
                  <button type="button" className={styles.btnSmall} onClick={cancelCrop}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className={styles.drop} data-active={dropActive}>
              <span
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropActive(true);
                }}
                onDragLeave={() => setDropActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void acceptFile(f);
                }}
                style={{ display: "block", cursor: "pointer" }}
                onClick={() => fileRef.current?.click()}
              >
                Drag &amp; drop a photo here, or click to browse
              </span>
            </div>

            <div className={styles.grid2} style={{ marginTop: 22 }}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="pc-name">
                  Display name
                </label>
                <input
                  id="pc-name"
                  className={styles.input}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={60}
                  placeholder="Aryan Singh"
                  autoComplete="name"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="pc-username">
                  Username
                </label>
                <div className={styles.withPrefix}>
                  <span className={styles.prefix}>@</span>
                  <input
                    id="pc-username"
                    className={styles.input}
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    maxLength={30}
                    placeholder="aryan"
                    autoComplete="username"
                    spellCheck={false}
                  />
                </div>
                {usernameState.kind === "checking" && (
                  <span className={styles.checkingMsg}>Checking availability…</span>
                )}
                {usernameState.kind === "available" && (
                  <span className={styles.okMsg}>✓ {usernameState.message}</span>
                )}
                {(usernameState.kind === "taken" || usernameState.kind === "invalid") && (
                  <span className={styles.badMsg}>✕ {usernameState.message}</span>
                )}
                {usernameState.kind === "idle" && (
                  <span className={styles.hint}>
                    Letters, numbers, underscore and hyphen. Must be unique.
                  </span>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="pc-college">
                  College
                </label>
                <input
                  id="pc-college"
                  className={styles.input}
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                  maxLength={120}
                  placeholder="IIT Delhi"
                  autoComplete="organization"
                />
                {!college.trim() && (
                  <span className={styles.hint}>
                    Required — your institute or university.
                  </span>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="pc-role">
                  Developer role <span className={styles.optional}>(optional)</span>
                </label>
                <select
                  id="pc-role"
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
                <label className={styles.label} htmlFor="pc-location">
                  Location <span className={styles.optional}>(optional)</span>
                </label>
                <input
                  id="pc-location"
                  className={styles.input}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={80}
                  placeholder="Bengaluru, India"
                />
              </div>

              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="pc-bio">
                  Bio <span className={styles.optional}>(optional)</span>
                </label>
                <textarea
                  id="pc-bio"
                  className={styles.textarea}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={320}
                  placeholder="CSE student who enjoys graphs, side projects and clean APIs."
                />
                <span className={styles.hint}>{bio.length}/320</span>
              </div>
            </div>
          </section>

          {/* ---------- skills ---------- */}
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2 className={styles.cardTitle}>Skills</h2>
                <div className={styles.cardSub}>
                  {skills.length} selected · up to {MAX_SKILLS}
                </div>
              </div>
            </div>

            <div className={styles.skillBar}>
              <input
                className={styles.input}
                placeholder="Search skills…"
                value={skillQuery}
                onChange={(e) => setSkillQuery(e.target.value)}
                aria-label="Search skills"
              />
              <input
                className={styles.input}
                placeholder="Add a custom skill…"
                value={customSkill}
                onChange={(e) => setCustomSkill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill(customSkill);
                    setCustomSkill("");
                  }
                }}
                aria-label="Custom skill"
              />
              <button
                type="button"
                className={styles.btnSmall}
                onClick={() => {
                  addSkill(customSkill);
                  setCustomSkill("");
                }}
                disabled={!customSkill.trim()}
              >
                Add
              </button>
            </div>

            <div className={styles.tabs} role="tablist">
              <button
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={skillTab === "language"}
                onClick={() => setSkillTab("language")}
              >
                Languages
              </button>
              <button
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={skillTab === "technology"}
                onClick={() => setSkillTab("technology")}
              >
                Technologies
              </button>
            </div>

            {skills.length > 0 && (
              <>
                <div className={styles.previewBlockLabel} style={{ marginBottom: 10 }}>
                  Selected
                </div>
                <div className={styles.chips} style={{ marginBottom: 18 }}>
                  {skills.map((s) => (
                    <span
                      key={s}
                      className={styles.chip}
                      data-on="true"
                      role="button"
                      tabIndex={0}
                      onClick={() => removeSkill(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          removeSkill(s);
                        }
                      }}
                    >
                      {s}
                      <span className={styles.chipRemove} aria-hidden="true">
                        ✕
                      </span>
                    </span>
                  ))}
                </div>
              </>
            )}

            <div className={styles.previewBlockLabel} style={{ marginBottom: 10 }}>
              {skillTab === "language" ? "Languages" : "Technologies"}
            </div>
            {visibleCatalogue.length === 0 ? (
              <p className={styles.emptyNote}>
                No matches. Use “Add a custom skill” above.
              </p>
            ) : (
              <div className={styles.chips}>
                {visibleCatalogue.map((s) => {
                  const on = skills.some((x) => x.toLowerCase() === s.name.toLowerCase());
                  return (
                    <span
                      key={s.slug}
                      className={styles.chip}
                      data-on={on}
                      role="button"
                      tabIndex={0}
                      onClick={() => (on ? removeSkill(s.name) : addSkill(s.name))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (on) removeSkill(s.name);
                          else addSkill(s.name);
                        }
                      }}
                    >
                      {s.name}
                    </span>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---------- links ---------- */}
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2 className={styles.cardTitle}>Connect your existing profiles</h2>
                <div className={styles.cardSub}>all optional · links only</div>
              </div>
            </div>

            {LINK_SPECS.map((spec) => {
              const existing = linkedState[
                spec.storage.kind === "platform" ? spec.storage.platform : spec.key
              ];
              const connected = existing?.connectionStatus === "connected";
              const hasValue = links[spec.key].trim().length > 0;

              // Three honest states — never "Connected" without a real sync.
              const state = connected
                ? "connected"
                : hasValue
                  ? "linked"
                  : "none";
              const stateLabel = connected
                ? "✓ Connected"
                : hasValue
                  ? "Linked"
                  : "Not connected";

              return (
                <div className={styles.linkCard} key={spec.key}>
                  <span className={styles.linkIcon}>
                    {spec.logo ? (
                      <Image src={spec.logo} alt="" width={20} height={20} />
                    ) : (
                      <LinkGlyph linkKey={spec.key} />
                    )}
                  </span>

                  <div className={styles.linkBody}>
                    <div className={styles.linkTop}>
                      <span className={styles.linkName}>{spec.label}</span>
                      {state !== "none" && (
                        <span className={styles.statusPill} data-state={state}>
                          {stateLabel}
                        </span>
                      )}
                      {state === "none" && (
                        <span className={styles.statusPill}>Not connected</span>
                      )}
                    </div>

                    <div className={styles.linkRow}>
                      <input
                        className={styles.input}
                        value={links[spec.key]}
                        onChange={(e) => setLink(spec.key, e.target.value)}
                        onBlur={() => validateLink(spec.key)}
                        placeholder={spec.placeholder}
                        aria-label={`${spec.label} profile URL`}
                        spellCheck={false}
                      />
                      {/* GitHub keeps the real OAuth handoff. It is never faked:
                          if the deployment has no client id/secret, the route
                          reports that honestly instead of pretending. */}
                      {spec.key === "github" && !connected && (
                        <button
                          type="button"
                          className={styles.btnSmall}
                          onClick={() => {
                            // A real full-page handoff: the authorize route
                            // responds with a 302 to github.com, so a
                            // client-side route change would not work here.
                            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                            window.location.href =
                              "/api/platforms/github/authorize?next=/profile/create";
                          }}
                        >
                          Connect GitHub
                        </button>
                      )}
                    </div>

                    {linkErrors[spec.key] && (
                      <div className={styles.badMsg} style={{ marginTop: 7 }}>
                        ✕ {linkErrors[spec.key]}
                      </div>
                    )}

                    <div className={styles.linkNote}>
                      {connected && existing?.username
                        ? `Verified account · @${existing.username}`
                        : spec.note}
                    </div>
                  </div>
                </div>
              );
            })}

            <p className={styles.hint} style={{ marginTop: 14 }}>
              Adding a URL saves a link. Devora does not verify it or show any statistics
              until you sync the platform separately.
            </p>
          </section>

          {/* ---------- actions ---------- */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={submit}
              disabled={!canSubmit}
            >
              {saving ? "Saving your profile…" : "Complete Profile →"}
            </button>
            <span className={styles.hint}>
              Name, username, college and at least one skill are required. Everything else is
              optional — you can add photo details, links and platforms later.
            </span>
          </div>
        </div>

        {/* =========================== preview =========================== */}
        <aside className={styles.previewCol}>
          <div className={styles.previewCard}>
            <div className={styles.previewInner}>
              <div className={styles.previewLabel}>Live preview</div>

              <div className={styles.previewAvatar}>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" />
                ) : (
                  initialsOf(displayName || "Devora")
                )}
              </div>

              {displayName.trim() ? (
                <div className={styles.previewName}>{displayName.trim()}</div>
              ) : (
                <div className={styles.previewPlaceholder}>Your name</div>
              )}

              {username.trim() ? (
                <div className={styles.previewHandle}>@{username.trim()}</div>
              ) : (
                <div className={styles.previewPlaceholder} style={{ marginTop: 8 }}>
                  your-handle
                </div>
              )}

              {(developerRole || location) && (
                <div className={styles.previewMeta}>
                  {[developerRole, location].filter(Boolean).join(" · ")}
                </div>
              )}

              {bio.trim() && <p className={styles.previewBio}>{bio.trim()}</p>}

              <div className={styles.previewBlock}>
                <div className={styles.previewBlockLabel}>Skills</div>
                {skills.length === 0 ? (
                  <p className={styles.emptyNote}>No skills added yet</p>
                ) : (
                  <div className={styles.previewTags}>
                    {skills.slice(0, 6).map((s) => (
                      <span key={s} className={styles.previewTag}>
                        {s}
                      </span>
                    ))}
                    {skills.length > 6 && (
                      <span className={styles.previewTagMore}>+{skills.length - 6} more</span>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.previewBlock}>
                <div className={styles.previewBlockLabel}>Profiles</div>
                {(() => {
                  const shown = LINK_SPECS.filter((s) => links[s.key].trim().length > 0);
                  if (shown.length === 0) {
                    return <p className={styles.emptyNote}>No profiles added yet</p>;
                  }
                  return (
                    <div className={styles.previewLinks}>
                      {shown.map((spec) => (
                        <a
                          key={spec.key}
                          className={styles.previewLink}
                          href={links[spec.key]}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {spec.logo ? (
                            <Image
                              className={styles.previewLinkIcon}
                              src={spec.logo}
                              alt=""
                              width={16}
                              height={16}
                            />
                          ) : (
                            <span className={styles.previewLinkDot} aria-hidden="true" />
                          )}
                          <span>{spec.label}</span>
                        </a>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <p className={styles.hint} style={{ marginTop: 14, textAlign: "center" }}>
            This preview shows only what you have entered. Nothing is invented.
          </p>
        </aside>
      </div>
    </>
  );
}

/* ------------------------- inline glyphs (no asset) ---------------------- */

function LinkGlyph({ linkKey }: { linkKey: LinkKey }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { color: "var(--text-dim)" },
  };

  if (linkKey === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ color: "#6aa6d8" }}>
        <path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95C20.2 8.75 21 11 21 14.1V21h-4v-6.1c0-1.45-.03-3.3-2.02-3.3-2.02 0-2.33 1.57-2.33 3.2V21H9z" />
      </svg>
    );
  }

  // Portfolio / personal website
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z" />
    </svg>
  );
}

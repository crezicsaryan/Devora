"use client";

/**
 * Devora onboarding — premium multi-step profile setup.
 *
 * Structure
 *   left rail : logo, statement, numbered progress (01–05)
 *   right side: the active step card, with Back / Continue
 *   mobile    : single column, progress on top, sticky bottom action bar
 *
 * Every step persists to the backend on Continue, so a refresh mid-flow keeps
 * the user's work. Step completion is re-derived from the server on load.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api-client";
import { PLATFORMS, type ConnectedPlatform } from "@/lib/types";
import { ProfileStep } from "@/components/onboarding/ProfileStep";
import { SkillsStep } from "@/components/onboarding/SkillsStep";
import { PlatformsStep } from "@/components/onboarding/PlatformsStep";
import { SocialStep } from "@/components/onboarding/SocialStep";
import { ReviewStep } from "@/components/onboarding/ReviewStep";
import { SyncOverlay } from "@/components/onboarding/SyncOverlay";
import styles from "@/app/onboarding/onboarding.module.css";

export const STEPS = [
  { n: "01", key: "profile", label: "Profile" },
  { n: "02", key: "skills", label: "Skills" },
  { n: "03", key: "platforms", label: "Platforms" },
  { n: "04", key: "social", label: "Social" },
  { n: "05", key: "review", label: "Review" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export type OnboardingDraft = {
  displayName: string;
  username: string;
  bio: string;
  developerRole: string;
  location: string;
  avatarUrl: string;
  skills: string[];
  socials: {
    linkedin: string;
    github: string;
    twitter: string;
    portfolio: string;
    email: string;
  };
  platforms: ConnectedPlatform[];
};

const EMPTY_DRAFT: OnboardingDraft = {
  displayName: "",
  username: "",
  bio: "",
  developerRole: "",
  location: "",
  avatarUrl: "",
  skills: [],
  socials: { linkedin: "", github: "", twitter: "", portfolio: "", email: "" },
  platforms: [],
};

function stepFromQuery(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n : 1;
}

/**
 * Turn the flat rows returned by `GET /api/platforms` into the richer shape the
 * steps render. Explicitly typed so the object literal cannot be narrowed by
 * inference — this runs from two different places (bootstrap and the OAuth
 * callback round-trip), and both must produce identical data.
 */
export function toConnectedPlatforms(
  rows: {
    platform: string;
    username: string;
    status: string;
    syncStatus: string;
    syncError: string | null;
    lastSyncedAt: string | null;
    profileUrl: string | null;
  }[]
): ConnectedPlatform[] {
  const out: ConnectedPlatform[] = [];
  for (const row of rows) {
    const meta = PLATFORMS.find((m) => m.key === row.platform);
    if (!meta) continue;
    const account: ConnectedPlatform["account"] = {
      id: row.platform,
      platform: meta.key,
      username: row.username,
      profileUrl: row.profileUrl,
      avatarUrl: null,
      authType: meta.authType,
      connectionStatus: row.status as ConnectedPlatform["account"]["connectionStatus"],
      syncStatus: row.syncStatus as ConnectedPlatform["account"]["syncStatus"],
      syncError: row.syncError,
      lastSyncedAt: row.lastSyncedAt,
      connectedAt: new Date().toISOString(),
    };
    out.push({ account, stats: null, meta });
  }
  return out;
}

export function OnboardingFlow() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState(() => stepFromQuery(params.get("step")));
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [completion, setCompletion] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  /* ----------------------------- bootstrap ----------------------------- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const session = await api.session();
      if (!alive) return;

      if (!session.ok || !session.data.authenticated) {
        router.replace("/login?next=/onboarding");
        return;
      }
      if (session.data.onboardingCompleted) {
        router.replace("/dashboard");
        return;
      }

      const [draftRes, platformRes] = await Promise.all([
        api.onboardingDraft(),
        api.platforms(),
      ]);

      if (!alive) return;

      if (draftRes.ok) {
        const d = draftRes.data;
        setDraft((prev) => ({
          ...prev,
          displayName: d.profile.displayName || prev.displayName,
          username: d.profile.username || prev.username,
          bio: d.profile.bio || "",
          developerRole: d.profile.developerRole || "",
          location: d.profile.location || "",
          avatarUrl: d.profile.avatarUrl || "",
          skills: d.skills ?? [],
          socials: {
            linkedin: d.profile.socials.linkedin ?? "",
            github: d.profile.socials.github ?? "",
            twitter: d.profile.socials.twitter ?? "",
            portfolio: d.profile.socials.portfolio ?? d.profile.socials.website ?? "",
            email: d.profile.email ?? "",
          },
        }));
        setCompletion(d.completion?.percent ?? 0);
      } else if (draftRes.status === 401) {
        router.replace("/login?next=/onboarding");
        return;
      }

      if (platformRes.ok) {
        setDraft((prev) => ({
          ...prev,
          platforms: toConnectedPlatforms(platformRes.data.platforms),
        }));
      }

      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  /* --------------------- GitHub callback round-trip -------------------- */

  useEffect(() => {
    let alive = true;

    void (async () => {
      const connected = params.get("platform_connected");
      const failed = params.get("platform_error");
      const message = params.get("platform_message");
      if (!connected && !failed) return;

      // Clean the query string first so a refresh does not re-announce it.
      window.history.replaceState({}, "", "/onboarding?step=3");
      if (!alive) return;

      if (connected === "github") {
        setNotice("GitHub connected successfully. Syncing your developer activity…");
        setStep(3);
        const res = await api.platforms();
        if (!alive || !res.ok) return;
        setDraft((prev) => ({
          ...prev,
          platforms: toConnectedPlatforms(res.data.platforms),
        }));
        return;
      }

      setError(
        failed === "github_not_configured"
          ? "GitHub authorization is not configured on this deployment yet."
          : message || "GitHub could not be connected. You can try again or continue."
      );
      setStep(3);
    })();

    return () => {
      alive = false;
    };
  }, [params]);

  /* ------------------------------- helpers ----------------------------- */

  const patch = useCallback((values: Partial<OnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...values }));
  }, []);

  const setStepAndUrl = useCallback((next: number) => {
    setStep(next);
    window.history.replaceState({}, "", `/onboarding?step=${next}`);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const goNext = useCallback(() => {
    setStepAndUrl(Math.min(step + 1, STEPS.length));
  }, [step, setStepAndUrl]);

  const goBack = useCallback(() => {
    setStepAndUrl(Math.max(step - 1, 1));
  }, [step, setStepAndUrl]);

  const reloadPlatforms = useCallback(async () => {
    const res = await api.platforms();
    if (!res.ok) return;
    setDraft((prev) => ({
      ...prev,
      platforms: res.data.platforms
        .map((p) => {
          const meta = PLATFORMS.find((m) => m.key === p.platform);
          if (!meta) return null;
          const previous = prev.platforms.find((x) => x.account.platform === meta.key);
          return {
            account: {
              ...(previous?.account ?? {
                id: p.platform,
                platform: meta.key,
                authType: meta.authType,
                connectedAt: new Date().toISOString(),
                avatarUrl: null,
              }),
              username: p.username,
              profileUrl: p.profileUrl,
              connectionStatus: p.status as ConnectedPlatform["account"]["connectionStatus"],
              syncStatus: p.syncStatus as ConnectedPlatform["account"]["syncStatus"],
              syncError: p.syncError,
              lastSyncedAt: p.lastSyncedAt,
            },
            stats: previous?.stats ?? null,
            meta,
          } satisfies ConnectedPlatform;
        })
        .filter((p): p is ConnectedPlatform => p !== null),
    }));
  }, []);

  /** Save the current step. Returns false when the step cannot be advanced. */
  const persistStep = useCallback(async (): Promise<boolean> => {
    if (step === 1) {
      const res = await api.saveProfileStep({
        displayName: draft.displayName,
        username: draft.username,
        bio: draft.bio,
        developerRole: draft.developerRole,
        location: draft.location,
        avatarUrl: draft.avatarUrl || null,
      });
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      setCompletion(res.data.completion?.percent ?? completion);
      return true;
    }

    if (step === 2) {
      const res = await api.saveSkills(draft.skills);
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      setCompletion(res.data.completion?.percent ?? completion);
      return true;
    }

    if (step === 4) {
      const res = await api.saveSocials({
        linkedin: draft.socials.linkedin,
        github: draft.socials.github,
        twitter: draft.socials.twitter,
        portfolio: draft.socials.portfolio,
        email: draft.socials.email,
      });
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      setCompletion(res.data.completion?.percent ?? completion);
      return true;
    }

    // Step 3 (platforms) and step 5 (review) saved their own data already.
    return true;
  }, [step, draft, completion]);

  const handleContinue = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const ok = await persistStep();
      if (!ok) return;
      goNext();
    } finally {
      setSaving(false);
    }
  }, [persistStep, goNext]);

  const handleComplete = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const ok = await persistStep();
      if (!ok) return;

      const res = await api.completeOnboarding();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSyncing(true);
      // The overlay holds the loading narration briefly, then hands off to the
      // dashboard — which renders real (possibly partial) data immediately.
      await new Promise((resolve) => setTimeout(resolve, 2600));
      router.replace("/dashboard");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [persistStep, router]);

  const canContinue = useMemo(() => {
    if (step === 1) {
      return draft.displayName.trim().length > 0 && /^[a-z0-9_-]{3,30}$/.test(draft.username);
    }
    return true;
  }, [step, draft.displayName, draft.username]);

  const platformCount = draft.platforms.filter(
    (p) => p.account.connectionStatus === "connected"
  ).length;

  /* -------------------------------- render ----------------------------- */

  if (loading) {
    return (
      <div className={styles.bootScreen}>
        <div className={styles.bootMark}>
          <Image src="/logo/devora-mark.png" alt="" width={34} height={44} priority />
        </div>
        <p className={styles.bootText}>Preparing your Devora setup…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.glow} ${styles.glowA}`} />
      <div className={`${styles.glow} ${styles.glowB}`} />

      {/* ---------- Left rail ---------- */}
      <aside className={styles.rail}>
        <div className={styles.railTop}>
          <Image
            src="/logo/devora-lockup-white.png"
            alt="Devora"
            width={150}
            height={43}
            priority
            className={styles.railLogo}
          />
          <h1 className={styles.railStatement}>Build your developer identity.</h1>
          <p className={styles.railSub}>
            One profile that carries your skills, your platforms and your progress.
          </p>
        </div>

        <nav className={styles.progress} aria-label="Onboarding progress">
          {STEPS.map((s, index) => {
            const number = index + 1;
            const state = number === step ? "current" : number < step ? "done" : "todo";
            return (
              <button
                key={s.key}
                type="button"
                className={`${styles.progressItem} ${styles[state]}`}
                onClick={() => number < step && setStepAndUrl(number)}
                disabled={number > step}
                aria-current={number === step ? "step" : undefined}
              >
                <span className={styles.progressNum}>
                  {state === "done" ? <CheckGlyph /> : s.n}
                </span>
                <span className={styles.progressLabel}>{s.label}</span>
                {state === "current" && <span className={styles.progressBar} />}
              </button>
            );
          })}
        </nav>

        <div className={styles.railFoot}>
          <span className={styles.railFootLabel}>Profile completion</span>
          <div className={styles.railMeter}>
            <div className={styles.railMeterFill} style={{ width: `${completion}%` }} />
          </div>
          <span className={styles.railFootValue}>{completion}%</span>
        </div>
      </aside>

      {/* ---------- Right side ---------- */}
      <main className={styles.main} ref={cardRef}>
        {/* Mobile progress */}
        <div className={styles.mobileProgress}>
          <div className={styles.mobileProgressHead}>
            <span className={styles.mobileStep}>Step {step} of {STEPS.length}</span>
            <span className={styles.mobileStepLabel}>{STEPS[step - 1].label}</span>
          </div>
          <div className={styles.mobileTrack}>
            {STEPS.map((s, index) => (
              <span
                key={s.key}
                className={`${styles.mobileSeg} ${index + 1 <= step ? styles.mobileSegOn : ""}`}
              />
            ))}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.stepPill}>Step {step} of {STEPS.length}</span>
            {step === 3 && platformCount > 0 && (
              <span className={styles.connectedPill}>
                {platformCount} connected
              </span>
            )}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className={styles.cardBody}
            >
              {error && (
                <div className={styles.errorBox} role="alert">
                  <span>{error}</span>
                  <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
                    ✕
                  </button>
                </div>
              )}
              {/* An error supersedes any success notice — no effect needed. */}
              {notice && !error && (
                <div className={styles.noticeBox} role="status">
                  {notice}
                </div>
              )}

              {step === 1 && (
                <ProfileStep draft={draft} patch={patch} onError={setError} />
              )}
              {step === 2 && (
                <SkillsStep
                  selected={draft.skills}
                  onChange={(skills) => patch({ skills })}
                  onError={setError}
                />
              )}
              {step === 3 && (
                <PlatformsStep
                  draft={draft}
                  onChanged={reloadPlatforms}
                  onError={setError}
                  onNotice={setNotice}
                />
              )}
              {step === 4 && (
                <SocialStep
                  socials={draft.socials}
                  username={draft.username}
                  onChange={(socials) => patch({ socials })}
                  onError={setError}
                />
              )}
              {step === 5 && <ReviewStep draft={draft} onEdit={setStepAndUrl} />}
            </motion.div>
          </AnimatePresence>

          {/* Desktop actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={goBack}
              disabled={step === 1 || saving}
            >
              ← Back
            </button>

            {step < STEPS.length ? (
              <button
                type="button"
                className={styles.nextBtn}
                onClick={handleContinue}
                disabled={!canContinue || saving}
              >
                {saving ? "Saving…" : "Continue →"}
              </button>
            ) : (
              <button
                type="button"
                className={styles.nextBtn}
                onClick={handleComplete}
                disabled={saving}
              >
                {saving ? "Building your dashboard…" : "Complete Setup →"}
              </button>
            )}
          </div>
        </div>

        {/* Mobile sticky action bar */}
        <div className={styles.stickyBar}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={goBack}
            disabled={step === 1 || saving}
          >
            ← Back
          </button>
          {step < STEPS.length ? (
            <button
              type="button"
              className={styles.nextBtn}
              onClick={handleContinue}
              disabled={!canContinue || saving}
            >
              {saving ? "Saving…" : "Continue →"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.nextBtn}
              onClick={handleComplete}
              disabled={saving}
            >
              {saving ? "Finishing…" : "Complete Setup →"}
            </button>
          )}
        </div>
      </main>

      <AnimatePresence>
        {syncing && <SyncOverlay platforms={draft.platforms} />}
      </AnimatePresence>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12.5l4.5 4.5L19 7"
      />
    </svg>
  );
}

"use client";

/**
 * Step 3 — Coding platform connections.
 *
 * One card per platform, each backed by the same adapter contract on the
 * server. GitHub uses OAuth (the browser is handed off to github.com); the
 * others connect by handle and are verified before being stored.
 *
 * The frontend never calls an external API itself — every action goes through
 * /api/platforms.
 */

import { useCallback, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api-client";
import { PLATFORMS, type PlatformMeta } from "@/lib/types";
import type { OnboardingDraft } from "@/components/onboarding/OnboardingFlow";
import styles from "@/app/onboarding/onboarding.module.css";

type BusyState =
  | { kind: "idle" }
  | { kind: "verifying"; platform: string }
  | { kind: "connecting"; platform: string }
  | { kind: "syncing"; platform: string }
  | { kind: "disconnecting"; platform: string };

export function PlatformsStep({
  draft,
  onChanged,
  onError,
  onNotice,
}: {
  draft: OnboardingDraft;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState<BusyState>({ kind: "idle" });
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [verifyState, setVerifyState] = useState<
    Record<string, { ok: boolean; message: string } | undefined>
  >({});

  const connectedFor = useCallback(
    (key: string) =>
      draft.platforms.find(
        (p) => p.account.platform === key && p.account.connectionStatus === "connected"
      ),
    [draft.platforms]
  );

  /* ----------------------------- actions ------------------------------ */

  const connectGitHub = useCallback(() => {
    onError(null);
    onNotice(null);
    // Full-page handoff to GitHub via our own authorize route. This must be a
    // real navigation (not a client-side route change) because the route
    // responds with a 302 to github.com. No token ever touches this tab.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/platforms/github/authorize?next=${encodeURIComponent(
      "/profile/create"
    )}`;
  }, [onError, onNotice]);

  const verify = useCallback(
    async (meta: PlatformMeta) => {
      const handle = (handles[meta.key] ?? "").trim();
      if (!handle) {
        onError("Enter your username first.");
        return;
      }
      onError(null);
      setBusy({ kind: "verifying", platform: meta.key });
      const res = await api.verifyPlatform(meta.key, handle);
      setBusy({ kind: "idle" });

      if (!res.ok) {
        setVerifyState((prev) => ({
          ...prev,
          [meta.key]: { ok: false, message: res.error },
        }));
        return;
      }
      setVerifyState((prev) => ({
        ...prev,
        [meta.key]: {
          ok: res.data.exists,
          message: res.data.exists
            ? res.data.message ?? "Profile found"
            : res.data.message ?? "Profile not found",
        },
      }));
    },
    [handles, onError]
  );

  const connect = useCallback(
    async (meta: PlatformMeta) => {
      const handle = (handles[meta.key] ?? "").trim();
      if (!handle) {
        onError("Enter your username first.");
        return;
      }
      onError(null);
      onNotice(null);
      setBusy({ kind: "connecting", platform: meta.key });

      const res = await api.connectPlatform(meta.key, handle);
      if (!res.ok) {
        setBusy({ kind: "idle" });
        onError(res.error);
        return;
      }

      await onChanged();
      setHandles((prev) => ({ ...prev, [meta.key]: "" }));

      // Kick off the first sync for that platform straight away.
      setBusy({ kind: "syncing", platform: meta.key });
      const syncRes = await api.syncPlatform(meta.key);
      setBusy({ kind: "idle" });

      if (!syncRes.ok || !syncRes.data.ok) {
        // A failed sync must not block onboarding — the account stays
        // connected and the dashboard offers Retry.
        onError(
          syncRes.ok
            ? syncRes.data.error ?? `${meta.label} connected, but the first sync failed.`
            : syncRes.error
        );
        await onChanged();
        return;
      }

      onNotice(`${meta.label} connected and synchronized.`);
      await onChanged();
    },
    [handles, onChanged, onError, onNotice]
  );

  const sync = useCallback(
    async (meta: PlatformMeta) => {
      onError(null);
      onNotice(null);
      setBusy({ kind: "syncing", platform: meta.key });
      const res = await api.syncPlatform(meta.key);
      setBusy({ kind: "idle" });
      if (!res.ok || !res.data.ok) {
        onError(res.ok ? res.data.error ?? "Sync failed." : res.error);
      } else {
        onNotice(`${meta.label} synchronized.`);
      }
      await onChanged();
    },
    [onChanged, onError, onNotice]
  );

  const disconnect = useCallback(
    async (meta: PlatformMeta) => {
      onError(null);
      onNotice(null);
      setBusy({ kind: "disconnecting", platform: meta.key });
      const res = await api.disconnectPlatform(meta.key);
      setBusy({ kind: "idle" });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onNotice(`${meta.label} disconnected.`);
      await onChanged();
    },
    [onChanged, onError, onNotice]
  );

  const connectedCount = draft.platforms.filter(
    (p) => p.account.connectionStatus === "connected"
  ).length;

  /* ------------------------------ render ----------------------------- */

  return (
    <div className={styles.stepWrap}>
      <header className={styles.stepHead}>
        <h2 className={styles.stepTitle}>Connect your coding journey.</h2>
        <p className={styles.stepSub}>
          Bring your coding activity together in one place. Connect what you use —
          you can add the rest later.
        </p>
      </header>

      <div className={styles.platformIntro}>
        <span className={styles.platformIntroDot} aria-hidden="true" />
        <span>
          Devora reads only publicly available data, through each platform&apos;s
          own APIs. Nothing is posted on your behalf.
        </span>
      </div>

      <div className={styles.platformGrid}>
        {PLATFORMS.map((meta) => {
          const connected = connectedFor(meta.key);
          const isBusy =
            busy.kind !== "idle" && "platform" in busy && busy.platform === meta.key;
          const verdict = verifyState[meta.key];

          return (
            <article
              key={meta.key}
              className={`${styles.platformCard} ${
                connected ? styles.platformCardOn : ""
              }`}
            >
              <header className={styles.platformCardHead}>
                <span className={styles.platformLogoWrap}>
                  <Image
                    src={meta.logo}
                    alt=""
                    width={24}
                    height={24}
                    className={styles.platformLogo}
                  />
                </span>
                <div className={styles.platformNameWrap}>
                  <span className={styles.platformName}>{meta.label}</span>
                  {connected ? (
                    <span className={styles.statusConnected}>
                      <span className={styles.statusDot} aria-hidden="true" />
                      Connected
                    </span>
                  ) : (
                    <span className={styles.statusIdle}>Not connected</span>
                  )}
                </div>
              </header>

              <p className={styles.platformDesc}>{meta.description}</p>

              {connected ? (
                <div className={styles.platformConnectedBody}>
                  <div className={styles.platformHandle}>@{connected.account.username}</div>
                  <div className={styles.platformSyncLine}>
                    {connected.account.syncStatus === "syncing" ? (
                      <span className={styles.syncSyncing}>⟳ Syncing…</span>
                    ) : connected.account.syncStatus === "failed" ? (
                      <span className={styles.syncFailed}>
                        ⚠ {connected.account.syncError ?? "Sync failed"}
                      </span>
                    ) : connected.account.lastSyncedAt ? (
                      <span className={styles.syncOk}>
                        ✓ Last synced {relativeTime(connected.account.lastSyncedAt)}
                      </span>
                    ) : (
                      <span className={styles.syncIdle}>Waiting for first sync</span>
                    )}
                  </div>

                  <div className={styles.platformActions}>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => sync(meta)}
                      disabled={isBusy}
                    >
                      {isBusy && busy.kind === "syncing" ? "Syncing…" : "Sync"}
                    </button>
                    <button
                      type="button"
                      className={styles.smallDangerBtn}
                      onClick={() => disconnect(meta)}
                      disabled={isBusy}
                    >
                      {isBusy && busy.kind === "disconnecting" ? "Removing…" : "Disconnect"}
                    </button>
                  </div>
                </div>
              ) : meta.authType === "oauth" ? (
                <div className={styles.platformConnectBody}>
                  <p className={styles.platformOAuthNote}>
                    GitHub connects through a secure authorization flow. You&apos;ll be
                    sent to GitHub and returned here — Devora never sees your password.
                  </p>
                  <button
                    type="button"
                    className={styles.connectBtn}
                    onClick={connectGitHub}
                    disabled={isBusy}
                  >
                    <GithubGlyph />
                    Connect GitHub
                  </button>
                </div>
              ) : (
                <div className={styles.platformConnectBody}>
                  <div className={styles.handleRow}>
                    <input
                      className={styles.input}
                      value={handles[meta.key] ?? ""}
                      onChange={(e) =>
                        setHandles((prev) => ({ ...prev, [meta.key]: e.target.value }))
                      }
                      onBlur={() => {
                        const value = (handles[meta.key] ?? "").trim();
                        if (value) void verify(meta);
                      }}
                      placeholder={meta.handlePlaceholder}
                      aria-label={meta.handleLabel}
                      spellCheck={false}
                      maxLength={60}
                    />
                  </div>

                  {verdict && (
                    <span className={verdict.ok ? styles.helperOk : styles.helperBad}>
                      {verdict.ok ? "✓ " : "✕ "}
                      {verdict.message}
                    </span>
                  )}
                  {!verdict && (
                    <span className={styles.helperNeutral}>{meta.availabilityHint}</span>
                  )}

                  <div className={styles.platformActions}>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => verify(meta)}
                      disabled={isBusy || !(handles[meta.key] ?? "").trim()}
                    >
                      {isBusy && busy.kind === "verifying" ? "Checking…" : "Check"}
                    </button>
                    <button
                      type="button"
                      className={styles.connectBtn}
                      onClick={() => connect(meta)}
                      disabled={isBusy || !(handles[meta.key] ?? "").trim()}
                    >
                      {isBusy && (busy.kind === "connecting" || busy.kind === "syncing")
                        ? "Connecting…"
                        : `Connect ${meta.label}`}
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {connectedCount === 0 && (
        <p className={styles.platformSkipNote}>
          You can skip this step — connect a platform any time from Connected
          Platforms. Your dashboard will simply show “—” until data arrives.
        </p>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function GithubGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

"use client";

/**
 * Connected platforms manager.
 *
 * Shows every supported platform, its connection state, last sync and any sync
 * error, with Connect / Sync / Disconnect wired to the real backend. GitHub
 * connects through the OAuth authorize endpoint — never a password prompt.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { PLATFORMS, type PlatformKey } from "@/lib/types";
import { PlatformLogo } from "@/components/dashboard/DashboardView";
import styles from "@/app/dashboard/dashboard.module.css";

type Row = {
  platform: PlatformKey;
  username: string;
  status: string;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: string | null;
  profileUrl: string | null;
};

export function PlatformsManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await api.platforms();
    if (res.ok) {
      setRows(res.data.platforms as Row[]);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;

    void (async () => {
      // Surface the OAuth round-trip result once, then clean the URL so a
      // refresh does not re-announce it. Reading `location` and writing state
      // both happen after the effect's synchronous phase.
      const params = new URLSearchParams(window.location.search);
      if (params.get("platform_connected") === "github") {
        window.history.replaceState({}, "", "/dashboard/platforms");
        if (!alive) return;
        setNotice("GitHub connected successfully. Syncing your developer activity…");
      } else if (params.get("platform_error")) {
        const message = params.get("platform_message");
        window.history.replaceState({}, "", "/dashboard/platforms");
        if (!alive) return;
        setError(message || "That platform could not be connected.");
      }

      const res = await api.platforms();
      if (!alive) return;
      if (res.ok) {
        setRows(res.data.platforms as Row[]);
      } else {
        setError(res.error);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const rowFor = (key: PlatformKey) => rows.find((r) => r.platform === key);

  const checkHandle = useCallback(async (key: PlatformKey) => {
    const value = (handles[key] ?? "").trim();
    if (!value) return;
    setChecks((c) => ({ ...c, [key]: "checking" }));
    const res = await api.verifyPlatform(key, value);
    if (!res.ok) {
      setChecks((c) => ({ ...c, [key]: res.error }));
      return;
    }
    setChecks((c) => ({
      ...c,
      [key]: res.data.exists ? "" : res.data.message || "No profile with that handle.",
    }));
    if (res.data.exists) {
      setHandles((h) => ({ ...h, [key]: value }));
    }
  }, [handles]);

  const connect = useCallback(
    async (key: PlatformKey) => {
      const username = (handles[key] ?? "").trim();
      if (!username) {
        setChecks((c) => ({ ...c, [key]: "Enter your handle first." }));
        return;
      }
      setBusy(key);
      setError(null);
      const res = await api.connectPlatform(key, username);
      if (!res.ok) {
        setBusy(null);
        setError(res.error);
        return;
      }
      // Immediately pull first data so the dashboard is not empty.
      await api.syncPlatform(key);
      await load();
      setBusy(null);
      setNotice(`${key} connected and synced.`);
      setTimeout(() => setNotice(null), 2600);
    },
    [handles, load]
  );

  const sync = useCallback(
    async (key: PlatformKey) => {
      setBusy(key);
      setError(null);
      const res = await api.syncPlatform(key);
      await load();
      setBusy(null);
      if (!res.ok) {
        setError(`${key}: ${res.error}`);
        return;
      }
      if (res.data.syncStatus === "failed") {
        setError(`${key}: sync failed — ${res.data.error ?? "unknown error"}. Try again.`);
        return;
      }
      setNotice(`${key} synced.`);
      setTimeout(() => setNotice(null), 2200);
    },
    [load]
  );

  const disconnect = useCallback(
    async (key: PlatformKey) => {
      setBusy(key);
      setError(null);
      const res = await api.disconnectPlatform(key);
      await load();
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(`${key} disconnected.`);
      setTimeout(() => setNotice(null), 2200);
    },
    [load]
  );

  if (loading) {
    return (
      <>
        <h1 className={styles.pageTitle}>Connected Platforms</h1>
        <div className={styles.skeleton} style={{ height: 400, marginTop: 18 }} />
      </>
    );
  }

  return (
    <>
      <h1 className={styles.pageTitle}>Connected Platforms</h1>
      <p className={styles.pageSub}>
        Devora reads each platform&apos;s permitted public data server-side and normalizes it into
        your dashboard.
      </p>

      {error && (
        <div className={`${styles.banner} ${styles.section}`} data-tone="error">
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className={`${styles.banner} ${styles.section}`} data-tone="info">
          <span>{notice}</span>
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.listCard}>
          {PLATFORMS.map((meta) => {
            const row = rowFor(meta.key);
            const connected = row?.status === "connected";
            const isOAuth = meta.authType === "oauth";
            const handledBusy = busy === meta.key;

            return (
              <div key={meta.key} className={styles.listRow}>
                <PlatformLogo platform={meta.key} size={30} />
                <div className={styles.listRowMain}>
                  <span className={styles.listRowTitle}>{meta.label}</span>
                  <span className={styles.listRowSub}>
                    {connected ? (
                      <>
                        @{row!.username}
                        {row!.lastSyncedAt ? ` · last synced ${relativeTime(row!.lastSyncedAt)}` : ""}
                      </>
                    ) : (
                      meta.description
                    )}
                  </span>
                  {connected && row?.syncError && (
                    <span className={styles.listRowSub} style={{ color: "#f87171" }}>
                      ⚠ {row.syncError}
                    </span>
                  )}
                  {!connected && checks[meta.key] && (
                    <span className={styles.listRowSub} style={{ color: "#f87171" }}>
                      {checks[meta.key] === "checking" ? "Checking…" : checks[meta.key]}
                    </span>
                  )}
                </div>

                <div className={styles.listRowActions}>
                  {connected ? (
                    <>
                      <span className={styles.pill} data-tone={syncTone(row?.syncStatus)}>
                        {syncIcon(row?.syncStatus)} {syncLabel(row?.syncStatus)}
                      </span>
                      <button
                        type="button"
                        className={styles.btnSubtle}
                        disabled={handledBusy}
                        onClick={() => sync(meta.key)}
                      >
                        {handledBusy ? "Syncing…" : "Sync"}
                      </button>
                      <button
                        type="button"
                        className={styles.btnDanger}
                        disabled={handledBusy}
                        onClick={() => disconnect(meta.key)}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : isOAuth ? (
                    <>
                      <span className={styles.pill}>{meta.availabilityHint}</span>
                      <a
                        className={styles.btnPrimary}
                        href={`/api/platforms/github/authorize?next=/dashboard/platforms`}
                      >
                        Connect GitHub
                      </a>
                    </>
                  ) : (
                    <>
                      <input
                        className={styles.input}
                        style={{ width: 168 }}
                        placeholder={meta.handlePlaceholder}
                        value={handles[meta.key] ?? ""}
                        onChange={(e) =>
                          setHandles((h) => ({ ...h, [meta.key]: e.target.value }))
                        }
                        onBlur={() => checkHandle(meta.key)}
                        aria-label={meta.handleLabel}
                      />
                      <button
                        type="button"
                        className={styles.btnSubtle}
                        disabled={handledBusy}
                        onClick={() => checkHandle(meta.key)}
                      >
                        Check
                      </button>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={handledBusy}
                        onClick={() => connect(meta.key)}
                      >
                        {handledBusy ? "Connecting…" : "Connect"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className={styles.hint} style={{ marginTop: 14 }}>
          Platform checks respect each site&apos;s rate limits and only use publicly available
          profile data. GitHub uses OAuth so your token is stored server-side and never exposed to
          the browser.
        </p>
      </section>
    </>
  );
}

function syncLabel(status?: string): string {
  switch (status) {
    case "ok":
      return "Synced";
    case "syncing":
      return "Syncing";
    case "failed":
      return "Sync failed";
    default:
      return "Not synced";
  }
}

function syncIcon(status?: string): string {
  switch (status) {
    case "ok":
      return "✓";
    case "syncing":
      return "⟳";
    case "failed":
      return "⚠";
    default:
      return "";
  }
}

function syncTone(status?: string): "ok" | "warn" | "bad" | "accent" {
  if (status === "ok") return "ok";
  if (status === "failed") return "bad";
  if (status === "syncing") return "accent";
  return "warn";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

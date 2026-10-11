"use client";

/**
 * Connected platforms manager.
 *
 * The page keeps two ideas apart, because they are genuinely different:
 *
 *   • Verified integration — the platform itself confirmed the account. It can
 *     be synced, and its figures appear on the dashboard.
 *   • Saved profile link — a URL we stored but could not (or cannot) verify. It
 *     is shown as a link and is never presented as synchronized data.
 *
 * Every message shown here comes from the server's classified result, so a
 * rate limit, a network failure and a genuinely wrong username each read
 * differently instead of collapsing into "could not verify that username".
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import {
  PLATFORMS,
  type PlatformKey,
  type VerificationOutcome,
} from "@/lib/types";
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

type Feedback = { tone: "ok" | "warn" | "bad"; text: string };

/** Link-only profile fields, stored on the profile row rather than as accounts. */
const PROFILE_LINKS = [
  {
    key: "linkedin",
    label: "LinkedIn",
    placeholder: "https://www.linkedin.com/in/username",
    note: "Saved as a public profile link. Devora never imports LinkedIn activity.",
  },
  {
    key: "portfolio",
    label: "Portfolio / Personal website",
    placeholder: "https://your-site.dev",
    note: "Saved as a public profile link.",
  },
] as const;

function toneForOutcome(outcome: VerificationOutcome, exists: boolean): Feedback["tone"] {
  if (outcome === "VERIFIED" && exists) return "ok";
  if (outcome === "INVALID_PROFILE") return "bad";
  return "warn";
}

export function PlatformsManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [profileLinks, setProfileLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback | undefined>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const res = await api.platforms();
    if (res.ok) {
      setRows(res.data.platforms as Row[]);
      setProfileLinks(res.data.profileLinks ?? {});
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
      // refresh does not re-announce it.
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
        setProfileLinks(res.data.profileLinks ?? {});
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

  const setFeedbackFor = (key: string, value: Feedback | undefined) =>
    setFeedback((prev) => ({ ...prev, [key]: value }));

  const valueFor = (key: string, row?: Row) =>
    (drafts[key] ?? (editing[key] ? (row?.username ?? "") : "")).trim();

  /** Pre-flight check: asks the platform, and reports what it actually said. */
  const check = useCallback(
    async (key: string, input: string) => {
      if (!input) {
        setFeedbackFor(key, { tone: "bad", text: "Enter your username or profile URL first." });
        return;
      }
      setFeedbackFor(key, { tone: "warn", text: "Checking…" });
      const res = await api.verifyPlatform(key, input);
      if (!res.ok) {
        setFeedbackFor(key, { tone: "bad", text: res.error });
        return;
      }
      setFeedbackFor(key, {
        tone: toneForOutcome(res.data.outcome, res.data.exists),
        text: res.data.message,
      });
    },
    []
  );

  /**
   * Save or connect.
   *
   * One button, because the server decides which outcome applies — verified
   * connection when the platform confirms the account, saved link otherwise —
   * and returns the sentence describing what happened.
   */
  const save = useCallback(
    async (key: string, input: string) => {
      if (!input) {
        setFeedbackFor(key, { tone: "bad", text: "Enter your username or profile URL first." });
        return;
      }
      setBusy(key);
      setError(null);
      setNotice(null);
      const res = await api.connectPlatform(key, input);
      if (!res.ok) {
        setBusy(null);
        setFeedbackFor(key, { tone: "bad", text: res.error });
        return;
      }

      // Only a verified integration is worth syncing; a saved link has nothing
      // to sync and the server would refuse anyway.
      if (res.data.connectionStatus === "connected") {
        await api.syncPlatform(key);
      }

      await load();
      setEditing((prev) => ({ ...prev, [key]: false }));
      setDrafts((prev) => ({ ...prev, [key]: "" }));
      setFeedbackFor(key, undefined);
      setBusy(null);
      setNotice(res.data.message);
    },
    [load]
  );

  const sync = useCallback(
    async (key: PlatformKey) => {
      setBusy(key);
      setError(null);
      setNotice(null);
      const res = await api.syncPlatform(key);
      await load();
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data.syncStatus === "failed") {
        setError(res.data.error ?? "Sync failed. Try again shortly.");
        return;
      }
      setNotice("Statistics refreshed.");
    },
    [load]
  );

  const disconnect = useCallback(
    async (key: string) => {
      setBusy(key);
      setError(null);
      setNotice(null);
      const res = await api.disconnectPlatform(key);
      if (key === "linkedin" || key === "portfolio") {
        if (res.ok) setProfileLinks((prev) => ({ ...prev, [key]: "" }));
      } else {
        await load();
      }
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice("Removed.");
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
        A verified connection is confirmed against the platform before anything is stored. When a
        platform cannot be checked, you can still keep your profile as a saved link — it is shown as
        a link and never as synchronized data.
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
            const state = connectionState(row);
            const handledBusy = busy === meta.key;
            const showInput = state !== "connected" || editing[meta.key];
            const value = valueFor(meta.key, row);
            const note = feedback[meta.key];

            return (
              <div key={meta.key} className={styles.listRow}>
                <PlatformLogo platform={meta.key} size={30} />
                <div className={styles.listRowMain}>
                  <span className={styles.listRowTitle}>{meta.label}</span>
                  <span className={styles.listRowSub}>
                    {state === "connected" && (
                      <>
                        @{row!.username}
                        {row!.profileUrl ? (
                          <>
                            {" · "}
                            <a href={row!.profileUrl} target="_blank" rel="noreferrer noopener">
                              profile
                            </a>
                          </>
                        ) : null}
                        {row!.lastSyncedAt ? ` · last synced ${relativeTime(row!.lastSyncedAt)}` : ""}
                      </>
                    )}
                    {state === "linked" && (
                      <>
                        Link saved{row?.username ? ` (@${row.username})` : ""}
                        {row?.profileUrl ? (
                          <>
                            {" · "}
                            <a
                              href={row.profileUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              profile
                            </a>
                          </>
                        ) : null}
                        {" — not verified"}
                      </>
                    )}
                    {state === "none" && meta.description}
                  </span>

                  {meta.linkOnly && (
                    <span className={styles.listRowSub}>{meta.availabilityHint}</span>
                  )}
                  {state === "connected" && row?.syncError && (
                    <span className={styles.listRowSub} style={{ color: "#f87171" }}>
                      ⚠ {row.syncError}
                    </span>
                  )}
                  {note && (
                    <span
                      className={styles.listRowSub}
                      style={{ color: note.tone === "bad" ? "#f87171" : note.tone === "ok" ? "#4ade80" : "#fbbf24" }}
                    >
                      {note.text}
                    </span>
                  )}
                </div>

                <div className={styles.listRowActions}>
                  {state === "connected" && !editing[meta.key] ? (
                    <>
                      <span className={styles.pill} data-tone={syncTone(row?.syncStatus)}>
                        {syncIcon(row?.syncStatus)} {syncLabel(row?.syncStatus)}
                      </span>
                      {!meta.linkOnly && (
                        <button
                          type="button"
                          className={styles.btnSubtle}
                          disabled={handledBusy}
                          onClick={() => sync(meta.key)}
                        >
                          {handledBusy ? "Syncing…" : "Sync"}
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.btnSubtle}
                        disabled={handledBusy}
                        onClick={() => {
                          setEditing((prev) => ({ ...prev, [meta.key]: true }));
                          setDrafts((prev) => ({ ...prev, [meta.key]: row?.username ?? "" }));
                        }}
                      >
                        Edit
                      </button>
                      {meta.authType === "oauth" && (
                        <a
                          className={styles.btnSubtle}
                          href={`/api/platforms/github/authorize?next=/dashboard/platforms`}
                        >
                          Reconnect
                        </a>
                      )}
                      <button
                        type="button"
                        className={styles.btnDanger}
                        disabled={handledBusy}
                        onClick={() => disconnect(meta.key)}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : null}

                  {showInput && (
                    <>
                      <input
                        className={styles.input}
                        style={{ width: 200 }}
                        placeholder={meta.handlePlaceholder}
                        value={drafts[meta.key] ?? ""}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [meta.key]: e.target.value }))
                        }
                        aria-label={meta.handleLabel}
                      />
                      <button
                        type="button"
                        className={styles.btnSubtle}
                        disabled={handledBusy}
                        onClick={() => check(meta.key, value)}
                      >
                        Check
                      </button>
                      <button
                        type="button"
                        className={styles.btnPrimary}
                        disabled={handledBusy}
                        onClick={() => save(meta.key, value)}
                        title={
                          meta.linkOnly
                            ? "This platform has no public statistics source, so the link is saved unverified."
                            : "Verified by the platform, or saved as a link if it cannot be checked."
                        }
                      >
                        {handledBusy ? "Working…" : meta.linkOnly ? "Save link" : "Check & connect"}
                      </button>
                      {/* The authorized path, offered even before anything is
                          saved: “Check & connect” can only ever store a public
                          link for an OAuth platform, so without this the user
                          would have no way to start the handshake from here.
                          A full page load is required — the route answers with
                          a 302 to github.com. */}
                      {meta.authType === "oauth" && (
                        <a
                          className={styles.btnSubtle}
                          href={`/api/platforms/github/authorize?next=${encodeURIComponent(
                            "/dashboard/platforms"
                          )}`}
                        >
                          Connect with GitHub
                        </a>
                      )}
                      {state !== "none" && (
                        <button
                          type="button"
                          className={styles.btnSubtle}
                          disabled={handledBusy}
                          onClick={() => {
                            setEditing((prev) => ({ ...prev, [meta.key]: false }));
                            setDrafts((prev) => ({ ...prev, [meta.key]: "" }));
                            setFeedbackFor(meta.key, undefined);
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </>
                  )}

                  {state === "linked" && !editing[meta.key] && (
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={handledBusy}
                      onClick={() => disconnect(meta.key)}
                    >
                      Remove
                    </button>
                  )}

                  {state === "connected" && meta.authType === "oauth" && (
                    <span className={styles.pill} data-tone="ok">
                      ✓ Verified
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Profile links</h2>
        <p className={styles.pageSub}>
          These are stored as public links on your profile. Nothing is imported from them, so they
          are never shown as a synchronized integration.
        </p>
        <div className={styles.listCard}>
          {PROFILE_LINKS.map((link) => {
            const saved = profileLinks[link.key] ?? "";
            const handledBusy = busy === link.key;
            const note = feedback[link.key];
            return (
              <div key={link.key} className={styles.listRow}>
                <div className={styles.listRowMain}>
                  <span className={styles.listRowTitle}>{link.label}</span>
                  <span className={styles.listRowSub}>
                    {saved ? (
                      <>
                        Saved —{" "}
                        <a href={saved} target="_blank" rel="noreferrer noopener">
                          {saved}
                        </a>
                      </>
                    ) : (
                      link.note
                    )}
                  </span>
                  {note && (
                    <span
                      className={styles.listRowSub}
                      style={{ color: note.tone === "bad" ? "#f87171" : note.tone === "ok" ? "#4ade80" : "#fbbf24" }}
                    >
                      {note.text}
                    </span>
                  )}
                </div>
                <div className={styles.listRowActions}>
                  <input
                    className={styles.input}
                    style={{ width: 220 }}
                    placeholder={link.placeholder}
                    value={drafts[link.key] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [link.key]: e.target.value }))
                    }
                    aria-label={`${link.label} URL`}
                  />
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={handledBusy}
                    onClick={() => save(link.key, (drafts[link.key] ?? "").trim())}
                  >
                    {handledBusy ? "Saving…" : saved ? "Replace link" : "Save link"}
                  </button>
                  {saved && (
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={handledBusy}
                      onClick={() => disconnect(link.key)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className={styles.hint} style={{ marginTop: 14 }}>
        Platform checks respect each site&apos;s rate limits and only ever read publicly available
        profile data. GitHub uses OAuth for authorized access; its token is stored server-side and is
        never exposed to the browser.
      </p>
    </>
  );
}

type ConnectionState = "connected" | "linked" | "none";

function connectionState(row?: Row): ConnectionState {
  if (!row) return "none";
  if (row.status === "connected") return "connected";
  if (row.status === "linked") return "linked";
  return "none";
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

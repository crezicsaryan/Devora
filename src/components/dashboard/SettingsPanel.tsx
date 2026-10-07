"use client";

/**
 * Settings — profile visibility, account actions, sign out.
 *
 * Visibility is persisted server-side and enforced when the public profile is
 * read (`devora_public_profile`), so hiding a field here genuinely hides it.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_VISIBILITY, type Visibility } from "@/lib/types";
import styles from "@/app/dashboard/dashboard.module.css";

const VISIBILITY_ROWS: { key: keyof Visibility; title: string; sub: string }[] = [
  { key: "avatar", title: "Profile photo", sub: "Show your avatar on your public profile." },
  { key: "bio", title: "Bio", sub: "Show your bio text." },
  { key: "role", title: "Developer role", sub: "Show the role you selected." },
  { key: "location", title: "Location", sub: "Show where you are based." },
  { key: "skills", title: "Skills", sub: "Show your languages and technologies." },
  { key: "platforms", title: "Coding platforms", sub: "Show connected platforms and their stats." },
  { key: "socials", title: "Social links", sub: "Show LinkedIn, X, portfolio and website links." },
  { key: "projects", title: "Projects", sub: "Show your projects." },
  { key: "email", title: "Email address", sub: "Off by default — only turn this on if you want it public." },
];

export function SettingsPanel() {
  const router = useRouter();

  const [visibility, setVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [username, setUsername] = useState("");
  const [completion, setCompletion] = useState(0);
  const [items, setItems] = useState<{ label: string; done: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.settings().then((res) => {
      if (!alive) return;
      if (res.ok) {
        setVisibility({ ...DEFAULT_VISIBILITY, ...res.data.visibility });
        setUsername(res.data.username);
        setCompletion(res.data.completion.percent);
        setItems(res.data.completion.items ?? []);
      } else if (res.status === 401) {
        router.replace("/login?next=/dashboard/settings");
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

  const toggle = useCallback(
    async (key: keyof Visibility) => {
      const next = { ...visibility, [key]: !visibility[key] };
      setVisibility(next); // optimistic — rolled back if the server rejects
      setSaving(true);
      setNotice(null);
      const res = await api.saveSettings(next);
      setSaving(false);
      if (!res.ok) {
        setVisibility(visibility);
        setError(res.error);
        return;
      }
      setVisibility({ ...DEFAULT_VISIBILITY, ...res.data.visibility });
      setNotice("✓ Saved");
      setTimeout(() => setNotice(null), 1800);
    },
    [visibility]
  );

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }, [router]);

  if (loading) {
    return (
      <>
        <h1 className={styles.pageTitle}>Settings</h1>
        <div className={styles.skeleton} style={{ height: 400, marginTop: 18 }} />
      </>
    );
  }

  return (
    <>
      <h1 className={styles.pageTitle}>Settings</h1>
      <p className={styles.pageSub}>Control what appears on your public Devora profile.</p>

      {error && (
        <div className={`${styles.banner} ${styles.section}`} data-tone="error">
          <span>{error}</span>
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Profile completion</h2>
          <span className={styles.pill} data-tone={completion === 100 ? "ok" : "accent"}>
            {completion}%
          </span>
        </div>
        <div className={styles.card}>
          <div className={styles.bar} style={{ marginBottom: 16 }}>
            <div className={styles.barFill} style={{ width: `${completion}%` }} />
          </div>
          {items.length === 0 ? (
            <p className={styles.hint}>No completion checks available.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
              {items.map((it) => (
                <li
                  key={it.label}
                  style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}
                >
                  <span
                    style={{
                      width: 17,
                      height: 17,
                      borderRadius: 5,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      border: "1px solid #252529",
                      background: it.done ? "rgba(255,106,0,.16)" : "rgba(255,255,255,.03)",
                      color: it.done ? "#ff6a00" : "#6b7280",
                    }}
                  >
                    {it.done ? "✓" : ""}
                  </span>
                  <span style={{ color: it.done ? "#ffffff" : "#9ca3af" }}>{it.label}</span>
                </li>
              ))}
            </ul>
          )}
          {completion < 100 && (
            <div className={styles.formActions}>
              <Link href="/dashboard/profile" className={styles.btnGhost}>
                Complete your profile
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Public profile visibility</h2>
          {notice && <span className={styles.savedNote}>{notice}</span>}
        </div>
        <div className={styles.card}>
          {VISIBILITY_ROWS.map((row) => (
            <div key={row.key} className={styles.toggleRow}>
              <div className={styles.toggleText}>
                <span className={styles.toggleTitle}>{row.title}</span>
                <span className={styles.toggleSub}>{row.sub}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={visibility[row.key]}
                aria-label={row.title}
                className={styles.switch}
                data-on={visibility[row.key]}
                disabled={saving}
                onClick={() => toggle(row.key)}
              />
            </div>
          ))}
        </div>
        {username && (
          <p className={styles.hint} style={{ marginTop: 10 }}>
            Public link:{" "}
            <Link href={`/u/${username}`} style={{ color: "#ff6a00" }}>
              /u/{username}
            </Link>
          </p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Account</h2>
        </div>
        <div className={styles.card}>
          <div className={styles.toggleRow}>
            <div className={styles.toggleText}>
              <span className={styles.toggleTitle}>Connected platforms</span>
              <span className={styles.toggleSub}>
                Reconnect, sync or disconnect a coding platform.
              </span>
            </div>
            <Link href="/dashboard/platforms" className={styles.btnSubtle}>
              Manage
            </Link>
          </div>
          <div className={styles.toggleRow}>
            <div className={styles.toggleText}>
              <span className={styles.toggleTitle}>Sign out</span>
              <span className={styles.toggleSub}>End this session on this device.</span>
            </div>
            <button type="button" className={styles.btnDanger} onClick={signOut}>
              Log out
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

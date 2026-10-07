"use client";

/**
 * Leaderboard — public ranking by solved count.
 *
 * Only profiles with a username that have completed onboarding appear, and only
 * fields those users have left visible.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { initialsOf } from "@/lib/avatar";
import styles from "@/app/dashboard/dashboard.module.css";

type Row = {
  rank: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  totalSolved: number;
  currentStreak: number;
  isCurrentUser: boolean;
};

export function LeaderboardView() {
  const params = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(params.get("q") ?? "");

  const load = useCallback(async (q: string) => {
    const res = await apiFetch<{ rows: Row[] }>(
      `/api/leaderboard${q ? `?q=${encodeURIComponent(q)}` : ""}`
    );
    if (res.ok) {
      setRows(res.data.rows);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(search), 280);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <>
      <h1 className={styles.pageTitle}>Leaderboard</h1>
      <p className={styles.pageSub}>
        Developers ranked by problems solved across their connected platforms.
      </p>

      <div className={styles.formActions} style={{ marginTop: 16, marginBottom: 14 }}>
        <input
          className={styles.input}
          style={{ maxWidth: 320 }}
          placeholder="Search developers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search developers"
        />
      </div>

      {error && (
        <div className={styles.banner} data-tone="error">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className={styles.skeleton} style={{ height: 320 }} />
      ) : rows.length === 0 ? (
        <div className={styles.empty}>
          <strong>No developers to show yet.</strong>
          <span>
            Profiles appear here once they have finished onboarding and connected at least one
            platform.
          </span>
        </div>
      ) : (
        <div className={styles.listCard}>
          {rows.map((r) => (
            <div
              key={r.username}
              className={styles.listRow}
              style={
                r.isCurrentUser
                  ? { background: "rgba(255,106,0,.06)" }
                  : undefined
              }
            >
              <span
                className={styles.metricValue}
                style={{ width: 34, color: r.rank <= 3 ? "#ff6a00" : "#6b7280" }}
              >
                {r.rank}
              </span>
              <span
                className={styles.avatar}
                style={{ width: 32, height: 32, flexBasis: 32, borderRadius: 9 }}
              >
                {r.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.avatarUrl} alt="" className={styles.avatarImg} />
                ) : (
                  initialsOf(r.displayName)
                )}
              </span>
              <div className={styles.listRowMain}>
                <span className={styles.listRowTitle}>
                  {r.displayName}
                  {r.isCurrentUser && (
                    <span className={styles.pill} data-tone="accent" style={{ marginLeft: 8 }}>
                      You
                    </span>
                  )}
                </span>
                <span className={styles.listRowSub}>@{r.username}</span>
              </div>
              <div className={styles.listRowActions}>
                <div style={{ minWidth: 84, textAlign: "right" }}>
                  <div className={styles.metricLabel}>Solved</div>
                  <div className={styles.metricValue}>{r.totalSolved.toLocaleString()}</div>
                </div>
                <div style={{ minWidth: 84, textAlign: "right" }}>
                  <div className={styles.metricLabel}>Streak</div>
                  <div className={styles.metricValue}>
                    {r.currentStreak > 0 ? `${r.currentStreak} d` : "—"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

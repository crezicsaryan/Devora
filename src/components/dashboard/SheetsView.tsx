"use client";

/**
 * Coding sheets — the shared question catalogue grouped by topic, with the
 * caller's own solved progress overlaid.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { MiniBar } from "@/components/dashboard/charts";
import styles from "@/app/dashboard/dashboard.module.css";

type Sheet = {
  id: string;
  slug: string;
  title: string;
  description: string;
  total: number;
  solved: number;
};

export function SheetsView() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await apiFetch<{ sheets: Sheet[] }>("/api/sheets");
      if (!alive) return;
      if (res.ok) setSheets(res.data.sheets);
      else setError(res.error);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <>
        <h1 className={styles.pageTitle}>Coding Sheets</h1>
        <div className={styles.skeleton} style={{ height: 320, marginTop: 18 }} />
      </>
    );
  }

  return (
    <>
      <h1 className={styles.pageTitle}>Coding Sheets</h1>
      <p className={styles.pageSub}>
        Sheets are built from the shared Devora question catalogue, grouped by topic.
      </p>

      {error && (
        <div className={`${styles.banner} ${styles.section}`} data-tone="error">
          <span>{error}</span>
        </div>
      )}

      {sheets.length === 0 ? (
        <div className={`${styles.empty} ${styles.section}`}>
          <strong>No sheets available yet.</strong>
          <span>
            Sheets fill in as questions are added to the catalogue and tracked in your question
            tracker.
          </span>
        </div>
      ) : (
        <div className={styles.projectGrid} style={{ marginTop: 18 }}>
          {sheets.map((s) => {
            const pct = s.total > 0 ? Math.round((s.solved / s.total) * 100) : 0;
            return (
              <div key={s.id} className={styles.card}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                  <h2 className={styles.sectionTitle} style={{ flex: 1 }}>
                    {s.title}
                  </h2>
                  <span className={styles.pill} data-tone={pct === 100 ? "ok" : "accent"}>
                    {pct}%
                  </span>
                </div>
                <p className={styles.hint} style={{ marginBottom: 12 }}>
                  {s.description}
                </p>
                <MiniBar value={s.solved} total={s.total} />
                <p className={styles.hint} style={{ marginTop: 8 }}>
                  {s.solved} of {s.total} solved
                </p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

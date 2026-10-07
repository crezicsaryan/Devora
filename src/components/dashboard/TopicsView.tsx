"use client";

/**
 * Topic progress — solved vs total per canonical topic.
 *
 * Values come from the user's question tracker when they have tracked anything,
 * otherwise from a derived count over their stored solved problems.
 */

import { TOPIC_ORDER } from "@/lib/types";
import { useDashboard } from "@/components/dashboard/use-dashboard";
import { MiniBar } from "@/components/dashboard/charts";
import styles from "@/app/dashboard/dashboard.module.css";

export function TopicsView() {
  const { data, loading, error } = useDashboard();

  if (loading) {
    return (
      <>
        <h1 className={styles.pageTitle}>Topics</h1>
        <div className={styles.skeleton} style={{ height: 320, marginTop: 18 }} />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <h1 className={styles.pageTitle}>Topics</h1>
        <div className={`${styles.banner} ${styles.section}`} data-tone="error">
          <span>{error ?? "Could not load topics."}</span>
        </div>
      </>
    );
  }

  const map = new Map(data.topics.map((t) => [t.topic, t]));
  const rows = TOPIC_ORDER.map((name) => map.get(name) ?? { topic: name, solved: 0, total: 0 });
  for (const t of data.topics) if (!TOPIC_ORDER.includes(t.topic)) rows.push(t);

  const totalSolved = rows.reduce((s, r) => s + r.solved, 0);
  const totalTracked = rows.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <div className={styles.sectionHead} style={{ marginBottom: 18 }}>
        <div>
          <h1 className={styles.pageTitle} style={{ marginBottom: 4 }}>
            Topics
          </h1>
          <p className={styles.pageSub}>
            Progress is based on questions you have marked in the tracker.
          </p>
        </div>
        {totalTracked > 0 && (
          <span className={styles.pill} data-tone="accent">
            {totalSolved} / {totalTracked} solved
          </span>
        )}
      </div>

      {totalTracked === 0 && totalSolved === 0 ? (
        <div className={styles.empty}>
          <strong>No topic data yet.</strong>
          <span>
            Add questions in the question tracker to build up topic-level progress. Derived counts
            appear automatically once a platform with difficulty data is synced.
          </span>
        </div>
      ) : (
        <div className={styles.card}>
          <div className={styles.topicList}>
            {rows.map((r) => {
              const pct = r.total > 0 ? Math.round((r.solved / r.total) * 100) : 0;
              return (
                <div key={r.topic} className={styles.topicRow}>
                  <div className={styles.topicTop}>
                    <span className={styles.topicName}>{r.topic}</span>
                    <span className={styles.topicValue}>
                      {r.solved}
                      <span>
                        /{r.total || 0} {"  "}
                        {pct}%
                      </span>
                    </span>
                  </div>
                  <MiniBar value={r.solved} total={r.total} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

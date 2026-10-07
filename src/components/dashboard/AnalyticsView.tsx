"use client";

/**
 * Analytics — every stored metric, per platform, over a selectable range.
 *
 * Reads only normalized rows (the same payload the dashboard uses), so opening
 * this page never triggers an external API call.
 */

import { useState } from "react";
import { ACTIVITY_RANGES, type ActivityRange } from "@/lib/types";
import { useDashboard } from "@/components/dashboard/use-dashboard";
import { ActivityChart, DifficultyBars, DifficultyDonut } from "@/components/dashboard/charts";
import { PlatformLogo } from "@/components/dashboard/DashboardView";
import styles from "@/app/dashboard/dashboard.module.css";

export function AnalyticsView() {
  const [range, setRange] = useState<ActivityRange>("30d");
  const { data, loading, error } = useDashboard(range);

  if (loading) {
    return (
      <>
        <h1 className={styles.pageTitle}>Analytics</h1>
        <div className={styles.skeleton} style={{ height: 360, marginTop: 18 }} />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <h1 className={styles.pageTitle}>Analytics</h1>
        <div className={`${styles.banner} ${styles.section}`} data-tone="error">
          <span>{error ?? "Could not load analytics."}</span>
        </div>
      </>
    );
  }

  const { stats, connectedPlatforms, difficulty } = data;
  const hasAny = connectedPlatforms.length > 0;

  return (
    <>
      <h1 className={styles.pageTitle}>Analytics</h1>
      <p className={styles.pageSub}>
        Normalized statistics across every connected platform, from stored rows only.
      </p>

      <div className={styles.statGrid}>
        <SummaryCard label="Total solved" value={stats.totalSolved} />
        <SummaryCard label="Current streak" value={stats.currentStreak} suffix=" d" />
        <SummaryCard label="Longest streak" value={stats.longestStreak} suffix=" d" />
        <SummaryCard label="GitHub contributions" value={stats.githubContributions} />
      </div>

      <div className={styles.cols}>
        <div className={styles.card}>
          <div className={styles.chartHead}>
            <h2 className={styles.sectionTitle}>Activity</h2>
            <div className={styles.rangeTabs}>
              {ACTIVITY_RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`${styles.rangeTab} ${range === r.key ? styles.rangeTabOn : ""}`}
                  onClick={() => setRange(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <ActivityChart points={data.activity} range={range} />
        </div>

        <div className={styles.card}>
          <h2 className={styles.sectionTitle} style={{ marginBottom: 14 }}>
            Difficulty mix
          </h2>
          {difficulty.available && difficulty.total > 0 ? (
            <div className={styles.donutWrap}>
              <div className={styles.donut}>
                <DifficultyDonut breakdown={difficulty} />
              </div>
              <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                <DifficultyBars breakdown={difficulty} />
              </div>
            </div>
          ) : (
            <p className={styles.hint}>
              No difficulty data yet. Connect LeetCode or Codeforces to populate this.
            </p>
          )}
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle} style={{ marginBottom: 12 }}>
          Platform breakdown
        </h2>
        {!hasAny ? (
          <div className={styles.empty}>
            <strong>No platforms connected.</strong>
            <span>Connect a platform to see per-platform analytics.</span>
          </div>
        ) : (
          <div className={styles.listCard}>
            {connectedPlatforms.map(({ account, stats: s, meta }) => (
              <div key={account.id} className={styles.listRow}>
                <PlatformLogo platform={account.platform} size={26} />
                <div className={styles.listRowMain}>
                  <span className={styles.listRowTitle}>{meta.label}</span>
                  <span className={styles.listRowSub}>@{account.username}</span>
                </div>
                <div className={styles.listRowActions}>
                  <Metric label="Solved" value={s?.solvedTotal ?? null} />
                  <Metric label="Rating" value={s?.rating != null ? Math.round(s.rating) : null} />
                  <Metric label="Contests" value={s?.contests ?? null} />
                  <Metric label="Contributions" value={s?.contributions ?? null} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function SummaryCard({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  const empty = value == null;
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} data-empty={empty}>
        {empty ? "—" : `${value!.toLocaleString()}${suffix ?? ""}`}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ minWidth: 72, textAlign: "right" }}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue} data-empty={value == null}>
        {value == null ? "—" : value.toLocaleString()}
      </div>
    </div>
  );
}

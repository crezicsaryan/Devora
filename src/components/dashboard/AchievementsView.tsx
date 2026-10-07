"use client";

/**
 * Achievements — earned and locked.
 *
 * Awards happen server-side only (`evaluateAchievements` during sync), so this
 * page is purely a projection of `user_achievements`.
 */

import { useDashboard, relativeTime } from "@/components/dashboard/use-dashboard";
import styles from "@/app/dashboard/dashboard.module.css";

export function AchievementsView() {
  const { data, loading, error } = useDashboard();

  if (loading) {
    return (
      <>
        <h1 className={styles.pageTitle}>Achievements</h1>
        <div className={styles.skeleton} style={{ height: 320, marginTop: 18 }} />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <h1 className={styles.pageTitle}>Achievements</h1>
        <div className={`${styles.banner} ${styles.section}`} data-tone="error">
          <span>{error ?? "Could not load achievements."}</span>
        </div>
      </>
    );
  }

  const earned = data.achievements.filter((a) => a.unlockedAt);
  const locked = data.achievements.filter((a) => !a.unlockedAt);

  return (
    <>
      <div className={styles.sectionHead} style={{ marginBottom: 18 }}>
        <div>
          <h1 className={styles.pageTitle} style={{ marginBottom: 4 }}>
            Achievements
          </h1>
          <p className={styles.pageSub}>
            Earned automatically as you solve problems, build streaks and ship projects.
          </p>
        </div>
        <span className={styles.pill} data-tone="accent">
          {earned.length} / {data.achievements.length} unlocked
        </span>
      </div>

      <section className={styles.section} style={{ marginTop: 0 }}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Earned</h2>
        </div>
        {earned.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nothing unlocked yet.</strong>
            <span>
              Solve your first problems or connect a platform — achievements are awarded
              server-side as soon as the criteria are met.
            </span>
          </div>
        ) : (
          <div className={styles.achGrid}>
            {earned.map((a) => (
              <div key={a.code} className={styles.achCard} data-earned="true">
                <span className={styles.achGlyph}>{a.icon || "★"}</span>
                <span className={styles.achName}>{a.title}</span>
                <span className={styles.achDesc}>{a.description}</span>
                <span className={styles.achDate}>Unlocked {relativeTime(a.unlockedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {locked.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Locked</h2>
          </div>
          <div className={styles.achGrid}>
            {locked.map((a) => (
              <div key={a.code} className={styles.achCard} data-earned="false">
                <span className={styles.achGlyph}>{a.icon || "★"}</span>
                <span className={styles.achName}>{a.title}</span>
                <span className={styles.achDesc}>{a.description}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

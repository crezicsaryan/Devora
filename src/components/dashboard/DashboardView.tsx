"use client";

/**
 * The Devora dashboard.
 *
 * One authenticated request (`GET /api/dashboard`) provides every number on
 * this screen, including the full daily activity series. Range and granularity
 * switches then filter that series locally, so changing "Last 30 Days" to
 * "This Year" never triggers a round trip or a page reload.
 *
 * Nothing is hardcoded. A metric the backend cannot source comes back as null
 * and renders as "—"; a section with no data shows a real empty state instead
 * of a placeholder chart.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api-client";
import {
  GRANULARITIES,
  HEATMAP_RANGES,
  PLATFORM_BY_KEY,
  PROBLEMS_RANGES,
  TOPIC_ORDER,
  type ConnectedPlatform,
  type DashboardPayload,
  type GraphGranularity,
  type HeatmapRange,
  type PlatformKey,
  type ProblemsRange,
} from "@/lib/types";
import {
  buildHeatmapGrid,
  bucketSeries,
  sliceSeries,
  type GraphBucket,
} from "@/lib/dashboard-metrics";
import {
  ActivityHeatmap,
  ComparisonBars,
  DifficultyBars,
  DifficultyDonut,
  LineTrendChart,
  MiniBar,
  type TrendSeries,
} from "@/components/dashboard/charts";
import styles from "@/app/dashboard/dashboard.module.css";

const SYNC_LABEL: Record<string, string> = {
  ok: "Synced",
  syncing: "Syncing",
  failed: "Sync failed",
  idle: "Not synced",
};

const ACTIVITY_SERIES: TrendSeries[] = [
  { key: "activities", label: "Activities", color: "#ff6a00" },
];

const PROBLEMS_SERIES: TrendSeries[] = [
  { key: "problems", label: "Problems solved", color: "#4ade80" },
];

export function DashboardView() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  // Activity heatmap + activity graph share one range; the problems graph has
  // its own, because the product asks for different windows on each.
  const [range, setRange] = useState<HeatmapRange>("this-year");
  const [granularity, setGranularity] = useState<GraphGranularity>("weekly");
  const [problemsRange, setProblemsRange] = useState<ProblemsRange>("30d");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await api.dashboard("30d");
      if (!alive) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const res = await api.dashboard("30d");
    if (res.ok) {
      setData(res.data);
      setError(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (!data) return;
    setSyncingAll(true);
    const platforms = data.connectedPlatforms
      .map((p) => p.account.platform)
      .filter((p) => p !== "github");
    // Sync one at a time so a slow platform cannot stall the others.
    for (const platform of platforms) {
      await api.syncPlatform(platform);
    }
    await reload();
    setSyncingAll(false);
  }, [data, reload]);

  const daily = data?.daily ?? [];

  const heatmapGrid = useMemo(
    () => buildHeatmapGrid(daily, range),
    [daily, range]
  );

  const activityBuckets = useMemo(
    () => bucketSeries(sliceSeries(daily, range, { fill: true }), granularity),
    [daily, range, granularity]
  );

  const problemsBuckets = useMemo(
    () =>
      bucketSeries(
        sliceSeries(daily, problemsRange, { fill: true }),
        autoGranularity(problemsRange)
      ),
    [daily, problemsRange]
  );

  // Client-side only: the server cannot know the user's local time of day.
  const greeting = useMemo(() => greetingFor(new Date()), []);

  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <div className={styles.banner} data-tone="error">
        <span>{error}</span>
      </div>
    );
  }

  if (!data) return null;

  const {
    profile,
    plans,
    stats,
    connectedPlatforms,
    difficulty,
    topics,
    events,
    projects,
    syncJobs,
    streak,
    github,
    monthly,
    yearly,
    personalBests,
    achievementsSummary,
    monthlyLeaderboard,
    leaderboardAvailable,
  } = data;

  const firstName = profile.displayName?.trim().split(/\s+/)[0] || "Developer";
  const topicMap = new Map(topics.map((t) => [t.topic, t]));
  const orderedTopics = TOPIC_ORDER.map(
    (name) => topicMap.get(name) ?? { topic: name, solved: 0, total: 0 }
  );
  for (const t of topics) {
    if (!TOPIC_ORDER.includes(t.topic)) orderedTopics.push(t);
  }
  const hasTopicData = orderedTopics.some((t) => t.solved > 0 || t.total > 0);

  // §24 — a brand-new account: no platforms and no real activity yet.
  const isNewUser = connectedPlatforms.length === 0 && streak.isEmpty;

  return (
    <div>
      {/* 1 ───────────────────────── welcome / header ───────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1>
            {greeting}, {firstName} 👋
          </h1>
          <p>Track your coding journey and developer progress in one place.</p>
        </div>

        <div className={styles.heroRight}>
          <div className={styles.completionRow}>
            <span>Profile completion</span>
            <span className={styles.completionValue}>{plans.completionPercent}%</span>
          </div>
          <div className={styles.bar}>
            <div className={styles.barFill} style={{ width: `${plans.completionPercent}%` }} />
          </div>
          <div className={styles.heroActions}>
            {plans.completionPercent < 100 && (
              <Link href="/dashboard/profile" className={styles.btnPrimary}>
                Complete Profile
              </Link>
            )}
            <button
              type="button"
              className={styles.btnGhost}
              onClick={refreshAll}
              disabled={syncingAll || connectedPlatforms.length === 0}
            >
              {syncingAll ? "Syncing…" : "Sync platforms"}
            </button>
          </div>
        </div>
      </section>

      {isNewUser ? (
        <NewUserPanel />
      ) : (
        <>
          {/* 2 ─────────────────────────── summary cards ─────────────────── */}
          <div className={styles.statGrid5}>
            <StatCard
              label="Total Problems Solved"
              value={stats.totalSolved}
              note={
                stats.totalSolved == null
                  ? "Connect a platform to start counting"
                  : "Across all connected platforms"
              }
              glyph={<CodeGlyph />}
            />
            <StatCard
              label="Current Streak"
              value={stats.currentStreak}
              suffix={stats.currentStreak ? " Days" : undefined}
              note={
                stats.currentStreak == null
                  ? "No active coding days yet"
                  : "Keep it going"
              }
              glyph={<FlameGlyph />}
            />
            <StatCard
              label="Longest Streak"
              value={stats.longestStreak}
              suffix={stats.longestStreak ? " Days" : undefined}
              note={
                stats.longestStreak == null ? "No streak history yet" : "Personal best"
              }
              glyph={<TrophyGlyph />}
            />
            <StatCard
              label="Active Days"
              value={stats.activeDays > 0 ? stats.activeDays : null}
              suffix={stats.activeDays > 0 ? " Days" : undefined}
              note={
                stats.activeDays > 0
                  ? "Days with real coding activity"
                  : "No coding days recorded yet"
              }
              glyph={<CalendarGlyph />}
            />
            <StatCard
              label="Platforms Connected"
              value={stats.platformsConnected > 0 ? stats.platformsConnected : null}
              suffix={stats.platformsConnected > 0 ? " Platforms" : undefined}
              note={
                stats.platformsConnected > 0
                  ? "Verified connections only"
                  : "No platforms connected yet"
              }
              glyph={<LinkGlyph />}
            />
          </div>

          {/* 3 ────────────────────────── activity heatmap ───────────────── */}
          <section className={styles.section}>
            <div className={styles.chartHead}>
              <h2 className={styles.sectionTitle}>Coding activity</h2>
              <RangeTabs
                options={HEATMAP_RANGES.map((r) => ({ key: r.key, label: r.label }))}
                value={range}
                onChange={(key) => setRange(key as HeatmapRange)}
              />
            </div>
            <div className={styles.card}>
              <ActivityHeatmap grid={heatmapGrid} />
            </div>
          </section>

          {/* 4 ─────────────────────── activity graph ────────────────────── */}
          <section className={styles.section}>
            <div className={styles.chartHead}>
              <h2 className={styles.sectionTitle}>Coding activity over time</h2>
              <RangeTabs
                options={GRANULARITIES.map((g) => ({ key: g.key, label: g.label }))}
                value={granularity}
                onChange={(key) => setGranularity(key as GraphGranularity)}
              />
            </div>
            <div className={styles.card}>
              <LineTrendChart
                buckets={activityBuckets}
                series={ACTIVITY_SERIES}
                unit={granularity === "daily" ? "activities" : "activities"}
              />
            </div>
          </section>

          {/* 5 ─────────────────────── problems graph ────────────────────── */}
          <section className={styles.section}>
            <div className={styles.chartHead}>
              <h2 className={styles.sectionTitle}>Problems solved over time</h2>
              <RangeTabs
                options={PROBLEMS_RANGES.map((r) => ({ key: r.key, label: r.label }))}
                value={problemsRange}
                onChange={(key) => setProblemsRange(key as ProblemsRange)}
              />
            </div>
            <div className={styles.card}>
              <LineTrendChart
                buckets={problemsBuckets}
                series={PROBLEMS_SERIES}
                unit="solved"
              />
            </div>
          </section>

          {/* 6 ────────────────────────── coding platforms ───────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Coding platforms</h2>
              <Link href="/dashboard/platforms" className={styles.sectionLink}>
                Manage platforms →
              </Link>
            </div>

            {connectedPlatforms.length === 0 ? (
              <div className={styles.empty}>
                <strong>No coding platforms connected yet.</strong>
                <span>Connect a platform to start tracking your coding progress.</span>
                <Link
                  href="/dashboard/platforms"
                  className={styles.btnPrimary}
                  style={{ marginTop: 4 }}
                >
                  Connect Platform
                </Link>
              </div>
            ) : (
              <div className={styles.platformGrid}>
                {connectedPlatforms.map((p) => (
                  <PlatformStatCard
                    key={p.account.id}
                    platform={p}
                    syncJob={syncJobs.find((j) => j.platform === p.account.platform)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 7 + 8 ───────────────── comparison + difficulty ─────────────── */}
          <div className={styles.cols}>
            <div className={styles.card}>
              <h2 className={styles.sectionTitle} style={{ marginBottom: 14 }}>
                Platform comparison
              </h2>
              {data.platformComparison.length === 0 ? (
                <p className={styles.hint}>
                  No platform reports a solved count yet. Connect LeetCode, Codeforces,
                  CodeChef or GeeksforGeeks to compare.
                </p>
              ) : data.platformComparison.length === 1 ? (
                <ComparisonBars rows={data.platformComparison} />
              ) : (
                <ComparisonBars rows={data.platformComparison} />
              )}
            </div>

            <div className={styles.card}>
              <h2 className={styles.sectionTitle} style={{ marginBottom: 14 }}>
                Problem difficulty
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
                <div className={styles.empty}>
                  <strong>No problem data available yet.</strong>
                  <span>
                    Connect a platform that publishes problem difficulty (LeetCode or
                    Codeforces) to see this breakdown.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 9 ────────────────────────── topic progress ─────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Topic progress</h2>
              <Link href="/dashboard/topics" className={styles.sectionLink}>
                View topics →
              </Link>
            </div>

            {hasTopicData ? (
              <div className={styles.card}>
                <div className={styles.topicList}>
                  {orderedTopics.map((t) => (
                    <div key={t.topic} className={styles.topicRow}>
                      <div className={styles.topicTop}>
                        <span className={styles.topicName}>{t.topic}</span>
                        <span className={styles.topicValue}>
                          {t.solved}
                          <span>
                            /{t.total || 0}
                            {"  "}
                            {t.total > 0 ? `${Math.round((t.solved / t.total) * 100)}%` : "0%"}
                          </span>
                        </span>
                      </div>
                      <MiniBar value={t.solved} total={t.total} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.empty}>
                <strong>Start solving problems to see topic progress.</strong>
                <span>
                  Track questions in the question tracker and per-topic progress appears here.
                </span>
                <Link href="/dashboard/tracker" className={styles.btnGhost} style={{ marginTop: 4 }}>
                  Open question tracker
                </Link>
              </div>
            )}
          </section>

          {/* 10 ────────────────────────── github overview ───────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>GitHub overview</h2>
              <Link href="/dashboard/platforms" className={styles.sectionLink}>
                Manage →
              </Link>
            </div>

            {github ? (
              <div className={styles.card}>
                <div className={styles.metaGrid}>
                  <MetaCell label="Repositories" value={github.repositories} />
                  <MetaCell label="Followers" value={github.followers} />
                  <MetaCell label="Following" value={github.following} />
                  <MetaCell label="Contributions" value={github.contributions} />
                  <MetaCell label="Stars" value={github.stars} />
                  {/* No honest source for these yet — shown as "—", never guessed. */}
                  <MetaCell label="Commits" value={github.commits} />
                  <MetaCell label="Pull requests" value={github.pullRequests} />
                  <MetaCell label="Issues" value={github.issues} />
                </div>

                <div style={{ marginTop: 16 }}>
                  <div className={styles.subHead}>Most-used languages</div>
                  {github.languages.length === 0 ? (
                    <p className={styles.hint}>
                      No language data stored yet — run a GitHub sync to populate it.
                    </p>
                  ) : (
                    <div className={styles.langList}>
                      {github.languages.slice(0, 8).map((l) => (
                        <span key={l.name} className={styles.chip}>
                          {l.name} · {l.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.metaFoot}>
                  <span className={styles.syncState} data-state={github.syncStatus}>
                    {github.syncStatus === "ok"
                      ? "✓ Connected"
                      : github.syncStatus === "failed"
                        ? "⚠ Sync failed"
                        : "⟳ Syncing"}
                  </span>
                  {github.lastSyncedAt && (
                    <span className={styles.hint}>
                      Last synced {relativeTime(github.lastSyncedAt)}
                    </span>
                  )}
                  {github.profileUrl && (
                    <a
                      href={github.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.projectLink}
                    >
                      @{github.username} ↗
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.empty}>
                <strong>GitHub isn&apos;t connected yet.</strong>
                <span>Connect GitHub to track your development activity.</span>
                <Link
                  href="/dashboard/platforms"
                  className={styles.btnPrimary}
                  style={{ marginTop: 4 }}
                >
                  Connect GitHub
                </Link>
              </div>
            )}
          </section>

          {/* 11 ───────────────────── recent coding activity ─────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Recent activity</h2>
            </div>
            <div className={styles.card}>
              {events.length === 0 ? (
                <p className={styles.hint}>
                  Nothing has happened yet. Solve a problem or sync a platform and your
                  activity appears here.
                </p>
              ) : (
                <ul className={styles.feed}>
                  {events.slice(0, 10).map((e) => (
                    <li key={e.id} className={styles.feedItem}>
                      <span className={styles.feedIcon}>{eventGlyph(e.kind)}</span>
                      <div className={styles.feedBody}>
                        <span className={styles.feedTitle}>
                          {e.href ? (
                            <Link href={e.href} style={{ color: "inherit" }}>
                              {e.title}
                            </Link>
                          ) : (
                            e.title
                          )}
                        </span>
                        <span className={styles.feedMeta}>
                          {e.detail ? `${e.detail} · ` : ""}
                          {relativeTime(e.occurredAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* 12 ───────────────────────── coding streak ─────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Coding streak</h2>
            </div>
            <div className={styles.statGrid4}>
              <MiniStat label="Current Streak" value={streak.current} suffix=" days" />
              <MiniStat label="Longest Streak" value={streak.longest} suffix=" days" />
              <MiniStat label="Active Days" value={streak.activeDays} suffix=" days" />
              <MiniStat
                label="Total Coding Activities"
                value={streak.totalActivities}
                suffix=""
              />
            </div>
            <p className={styles.hint} style={{ marginTop: 10 }}>
              A coding day means at least one real coding activity. Logins, profile
              views and dashboard visits are never counted.
            </p>
          </section>

          {/* 13 ──────────────────────── monthly progress ────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>This month</h2>
              <span className={styles.hint}>{monthly.label}</span>
            </div>
            <div className={styles.card}>
              <div className={styles.statGrid4}>
                <MiniStat label="Problems Solved" value={monthly.problemsSolved} />
                <MiniStat label="Active Days" value={monthly.activeDays} suffix=" days" />
                <MiniStat label="Coding Activities" value={monthly.activities} />
                <MiniStat label="Current Streak" value={monthly.currentStreak} suffix=" days" />
              </div>
              {monthly.problemsChangePercent != null && monthly.previous && (
                <p className={styles.changeRow} data-up={monthly.problemsChangePercent >= 0}>
                  {monthly.problemsChangePercent >= 0 ? "▲" : "▼"}{" "}
                  {Math.abs(monthly.problemsChangePercent)}% vs {monthly.previous.label}
                  <span className={styles.hint}>
                    {" "}
                    ({monthly.previous.problemsSolved} problems last month)
                  </span>
                </p>
              )}
              {monthly.problemsChangePercent == null && (
                <p className={styles.hint} style={{ marginTop: 12 }}>
                  Not enough history to compare with last month yet.
                </p>
              )}
            </div>
          </section>

          {/* 14 ──────────────────────── yearly overview ─────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Your coding year</h2>
              <span className={styles.hint}>{yearly.year}</span>
            </div>
            <div className={styles.card}>
              {yearly.hasData ? (
                <>
                  <div className={styles.statGrid4}>
                    <MiniStat label="Problems Solved" value={yearly.problemsSolved} />
                    <MiniStat label="Active Days" value={yearly.activeDays} suffix=" days" />
                    <MiniStat
                      label="Longest Streak"
                      value={yearly.longestStreak}
                      suffix=" days"
                    />
                    <MiniStat label="Total Activities" value={yearly.activities} />
                  </div>
                  <div className={styles.threeCol} style={{ marginTop: 18 }}>
                    <Highlight
                      label="Most Active Month"
                      value={yearly.mostActiveMonth?.label ?? null}
                      sub={
                        yearly.mostActiveMonth
                          ? `${yearly.mostActiveMonth.activities} activities`
                          : undefined
                      }
                    />
                    <Highlight
                      label="Most Solved Topic"
                      value={yearly.mostSolvedTopic?.topic ?? null}
                      sub={
                        yearly.mostSolvedTopic
                          ? `${yearly.mostSolvedTopic.solved} solved`
                          : undefined
                      }
                    />
                    <Highlight
                      label="Most Used Platform"
                      value={yearly.mostUsedPlatform?.label ?? null}
                      sub={
                        yearly.mostUsedPlatform
                          ? `${yearly.mostUsedPlatform.solved} solved`
                          : undefined
                      }
                    />
                  </div>
                </>
              ) : (
                <p className={styles.hint}>
                  No coding activity recorded in {yearly.year} yet.
                </p>
              )}
            </div>
          </section>

          {/* 15 ───────────────────────── personal bests ─────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Personal bests</h2>
            </div>
            <div className={styles.card}>
              {personalBests.hasData ? (
                <div className={styles.threeCol}>
                  <Highlight
                    label="Longest Streak"
                    value={personalBests.longestStreak > 0 ? `${personalBests.longestStreak} days` : null}
                  />
                  <Highlight
                    label="Most Problems in One Day"
                    value={
                      personalBests.mostProblemsInADay
                        ? String(personalBests.mostProblemsInADay.problems)
                        : null
                    }
                    sub={
                      personalBests.mostProblemsInADay
                        ? formatLongDay(personalBests.mostProblemsInADay.day)
                        : undefined
                    }
                  />
                  <Highlight
                    label="Most Problems in One Month"
                    value={
                      personalBests.mostProblemsInAMonth
                        ? String(personalBests.mostProblemsInAMonth.problems)
                        : null
                    }
                    sub={personalBests.mostProblemsInAMonth?.label}
                  />
                  <Highlight
                    label="Most Active Month"
                    value={personalBests.mostActiveMonth?.label ?? null}
                    sub={
                      personalBests.mostActiveMonth
                        ? `${personalBests.mostActiveMonth.activities} activities`
                        : undefined
                    }
                  />
                  <Highlight
                    label="Most Active Week"
                    value={
                      personalBests.mostActiveWeek
                        ? `${personalBests.mostActiveWeek.activities}`
                        : null
                    }
                    sub={
                      personalBests.mostActiveWeek
                        ? `${formatShortDay(personalBests.mostActiveWeek.start)} – ${formatShortDay(personalBests.mostActiveWeek.end)}`
                        : undefined
                    }
                  />
                </div>
              ) : (
                <p className={styles.hint}>Keep coding to unlock personal bests.</p>
              )}
            </div>
          </section>

          {/* 16 ────────────────────────── achievements ──────────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Achievements</h2>
              <Link href="/dashboard/achievements" className={styles.sectionLink}>
                View all achievements →
              </Link>
            </div>

            {achievementsSummary.totalCount === 0 ? (
              <div className={styles.empty}>
                <strong>No achievements available yet.</strong>
                <span>The achievement catalogue has not been seeded in this database.</span>
              </div>
            ) : (
              <>
                {achievementsSummary.unlockedCount === 0 ? (
                  <p className={styles.hint} style={{ marginBottom: 12 }}>
                    No achievements unlocked yet — badges are awarded automatically as you
                    progress.
                  </p>
                ) : null}
                <div className={styles.achGrid}>
                  {achievementsSummary.unlocked.slice(0, 4).map((a) => (
                    <div key={a.code} className={styles.achCard} data-earned="true">
                      <span className={styles.achGlyph}>{a.icon || "★"}</span>
                      <span className={styles.achName}>{a.title}</span>
                      <span className={styles.achDesc}>{a.description}</span>
                      <span className={styles.achDate}>
                        Unlocked {relativeTime(a.unlockedAt)}
                      </span>
                    </div>
                  ))}
                  {achievementsSummary.locked.slice(0, 4).map((a) => (
                    <div key={a.code} className={styles.achCard} data-earned="false">
                      <span className={styles.achGlyph} data-locked="true">
                        {a.icon || "★"}
                      </span>
                      <span className={styles.achName}>{a.title}</span>
                      <span className={styles.achDesc}>{a.description}</span>
                      <div className={styles.progTrack}>
                        <div
                          className={styles.progFill}
                          style={{
                            width: `${a.threshold > 0 ? (a.progress / a.threshold) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className={styles.achDate}>
                        {a.progress} / {a.threshold}
                      </span>
                    </div>
                  ))}
                </div>
                <p className={styles.hint} style={{ marginTop: 12 }}>
                  {achievementsSummary.unlockedCount} of {achievementsSummary.totalCount}{" "}
                  unlocked
                </p>
              </>
            )}
          </section>

          {/* 17 ────────────────────── monthly leaderboard ───────────────── */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Monthly leaderboard</h2>
              <Link href="/dashboard/leaderboard" className={styles.sectionLink}>
                Full leaderboard →
              </Link>
            </div>
            <div className={styles.card}>
              {!leaderboardAvailable ? (
                <p className={styles.hint}>Leaderboard coming soon.</p>
              ) : monthlyLeaderboard.length === 0 ? (
                <p className={styles.hint}>
                  No one has logged coding activity this month yet. Rankings are based on
                  real activity, so the board starts when activity does.
                </p>
              ) : (
                <ul className={styles.lbList}>
                  {monthlyLeaderboard.slice(0, 10).map((row) => (
                    <li
                      key={`${row.rank}-${row.username}`}
                      className={styles.lbRow}
                      data-me={row.isCurrentUser}
                    >
                      <span className={styles.lbRank}>#{row.rank}</span>
                      <span className={styles.lbAvatar}>
                        {row.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.avatarUrl} alt="" />
                        ) : (
                          initialsOf(row.displayName || row.username)
                        )}
                      </span>
                      <span className={styles.lbUser}>
                        <span className={styles.lbName}>{row.displayName || row.username}</span>
                        <span className={styles.lbHandle}>@{row.username}</span>
                      </span>
                      <span className={styles.lbStat}>
                        {row.problemsSolved}
                        <span className={styles.lbStatLabel}>solved</span>
                      </span>
                      <span className={styles.lbScore}>{row.score}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}

      {/* Recent projects — the dashboard's own sections are ordered above; this
          stays last so nothing the app already offered is lost. */}
      {!isNewUser && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Recent projects</h2>
            <Link href="/dashboard/projects" className={styles.sectionLink}>
              View all →
            </Link>
          </div>
          <div className={styles.projectGrid}>
            {projects.slice(0, 3).map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
            <Link href="/dashboard/projects?new=1" className={styles.addCard}>
              <span className={styles.addPlus}>+</span>
              Add Project
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================ sub components ============================== */

function NewUserPanel() {
  return (
    <section className={styles.section}>
      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>Welcome to Devora 🚀</h2>
        <p className={styles.hint} style={{ marginTop: 8 }}>
          Your coding journey starts here.
        </p>
        <p className={styles.hint} style={{ marginTop: 14 }}>
          Connect your coding platforms to start tracking:
        </p>
        <ul className={styles.bulletList}>
          <li>Problems</li>
          <li>Streaks</li>
          <li>Activity</li>
          <li>Progress</li>
        </ul>
        <div className={styles.heroActions} style={{ marginTop: 18 }}>
          <Link href="/dashboard/platforms" className={styles.btnPrimary}>
            Connect Platform
          </Link>
          <Link href="/dashboard/platforms" className={styles.btnGhost}>
            Connect GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

function RangeTabs({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className={styles.rangeTabs}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`${styles.rangeTab} ${value === o.key ? styles.rangeTabOn : ""}`}
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  suffix,
  glyph,
}: {
  label: string;
  value: number | null;
  note: string;
  suffix?: string;
  glyph: React.ReactNode;
}) {
  const empty = value == null;
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>
        <span className={styles.statGlyph}>{glyph}</span>
        {label}
      </div>
      <div className={styles.statValue} data-empty={empty}>
        {empty ? "—" : `${value.toLocaleString()}${suffix ?? ""}`}
      </div>
      <div className={styles.statNote}>{note}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className={styles.miniStat}>
      <div className={styles.miniStatValue}>
        {value.toLocaleString()}
        {suffix}
      </div>
      <div className={styles.miniStatLabel}>{label}</div>
    </div>
  );
}

function Highlight({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | null;
  sub?: string;
}) {
  return (
    <div className={styles.highlight}>
      <div className={styles.highlightLabel}>{label}</div>
      <div className={styles.highlightValue} data-empty={value == null}>
        {value ?? "—"}
      </div>
      {sub && <div className={styles.highlightSub}>{sub}</div>}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={styles.metaCell}>
      <div className={styles.metaLabel}>{label}</div>
      <div className={styles.metaValue} data-empty={value == null}>
        {value == null ? "—" : value.toLocaleString()}
      </div>
    </div>
  );
}

function PlatformStatCard({
  platform,
  syncJob,
}: {
  platform: ConnectedPlatform;
  syncJob?: DashboardPayload["syncJobs"][number];
}) {
  const { account, stats, meta } = platform;
  const rows = buildMetricRows(platform);
  const state = syncJob?.status === "failed" ? "failed" : account.syncStatus;

  return (
    <div className={styles.platformCard}>
      <div className={styles.platformTop}>
        <PlatformLogo platform={account.platform} size={26} />
        <div style={{ minWidth: 0 }}>
          <div className={styles.platformName}>{meta.label}</div>
          <div className={styles.platformHandle}>@{account.username}</div>
        </div>
        <span
          className={styles.pill}
          data-tone={state === "ok" ? "ok" : state === "failed" ? "bad" : "accent"}
          style={{ marginLeft: "auto" }}
        >
          {state === "ok" ? "✓ Connected" : state === "failed" ? "⚠ Sync failed" : "⟳ Syncing"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className={styles.hint}>
          This platform does not publish additional metrics yet.
        </p>
      ) : (
        <div className={styles.platformMetrics}>
          {rows.map((r) => (
            <div className={styles.metric} key={r.label}>
              <div className={styles.metricLabel}>{r.label}</div>
              <div className={styles.metricValue} data-empty={r.value == null}>
                {r.value == null ? "—" : r.display ?? r.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.metaFoot}>
        <span className={styles.hint}>
          {account.lastSyncedAt
            ? `Last synced ${relativeTime(account.lastSyncedAt)}`
            : "Not synced yet"}
        </span>
        {account.profileUrl && (
          <a
            href={account.profileUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.projectLink}
          >
            Profile ↗
          </a>
        )}
      </div>
    </div>
  );
}

/** Only metrics the platform genuinely exposes are rendered. */
function buildMetricRows({
  account,
  stats,
}: ConnectedPlatform): { label: string; value: number | null; display?: string }[] {
  if (!stats) return [];
  const rows: { label: string; value: number | null; display?: string }[] = [];
  const push = (label: string, value: number | null, display?: string) => {
    if (value != null && value !== 0) rows.push({ label, value, display });
  };

  switch (account.platform) {
    case "leetcode":
      push("Solved", stats.solvedTotal);
      push("Easy", stats.solvedEasy);
      push("Medium", stats.solvedMedium);
      push("Hard", stats.solvedHard);
      push("Rating", stats.rating ? Math.round(stats.rating) : null);
      push("Streak", stats.streakCurrent);
      push("Badges", stats.badges);
      break;
    case "codechef":
      push("Solved", stats.solvedTotal);
      push("Easy", stats.solvedEasy);
      push("Medium", stats.solvedMedium);
      push("Hard", stats.solvedHard);
      push("Rating", stats.rating ? Math.round(stats.rating) : null);
      push("Contests", stats.contests);
      if (stats.rankLabel) rows.push({ label: "Stars", value: 0, display: stats.rankLabel });
      break;
    case "codeforces":
      push("Solved", stats.solvedTotal);
      push("Easy", stats.solvedEasy);
      push("Medium", stats.solvedMedium);
      push("Hard", stats.solvedHard);
      push("Rating", stats.rating ? Math.round(stats.rating) : null);
      push("Max rating", stats.maxRating ? Math.round(stats.maxRating) : null);
      push("Contests", stats.contests);
      break;
    case "gfg":
      push("Solved", stats.solvedTotal);
      push("Score", stats.reputation);
      break;
    case "hackerrank":
      push("Badges", stats.badges);
      push("Solved", stats.solvedTotal);
      break;
    case "github":
      push("Repositories", stats.publicRepos);
      push("Followers", stats.followers);
      push("Contributions", stats.contributions);
      break;
    default:
      break;
  }

  return rows;
}

function ProjectCard({ project }: { project: DashboardPayload["projects"][number] }) {
  return (
    <article className={styles.projectCard}>
      <div className={styles.projectThumb}>
        {project.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.imageUrl} alt="" />
        ) : (
          <span className={styles.projectThumbFallback}>
            {project.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div className={styles.projectBody}>
        <h3 className={styles.projectName}>{project.name}</h3>
        {project.description && <p className={styles.projectDesc}>{project.description}</p>}
        {project.techStack.length > 0 && (
          <div className={styles.chipRow}>
            {project.techStack.slice(0, 5).map((t) => (
              <span key={t} className={styles.chip}>
                {t}
              </span>
            ))}
          </div>
        )}
        <div className={styles.projectLinks}>
          {project.githubUrl && (
            <a href={project.githubUrl} target="_blank" rel="noreferrer" className={styles.projectLink}>
              GitHub ↗
            </a>
          )}
          {project.liveUrl && (
            <a href={project.liveUrl} target="_blank" rel="noreferrer" className={styles.projectLink}>
              Live demo ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export function PlatformLogo({ platform, size = 24 }: { platform: PlatformKey; size?: number }) {
  const meta = PLATFORM_BY_KEY[platform];
  const [broken, setBroken] = useState(false);
  if (!meta || broken) {
    return (
      <span className={styles.platformLogoFallback} style={{ width: size, height: size, flexBasis: size }}>
        {(meta?.label ?? platform).slice(0, 2)}
      </span>
    );
  }
  return (
    <Image
      src={meta.logo}
      alt=""
      width={size}
      height={size}
      className={styles.platformLogo}
      style={{ width: size, height: size, flexBasis: size }}
      onError={() => setBroken(true)}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className={styles.skeleton} style={{ height: 128, borderRadius: 16 }} />
      <div className={styles.statGrid5}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.skeleton} style={{ height: 108 }} />
        ))}
      </div>
      <div className={styles.cols} style={{ marginTop: 14 }}>
        <div className={styles.skeleton} style={{ height: 300 }} />
        <div className={styles.skeleton} style={{ height: 300 }} />
      </div>
    </div>
  );
}

/* ================================ helpers ================================= */

/** Charts get denser as the window grows, so pick a readable bucket size. */
function autoGranularity(range: ProblemsRange): GraphGranularity {
  if (range === "7d" || range === "30d") return "daily";
  if (range === "3m" || range === "6m") return "weekly";
  return "monthly";
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString();
}

function formatLongDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatShortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "D"
  );
}

function eventGlyph(kind: string): string {
  switch (kind) {
    case "problem_solved":
      return "✓";
    case "revision":
      return "↻";
    case "github_sync":
      return "⑂";
    case "platform_sync":
      return "⟳";
    case "achievement":
      return "★";
    case "project":
      return "◆";
    default:
      return "•";
  }
}

/* ----------------------------- stat glyphs ------------------------------- */

const GLYPH_PROPS = {
  viewBox: "0 0 24 24",
  width: 15,
  height: 15,
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CodeGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" />
    </svg>
  );
}

function FlameGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M12 2s5 4.5 5 9a5 5 0 01-10 0c0-1.6.7-3 1.6-4.1M12 22a3.4 3.4 0 01-3.4-3.4c0-2.3 3.4-5.1 3.4-5.1s3.4 2.8 3.4 5.1A3.4 3.4 0 0112 22z" />
    </svg>
  );
}

function TrophyGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4.5A1.5 1.5 0 003 7.5 3.5 3.5 0 006.5 11M17 6h2.5A1.5 1.5 0 0121 7.5 3.5 3.5 0 0117.5 11M9 20h6M12 14v6" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.8 1.8M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.8-1.8" />
    </svg>
  );
}

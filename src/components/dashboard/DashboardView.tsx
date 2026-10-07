"use client";

/**
 * The dashboard view.
 *
 * One authenticated request (`GET /api/dashboard`) provides every number on
 * this screen. Nothing is hardcoded: a metric the backend cannot source comes
 * back as null and renders as "—".
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api-client";
import {
  ACTIVITY_RANGES,
  PLATFORM_BY_KEY,
  TOPIC_ORDER,
  type ActivityRange,
  type ConnectedPlatform,
  type DashboardPayload,
  type PlatformKey,
} from "@/lib/types";
import { ActivityChart, DifficultyBars, DifficultyDonut, MiniBar } from "@/components/dashboard/charts";
import styles from "@/app/dashboard/dashboard.module.css";

const SYNC_LABEL: Record<string, string> = {
  ok: "Synced",
  syncing: "Syncing",
  failed: "Sync failed",
  idle: "Not synced",
};

export function DashboardView() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [range, setRange] = useState<ActivityRange>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const load = useCallback(
    async (nextRange: ActivityRange, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      const res = await api.dashboard(nextRange);
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    let alive = true;
    // The request resolves before any state is written, so this never causes a
    // synchronous cascading render.
    void (async () => {
      const res = await api.dashboard(range);
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
  }, [range]);

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
    await load(range, { silent: true });
    setSyncingAll(false);
  }, [data, range, load]);

  // Client-side only: the server has no idea what time it is for the user.
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

  const { profile, plans, stats, connectedPlatforms, difficulty, topics, events, projects, achievements, syncJobs } = data;

  const earned = achievements.filter((a) => a.unlockedAt);
  const topicMap = new Map(topics.map((t) => [t.topic, t]));
  const orderedTopics = TOPIC_ORDER.map((name) => topicMap.get(name) ?? { topic: name, solved: 0, total: 0 });
  for (const t of topics) {
    if (!TOPIC_ORDER.includes(t.topic)) orderedTopics.push(t);
  }

  return (
    <div>
      {/* ------------------------------ hero ------------------------------ */}
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1>
            {greeting}, {profile.displayName?.split(" ")[0] || "Developer"} 👋
          </h1>
          <p>Here&apos;s your coding journey at a glance.</p>
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

      {!plans.onboardingCompleted && (
        <div className={`${styles.banner} ${styles.section}`} data-tone="info">
          <span>Your setup is not finished yet. Complete onboarding to unlock sync and analytics.</span>
        </div>
      )}

      {/* ----------------------------- stat cards -------------------------- */}
      <div className={styles.statGrid}>
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
          suffix={stats.currentStreak ? " days" : undefined}
          note={stats.currentStreak == null ? "No recent submissions" : "Keep it going"}
          glyph={<FlameGlyph />}
        />
        <StatCard
          label="Longest Streak"
          value={stats.longestStreak}
          suffix={stats.longestStreak ? " days" : undefined}
          note={stats.longestStreak == null ? "No streak history yet" : "Personal best"}
          glyph={<TrophyGlyph />}
        />
        <StatCard
          label="GitHub Contributions"
          value={stats.githubContributions}
          note={
            stats.githubContributions == null
              ? "Connect GitHub to see this"
              : "Contributions in the last year"
          }
          glyph={<GitHubGlyph />}
        />
      </div>

      {/* --------------------------- platform stats ------------------------ */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Platform statistics</h2>
          <Link href="/dashboard/platforms" className={styles.sectionLink}>
            Manage platforms →
          </Link>
        </div>

        {connectedPlatforms.length === 0 ? (
          <div className={styles.empty}>
            <strong>No platforms connected yet.</strong>
            <span>
              Connect LeetCode, CodeChef, Codeforces, GeeksforGeeks, HackerRank or GitHub and your
              statistics will appear here.
            </span>
            <Link href="/dashboard/platforms" className={styles.btnPrimary} style={{ marginTop: 4 }}>
              Connect a platform
            </Link>
          </div>
        ) : (
          <div className={styles.platformGrid}>
            {connectedPlatforms.map((p) => (
              <PlatformStatCard key={p.account.id} platform={p} />
            ))}
          </div>
        )}
      </section>

      {/* ------------------------- activity + difficulty ------------------- */}
      <div className={styles.cols}>
        <div className={styles.card}>
          <div className={styles.chartHead}>
            <h2 className={styles.sectionTitle}>Coding activity</h2>
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
            Difficulty distribution
          </h2>
          {difficulty.available && difficulty.total > 0 ? (
            <>
              <div className={styles.donutWrap}>
                <div className={styles.donut}>
                  <DifficultyDonut breakdown={difficulty} />
                </div>
                <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                  <DifficultyBars breakdown={difficulty} />
                </div>
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              <strong>No difficulty data available.</strong>
              <span>
                Connect a platform that publishes problem difficulty (LeetCode or Codeforces) to see
                this breakdown.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* --------------------------- topic progress ------------------------ */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Topic progress</h2>
          <Link href="/dashboard/topics" className={styles.sectionLink}>
            View topics →
          </Link>
        </div>

        {topicProgressHasData(orderedTopics) ? (
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
            <strong>No topic data yet.</strong>
            <span>Track questions in the question tracker and progress will show up here.</span>
            <Link href="/dashboard/tracker" className={styles.btnGhost} style={{ marginTop: 4 }}>
              Open question tracker
            </Link>
          </div>
        )}
      </section>

      {/* ------------------------ feed + sync status ----------------------- */}
      <div className={styles.cols}>
        <div className={styles.card}>
          <h2 className={styles.sectionTitle} style={{ marginBottom: 6 }}>
            Recent activity
          </h2>
          {events.length === 0 ? (
            <p className={styles.hint} style={{ marginTop: 10 }}>
              Nothing has happened yet. Solve a problem or sync a platform and your activity will
              appear here.
            </p>
          ) : (
            <ul className={styles.feed}>
              {events.slice(0, 8).map((e) => (
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

        <div className={styles.card}>
          <div className={styles.sectionHead} style={{ marginBottom: 6 }}>
            <h2 className={styles.sectionTitle}>Sync status</h2>
            <Link href="/dashboard/platforms" className={styles.sectionLink}>
              Manage →
            </Link>
          </div>
          {connectedPlatforms.length === 0 ? (
            <p className={styles.hint} style={{ marginTop: 10 }}>
              No platforms connected.
            </p>
          ) : (
            <ul className={styles.syncList}>
              {connectedPlatforms.map((p) => {
                const job = syncJobs.find((j) => j.platform === p.account.platform);
                const state = job?.status === "failed" ? "failed" : p.account.syncStatus;
                return (
                  <li key={p.account.id} className={styles.syncRow}>
                    <PlatformLogo platform={p.account.platform} size={22} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {p.meta.label}
                    </span>
                    <span className={styles.syncState} data-state={state}>
                      {state === "failed" ? "⚠ " : state === "syncing" ? "⟳ " : state === "ok" ? "✓ " : ""}
                      {SYNC_LABEL[state] ?? state}
                      {state === "ok" && p.account.lastSyncedAt ? ` ${relativeTime(p.account.lastSyncedAt)}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ----------------------------- projects --------------------------- */}
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

      {/* --------------------------- achievements -------------------------- */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Achievements</h2>
          <Link href="/dashboard/achievements" className={styles.sectionLink}>
            View all achievements →
          </Link>
        </div>

        {earned.length === 0 ? (
          <div className={styles.empty}>
            <strong>No achievements unlocked yet.</strong>
            <span>Keep solving and syncing — badges are awarded automatically as you progress.</span>
          </div>
        ) : (
          <div className={styles.achGrid}>
            {earned.slice(0, 4).map((a) => (
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
    </div>
  );
}

/* ============================ sub components ============================== */

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
        {empty ? "—" : `${value!.toLocaleString()}${suffix ?? ""}`}
      </div>
      <div className={styles.statNote}>{note}</div>
    </div>
  );
}

function PlatformStatCard({ platform }: { platform: ConnectedPlatform }) {
  const { account, stats, meta } = platform;
  const rows = buildMetricRows(platform);

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
          data-tone={account.syncStatus === "ok" ? "ok" : account.syncStatus === "failed" ? "bad" : "accent"}
          style={{ marginLeft: "auto" }}
        >
          {account.syncStatus === "ok" ? "✓ Synced" : account.syncStatus === "failed" ? "⚠ Failed" : "⟳ Syncing"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className={styles.hint}>
          This platform does not publish additional metrics yet.{" "}
          {stats?.fetchedAt ? `Last synced ${relativeTime(stats.fetchedAt)}.` : ""}
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
      push("Rating", stats.rating ? Math.round(stats.rating) : null);
      push("Streak", stats.streakCurrent);
      push("Badges", stats.badges);
      break;
    case "codechef":
      push("Solved", stats.solvedTotal);
      push("Rating", stats.rating ? Math.round(stats.rating) : null);
      push("Contests", stats.contests);
      if (stats.rankLabel) rows.push({ label: "Stars", value: 0, display: stats.rankLabel });
      break;
    case "codeforces": {
      push("Solved", stats.solvedTotal);
      push("Rating", stats.rating ? Math.round(stats.rating) : null);
      push("Max rating", stats.maxRating ? Math.round(stats.maxRating) : null);
      push("Contests", stats.contests);
      break;
    }
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

function ProjectCard({  project,
}: {
  project: DashboardPayload["projects"][number];
}) {
  return (
    <article className={styles.projectCard}>
      <div className={styles.projectThumb}>
        {project.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.imageUrl} alt="" />
        ) : (
          <span className={styles.projectThumbFallback}>{project.name.slice(0, 2).toUpperCase()}</span>
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
      <div className={styles.statGrid}>
        {[0, 1, 2, 3].map((i) => (
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

function topicProgressHasData(rows: { solved: number; total: number }[]): boolean {
  return rows.some((r) => r.solved > 0 || r.total > 0);
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

function GitHubGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M12 .5A11.5 11.5 0 00.5 12a11.5 11.5 0 007.86 10.92c.58.1.79-.25.79-.55v-1.93c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 015.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .3.21.66.8.55A11.5 11.5 0 0023.5 12 11.5 11.5 0 0012 .5z" />
    </svg>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { DevoraLogo } from "@/components/DevoraLogo";
import {
  loadProfile,
  saveProfile,
  PLATFORM_META,
  TECH_OPTIONS,
  DEMO_PROFILE,
  type DevoraProfile,
} from "@/lib/profile";
import { EditProfileModal } from "@/components/EditProfileModal";
import { HomeButton } from "@/components/HomeButton";
import styles from "./dashboard.module.css";

const TECH_COLORS: Record<string, string> = {
  React: "#61dafb", "Next.js": "#ffffff", TypeScript: "#3178c6", "Node.js": "#5fa04e",
  Python: "#3776ab", Java: "#e76f00", "C++": "#00599c", MySQL: "#4479a1",
  PostgreSQL: "#4169e1", MongoDB: "#47a248", Docker: "#2496ed", Tailwind: "#38bdf8",
  Express: "#eeeeee", Git: "#f05032",
};

/* Deterministic pseudo-random so the heatmap is stable between renders */
function seeded(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function Heatmap({ seed, weeks = 26 }: { seed: number; weeks?: number }) {
  const cells = useMemo(() => {
    const out: { level: number }[] = [];
    for (let i = 0; i < weeks * 7; i++) {
      const r = seeded(seed + i);
      const level = r < 0.18 ? 0 : r < 0.45 ? 1 : r < 0.72 ? 2 : r < 0.9 ? 3 : 4;
      out.push({ level });
    }
    return out;
  }, [seed, weeks]);
  return (
    <div className={styles.heat} role="img" aria-label="Submission activity heatmap">
      {cells.map((c, i) => (
        <span key={i} className={styles.heatCell} data-l={c.level} />
      ))}
    </div>
  );
}

function PlatformIcon({ src, label }: { src: string; label: string }) {
  return (
    <span className={styles.pIcon}>
      <Image src={src} alt="" width={20} height={20} className={styles.pIconImg} />
      <span className={styles.pIconLabel}>{label}</span>
    </span>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "D";
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<DevoraProfile>(DEMO_PROFILE);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [signedInName, setSignedInName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadProfile().then((r) => {
      if (!alive) return;
      setProfile(r.profile);
      setSignedInName(r.user?.name ?? null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const onSaved = useCallback((p: DevoraProfile) => {
    setProfile(p);
    setEditing(false);
  }, []);

  async function handleSignOut() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const tabs = ["Overview", "Stats", "Badges", "Projects", "Activity"];

  return (
    <main className={styles.wrap}>
      <div className={styles.brandRow}>
        <DevoraLogo size="lg" />
        {/* Shared Home button. It is a flex child of .brandRow, so it reflows
            with the row instead of sitting at a fixed offset. */}
        <HomeButton />
        <div className={styles.brandRight}>
          <div className={styles.mtc}>More Than Code</div>
          <div className={styles.mtcSub}>A Better You</div>
        </div>
        {signedInName !== null && (
          <button className={styles.signOut} type="button" onClick={handleSignOut} title="Sign out">
            Sign out
          </button>
        )}
      </div>

      <section className={styles.glowCard} aria-label="Developer dashboard">
        {/* ── Profile header ─────────────────────────────── */}
        <div className={styles.profHead}>
          <div className={styles.avatarBox}>
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={profile.name} className={styles.avatarImg} />
            ) : (
              <div className={styles.avatarFallback}>{initials(profile.name)}</div>
            )}
            <span className={styles.onlineDot} aria-hidden="true" />
          </div>

          <div className={styles.profInfo}>
            <h1 className={styles.name}>
              {profile.name}
              <svg className={styles.verified} viewBox="0 0 24 24" aria-label="Verified">
                <path
                  fill="#f2932c"
                  d="M12 1.8l2.4 2.1 3.2-.4 1.2 3 2.9 1.4-.7 3.1 2 2.5-2 2.5.7 3.1-2.9 1.4-1.2 3-3.2-.4L12 22.2l-2.4-2.1-3.2.4-1.2-3-2.9-1.4.7-3.1-2-2.5 2-2.5-.7-3.1 2.9-1.4 1.2-3 3.2.4L12 1.8z"
                />
                <path fill="#0b0b0c" d="M10.6 15.7l-3-3 1.3-1.3 1.7 1.7 4.5-4.5 1.3 1.3-5.8 5.8z" />
              </svg>
            </h1>
            <div className={styles.handle}>{profile.handle}</div>
            {(profile.tagline || profile.bio) && (
              <p className={styles.tagline}>{profile.tagline || profile.bio}</p>
            )}
            <div className={styles.metaRow}>
              {profile.location && (
                <span className={styles.meta}>
                  <PinIcon /> {profile.location}
                </span>
              )}
              {profile.education && (
                <span className={styles.meta}>
                  <CapIcon /> {profile.education}
                </span>
              )}
              {profile.role && (
                <span className={styles.meta}>
                  <BriefcaseIcon /> {profile.role}
                </span>
              )}
            </div>
            <div className={styles.socialRow}>
              <SocialBtn href={profile.socials.github && `https://${profile.socials.github.replace(/^https?:\/\//, "")}`} label="GitHub">
                <GithubIcon />
              </SocialBtn>
              <SocialBtn href={profile.socials.linkedin && `https://${profile.socials.linkedin.replace(/^https?:\/\//, "")}`} label="LinkedIn">
                <LinkedinIcon />
              </SocialBtn>
              <SocialBtn href={profile.socials.x && `https://${profile.socials.x.replace(/^https?:\/\//, "")}`} label="X">
                <XIcon />
              </SocialBtn>
              <SocialBtn href={profile.socials.website && `https://${profile.socials.website.replace(/^https?:\/\//, "")}`} label="Website">
                <LinkIcon />
              </SocialBtn>
            </div>
          </div>

          <div className={styles.profRight}>
            <button className={styles.editBtn} type="button" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit Profile
            </button>
            {profile.quote && (
              <blockquote className={styles.quote}>
                <span className={styles.quoteMark}>“</span>
                {profile.quote}
                <span className={styles.quoteMarkEnd}>”</span>
              </blockquote>
            )}
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────── */}
        <nav className={styles.tabs} role="tablist" aria-label="Dashboard sections">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t.toLowerCase()}
              className={`${styles.tab} ${tab === t.toLowerCase() ? styles.tabOn : ""}`}
              onClick={() => setTab(t.toLowerCase())}
              type="button"
            >
              {t}
            </button>
          ))}
        </nav>

        {/* ── Overview ───────────────────────────────────── */}
        {tab === "overview" && (
          <>
            <div className={styles.statRow}>
              {PLATFORM_META.map((pm) => {
                const p = profile.platforms[pm.key];
                const headline = String(p.solved ?? p.rating ?? p.badges ?? "");
                return (
                  <article key={pm.key} className={styles.pCard}>
                    <PlatformIcon src={pm.logo} label={pm.label} />
                    <div className={styles.pHeadline}>{headline}</div>
                    <div className={styles.pSub}>{pm.field.label}</div>
                    <div className={styles.pBarTrack}>
                      <div
                        className={styles.pBar}
                        style={{ width: `${55 + (seeded(headline.length + pm.key.length) * 35)}%`, background: p.color }}
                      />
                    </div>
                    <div className={styles.pPercent}>{p.percentile || "—"} {p.username ? `· ${p.username}` : ""}</div>
                  </article>
                );
              })}

              <article className={styles.subCard}>
                <div className={styles.subTop}>
                  <div>
                    <div className={styles.subNum}>{profile.submissions.toLocaleString()}</div>
                    <div className={styles.subLabel}>Total Submissions</div>
                  </div>
                  <span className={styles.subRange}>
                    <CalIcon /> Last 6 months
                  </span>
                </div>
                <Heatmap seed={profile.submissions + profile.streak} />
                <div className={styles.subFoot}>
                  <span className={styles.streakFlame}>
                    <FlameIcon /> Keep Going
                  </span>
                  <span>{profile.streak} days streak</span>
                </div>
              </article>
            </div>

            <div className={styles.bottomRow}>
              <section className={styles.techSection} aria-label="Tech stack">
                <h2 className={styles.h2}>Tech Stack</h2>
                <div className={styles.techRow}>
                  {profile.techStack.slice(0, 6).map((t) => (
                    <span key={t} className={styles.techChip} title={t} style={{ color: TECH_COLORS[t] ?? "#e7e5dc", borderColor: `${TECH_COLORS[t] ?? "#888"}55` }}>
                      {t[0]}
                    </span>
                  ))}
                  {profile.techStack.length > 6 && <span className={styles.techChipMore}>···</span>}
                  {profile.techStack.length === 0 && <span className={styles.techEmpty}>Add your stack in Edit Profile</span>}
                </div>
              </section>

              {profile.featuredProject.title && (
                <section className={styles.featCard} aria-label="Featured project">
                  <span className={styles.featThumb}>
                    <Image src="/logo/devora-mark.png" alt="" width={34} height={44} />
                  </span>
                  <div className={styles.featInfo}>
                    <div className={styles.featTitle}>{profile.featuredProject.title}</div>
                    <div className={styles.featDesc}>{profile.featuredProject.desc}</div>
                    <div className={styles.featTags}>
                      {profile.featuredProject.tags.map((tg) => (
                        <span key={tg} className={styles.featTag}>{tg}</span>
                      ))}
                    </div>
                  </div>
                  <span className={styles.featArrow}>›</span>
                </section>
              )}

              <a className={styles.growCard} href="#overview" aria-label="Track, build, grow">
                <BarsIcon />
                <span className={styles.growText}>Track. Build. Grow.</span>
                <span className={styles.growArrow}>→</span>
              </a>
            </div>
          </>
        )}

        {/* ── Stats ──────────────────────────────────────── */}
        {tab === "stats" && (
          <div className={styles.statsGrid}>
            <StatCard n={PLATFORM_META.reduce((a, pm) => a + (profile.platforms[pm.key].solved ?? 0), 0)} l="Problems Solved (all platforms)" />
            <StatCard n={profile.submissions} l="Total Submissions" />
            <StatCard n={profile.streak} l="Day Streak" />
            <StatCard n={profile.techStack.length} l="Technologies" />
          </div>
        )}

        {/* ── Badges ─────────────────────────────────────── */}
        {tab === "badges" && (
          <div className={styles.badgeWrap}>
            {PLATFORM_META.map((pm) => {
              const p = profile.platforms[pm.key];
              return (
                <div key={pm.key} className={styles.badgeCard}>
                  <Image src={pm.logo} alt="" width={26} height={26} />
                  <div>
                    <div className={styles.badgeTitle}>{pm.label}</div>
                    <div className={styles.badgeSub}>{p.percentile || "No ranking yet"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Projects ───────────────────────────────────── */}
        {tab === "projects" && (
          <div className={styles.statsGrid}>
            <div className={styles.projectCard}>
              <div className={styles.badgeTitle}>{profile.featuredProject.title || "No featured project yet"}</div>
              <div className={styles.badgeSub}>{profile.featuredProject.desc || "Add one in Edit Profile"}</div>
              <div className={styles.featTags}>
                {profile.featuredProject.tags.map((tg) => (
                  <span key={tg} className={styles.featTag}>{tg}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Activity ───────────────────────────────────── */}
        {tab === "activity" && (
          <div className={styles.activityCard}>
            <div className={styles.actRow}><span className={styles.actDot} /> Solved 2 problems on LeetCode <span className={styles.actTime}>today</span></div>
            <div className={styles.actRow}><span className={styles.actDot} /> {profile.streak}-day streak in progress <span className={styles.actTime}>today</span></div>
            <div className={styles.actRow}><span className={styles.actDot} /> Updated Devora profile <span className={styles.actTime}>this week</span></div>
          </div>
        )}

        {loading && <div className={styles.loadingVeil}>Loading your profile…</div>}
      </section>

      {editing && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={onSaved}
        />
      )}
    </main>
  );
}

function StatCard({ n, l }: { n: number; l: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.subNum}>{n.toLocaleString()}</div>
      <div className={styles.subLabel}>{l}</div>
    </div>
  );
}

function SocialBtn({ href, label, children }: { href?: string; label: string; children: React.ReactNode }) {
  const cls = `${styles.socialBtn} ${!href ? styles.socialBtnEmpty : ""}`;
  if (!href) return <span className={cls} title={`${label} — add in Edit Profile`}>{children}</span>;
  return (
    <a className={cls} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
      {children}
    </a>
  );
}

/* ── Icons ─────────────────────────────────────────────── */
function PinIcon() {
  return <svg viewBox="0 0 24 24" className={styles.metaIcon}><path fill="currentColor" d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" /></svg>;
}
function CapIcon() {
  return <svg viewBox="0 0 24 24" className={styles.metaIcon}><path fill="currentColor" d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" /></svg>;
}
function BriefcaseIcon() {
  return <svg viewBox="0 0 24 24" className={styles.metaIcon}><path fill="currentColor" d="M20 6h-4V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2H4a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2zm-6 0h-4V4h4v2z" /></svg>;
}
function GithubIcon() {
  return <svg viewBox="0 0 24 24" className={styles.socialIco}><path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 015.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.14c0 .31.21.68.8.56A11.52 11.52 0 0023.5 12C23.5 5.65 18.35.5 12 .5z" /></svg>;
}
function LinkedinIcon() {
  return <svg viewBox="0 0 24 24" className={styles.socialIco}><path fill="currentColor" d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.55V9h3.57v11.45z" /></svg>;
}
function XIcon() {
  return <svg viewBox="0 0 24 24" className={styles.socialIco}><path fill="currentColor" d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41z" /></svg>;
}
function LinkIcon() {
  return <svg viewBox="0 0 24 24" className={styles.socialIco}><path fill="currentColor" d="M3.9 12a3.1 3.1 0 013.1-3.1h4V7H7a5 5 0 000 10h4v-1.9H7A3.1 3.1 0 013.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 010 6.2h-4V17h4a5 5 0 000-10z" /></svg>;
}
function PencilIcon() {
  return <svg viewBox="0 0 24 24" className={styles.editIco}><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>;
}
function CalIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14" style={{ marginRight: 5 }}><path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10z" /></svg>;
}
function FlameIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" style={{ marginRight: 6 }}><path fill="#f2932c" d="M13.5 0.67s0.74 2.65 0.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l0.03-0.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8c0-5.39-2.61-10.2-6.5-13.33zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-0.36 3.6-1.21 4.62-2.58 0.39 1.29 0.59 2.65 0.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" /></svg>;
}
function BarsIcon() {
  return <svg viewBox="0 0 24 24" width="26" height="26" className={styles.growBars}><path fill="#f2932c" d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" /></svg>;
}

"use client";

/**
 * Public profile renderer.
 *
 * Receives only the fields the profile owner left visible — the server has
 * already stripped everything else in `devora_public_profile`.
 */

import { PLATFORM_BY_KEY, type PlatformKey } from "@/lib/types";
import { initialsOf } from "@/lib/avatar";
import { PlatformLogo } from "@/components/dashboard/DashboardView";
import styles from "@/app/dashboard/dashboard.module.css";

export type PublicProfileData = {
  username: string;
  displayName: string;
  developerRole?: string;
  bio?: string;
  location?: string;
  email?: string;
  skills?: string[];
  socials?: Record<string, string | undefined>;
  platforms?: {
    platform: PlatformKey;
    username: string;
    url: string | null;
    stats: Record<string, number | string | null> | null;
  }[];
  projects?: {
    name: string;
    description: string | null;
    techStack: string[] | null;
    githubUrl: string | null;
    liveUrl: string | null;
    imageUrl: string | null;
  }[];
};

const SOCIAL_LABELS: Record<string, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  x: "X",
  website: "Website",
  portfolio: "Portfolio",
};

export function PublicProfile({ profile }: { profile: PublicProfileData }) {
  const socials = Object.entries(profile.socials ?? {}).filter(([, v]) => Boolean(v));
  const platforms = profile.platforms ?? [];
  const projects = profile.projects ?? [];

  return (
    <>
      <header
        style={{
          display: "flex",
          gap: 20,
          alignItems: "center",
          margin: "26px 0 22px",
          flexWrap: "wrap",
        }}
      >
        <span
          className={styles.avatar}
          style={{ width: 84, height: 84, flexBasis: 84, borderRadius: 20, fontSize: 28 }}
        >
          {initialsOf(profile.displayName)}
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: "0 0 5px", fontSize: 26, letterSpacing: "-0.02em" }}>
            {profile.displayName}
          </h1>
          <p style={{ margin: "0 0 8px", color: "#9ca3af", fontSize: 14 }}>
            @{profile.username}
            {profile.developerRole ? ` · ${profile.developerRole}` : ""}
            {profile.location ? ` · ${profile.location}` : ""}
          </p>
          {socials.length > 0 && (
            <div className={styles.chipRow}>
              {socials.map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.chip}
                  style={{ color: "#ffd7bd", textDecoration: "none" }}
                >
                  {SOCIAL_LABELS[key] ?? key} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      </header>

      {profile.bio && (
        <section className={styles.card} style={{ marginBottom: 14 }}>
          <p style={{ margin: 0, lineHeight: 1.7, color: "#9ca3af", fontSize: 14 }}>
            {profile.bio}
          </p>
        </section>
      )}

      {profile.skills && profile.skills.length > 0 && (
        <section className={styles.card} style={{ marginBottom: 14 }}>
          <h2 className={styles.sectionTitle} style={{ marginBottom: 12 }}>
            Skills
          </h2>
          <div className={styles.chipRow}>
            {profile.skills.map((s) => (
              <span key={s} className={styles.chip}>
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {platforms.length > 0 && (
        <section style={{ marginBottom: 14 }}>
          <h2 className={styles.sectionTitle} style={{ margin: "0 0 12px" }}>
            Coding platforms
          </h2>
          <div className={styles.platformGrid}>
            {platforms.map((p) => (
              <div key={p.username} className={styles.platformCard}>
                <div className={styles.platformTop}>
                  <PlatformLogo platform={p.platform} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.platformName}>
                      {PLATFORM_BY_KEY[p.platform]?.label ?? p.platform}
                    </div>
                    <div className={styles.platformHandle}>@{p.username}</div>
                  </div>
                  <span className={styles.pill} data-tone="ok" style={{ marginLeft: "auto" }}>
                    ✓
                  </span>
                </div>
                {p.stats && Object.keys(p.stats).length > 0 && (
                  <div className={styles.platformMetrics}>
                    {Object.entries(p.stats).map(([key, value]) => (
                      <div className={styles.metric} key={key}>
                        <div className={styles.metricLabel}>
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </div>
                        <div className={styles.metricValue}>
                          {typeof value === "number" ? value.toLocaleString() : value ?? "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle} style={{ margin: "0 0 12px" }}>
            Projects
          </h2>
          <div className={styles.projectGrid}>
            {projects.map((p) => (
              <article key={p.name} className={styles.projectCard}>
                <div className={styles.projectThumb}>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" />
                  ) : (
                    <span className={styles.projectThumbFallback}>
                      {p.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className={styles.projectBody}>
                  <h3 className={styles.projectName}>{p.name}</h3>
                  {p.description && <p className={styles.projectDesc}>{p.description}</p>}
                  {p.techStack && p.techStack.length > 0 && (
                    <div className={styles.chipRow}>
                      {p.techStack.slice(0, 6).map((t) => (
                        <span key={t} className={styles.chip}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className={styles.projectLinks}>
                    {p.githubUrl && (
                      <a
                        href={p.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.projectLink}
                      >
                        GitHub ↗
                      </a>
                    )}
                    {p.liveUrl && (
                      <a
                        href={p.liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.projectLink}
                      >
                        Live demo ↗
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <p style={{ marginTop: 36, color: "#6b7280", fontSize: 12.5 }}>
        This profile is rendered from the fields its owner marked public.{" "}
        <a href="/signup" style={{ color: "#ff6a00" }}>
          Build yours on Devora
        </a>
        .
      </p>
    </>
  );
}

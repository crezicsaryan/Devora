"use client";

import type { JSX } from "react";
import {
  profile,
  stats,
  platforms,
  questions,
  events,
  platformStatData,
  techStack,
} from "@/data/mock";
import { DevoraNameplate } from "./DevoraNameplate";
import styles from "./Dashboard.module.css";

export function Dashboard() {
  return (
    <div className="view active" id="view-dashboard" aria-live="polite">
      {/* Profile header */}
      <div className="profile-card">
        <div className="profile-left">
          <div style={{ position: "relative" }}>
            <div className="profile-avatar" aria-hidden="true">{profile.initials}</div>
            <span className="profile-avatar-ring" />
          </div>
          <div>
            <div className="profile-name">
              {profile.name}
              {profile.verified && (
                <span className="verified-badge" aria-label="Verified profile">
                  <CheckSvg />
                  Verified
                </span>
              )}
            </div>
            <div className="profile-handle">{profile.handle}</div>
            <div className="profile-tags">
              {profile.tags.map((tag) => (
                <span key={tag} className="tag verified">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="score-block">
          <div className="score-num">{profile.devScore}</div>
          <div className="score-label">Dev Score</div>
        </div>
      </div>

      {/* Billboard hero with 3D nameplate */}
      <div className="billboard">
        <div className="billboard-hero">
          <h1 className="billboard-title">
            One link that<br />
            tracks the dev<br />
            <span className="accent">you are becoming.</span>
          </h1>
          <p className="billboard-sub">
            Devora unifies your LeetCode, GeeksforGeeks, CodeChef, Codeforces,
            HackerRank and GitHub progress into a single profile you can share.
          </p>
          <div className="billboard-cta">
            <button className="cta-ghost" type="button">
              <LinkSvg />
              View public profile
            </button>
            <button className="btn btn-primary" type="button">
              Connect your platforms
            </button>
          </div>
        </div>

        <div className="billboard-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <FlameSvg />
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.1px" }}>
              Current streak
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 42, fontWeight: 700, color: "var(--orange-bright)" }}>
              63
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text-faint)" }}>
              days · keep going
            </span>
          </div>

          <div className="billboard-card-stats">
            <div>
              <div className="billboard-stat-label">Solved</div>
              <div className="billboard-stat-value orange">1,284</div>
            </div>
            <div>
              <div className="billboard-stat-label">Max streak</div>
              <div className="billboard-stat-value">118d</div>
            </div>
            <div>
              <div className="billboard-stat-label">Contests</div>
              <div className="billboard-stat-value">37</div>
            </div>
            <div>
              <div className="billboard-stat-label">Best rating</div>
              <div className="billboard-stat-value">1,912</div>
            </div>
          </div>

          <div style={{ position: "relative", marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="link-btn" style={{ color: "var(--text-dim)" }}>All stats</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-faint)" }}>
                Updated 2 min ago
              </span>
            </div>
          </div>

          <div style={{ position: "absolute", bottom: 16, left: 22, right: 22 }}>
            <button className="btn btn-primary" type="button" style={{ width: "100%" }}>
              Track your first week
            </button>
          </div>
        </div>
      </div>

      {/* 3D nameplate strip under hero */}
      <div style={{ marginTop: 28, marginBottom: 22 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 16px",
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-m)",
          }}
        >
          <DevoraNameplate size="md" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
              Devora nameplate
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
              Interactive 3D identity · drag to rotate · glow follows your accent color
            </div>
          </div>
          <button
            className="btn"
            type="button"
            style={{ padding: "6px 10px", fontSize: 12 }}
            aria-label="Expand 3D nameplate"
          >
            <ExpandSvg />
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="stat-strip" role="list">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-cell" role="listitem">
            <div className={`stat-num ${stat.highlight ?? ""}`}>{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Submission activity</div>
            <div className="section-sub">last 6 months · all platforms combined</div>
          </div>
        </div>
        <div className="heatmap-wrap">
          <div className="heatmap" aria-label="Contribution activity grid">
            {Array.from({ length: 26 * 7 }).map((_, i) => {
              const week = Math.floor(i / 7);
              const day = i % 7;
              const seed = 20260915 + week * 7 + day * 3;
              let s = seed;
              for (let _ = 0; _ < 3; _++) s = (s * 9301 + 49297) % 233280;
              const r = s / 233280;
              const shades = ["#19222b", "#1d4d43", "#2a7d69", "#3fae8c", "#49e2b0"];
              const idx = r > 0.5 ? Math.min(4, Math.floor((r - 0.5) / 0.12) + 1) : 0;
              return (
                <div
                  key={i}
                  className="hcell"
                  style={{ background: shades[idx] }}
                  title={idx === 0 ? "No submissions" : `${idx} activity`}
                  aria-label={idx === 0 ? "No submissions" : `${idx} activity`}
                />
              );
            })}
          </div>
        </div>
        <div className="heat-legend">
          Less
          <span className="hcell" style={{ background: "#19222b" }} />
          <span className="hcell" style={{ background: "#1d4d43" }} />
          <span className="hcell" style={{ background: "#2a7d69" }} />
          <span className="hcell" style={{ background: "#3fae8c" }} />
          <span className="hcell" style={{ background: "#49e2b0" }} />
          More
        </div>
      </div>

      {/* Two column breakdown */}
      <div className="two-col">
        <div className="section">
          <div className="section-head">
            <div className="section-title">Difficulty breakdown</div>
          </div>
          <div className="bar-row">
            <div className="bar-label">Easy</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: "82%", background: "var(--easy)" }} />
            </div>
            <div className="bar-count">521</div>
          </div>
          <div className="bar-row">
            <div className="bar-label">Medium</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: "58%", background: "var(--med)" }} />
            </div>
            <div className="bar-count">602</div>
          </div>
          <div className="bar-row">
            <div className="bar-label">Hard</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: "21%", background: "var(--hard)" }} />
            </div>
            <div className="bar-count">161</div>
          </div>
        </div>

        <div className="section">
          <div className="section-head">
            <div className="section-title">Top topics</div>
          </div>
          {[
            { label: "Arrays", pct: 92, count: 241 },
            { label: "DP", pct: 71, count: 186 },
            { label: "Graphs", pct: 58, count: 152 },
            { label: "Trees", pct: 49, count: 129 },
            { label: "Strings", pct: 44, count: 115 },
          ].map((topic) => (
            <div key={topic.label} className="topic-row">
              <div className="topic-label">{topic.label}</div>
              <div className="topic-track">
                <div className="topic-fill" style={{ width: `${topic.pct}%` }} />
              </div>
              <div className="topic-count">{topic.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Platform cards */}
      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Connected platforms</div>
            <div className="section-sub">6 linked · synced on visit</div>
          </div>
          <button className="link-btn" type="button">Manage</button>
        </div>
        <div className="platform-grid">
          {platforms.map((p) => (
            <div key={p.name} className="platform-card">
              <div className="platform-top">
                <div className="platform-id">
                  <div className="platform-icon" style={{ background: p.color }}>{p.init}</div>
                  <div>
                    <div className="platform-name">{p.name}</div>
                    <div className="platform-handle">{p.handle}</div>
                  </div>
                </div>
                <span
                  className={p.verified ? "verified-dot" : "unverified-dot"}
                  aria-label={p.verified ? "Verified" : "Unverified"}
                />
              </div>
              <div className="platform-stats">
                <div>
                  <div className="platform-stat-num">{p.solved}</div>
                  <div className="platform-stat-label">SOLVED</div>
                </div>
                <div className="platform-extra">{p.extra}</div>
              </div>
            </div>
          ))}
          <button className="platform-add" type="button">
            + Connect another platform
          </button>
        </div>
      </div>

      {/* Preview columns */}
      <div className="two-col">
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-title">Recently saved questions</div>
              <div className="section-sub">5 of 8 tracked</div>
            </div>
            <button className="link-btn" type="button">View all</button>
          </div>
          <div className="q-preview">
            {questions.slice(0, 5).map((q) => (
              <div key={q.title} className="preview-row">
                <div className="preview-left">
                  <span
                    className="diff-dot"
                    style={{ background: `var(--${q.difficulty.toLowerCase()})` }}
                    aria-hidden="true"
                  />
                  <span>{q.title}</span>
                </div>
                <span className="sheet-chip">{q.sheet}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-title">Upcoming contests</div>
              <div className="section-sub">4 upcoming</div>
            </div>
            <button className="link-btn" type="button">View all</button>
          </div>
          {events.slice(0, 4).map((e) => (
            <div key={`${e.month}-${e.day}`} className="preview-row">
              <div className="preview-left">
                <span className="event-date">{e.month} {e.day}</span>
                <span>{e.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function CheckSvg() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
    </svg>
  );
}

function LinkSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function FlameSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 2c3.5 0 6.5 2.5 7 6 .5-3 3-6 7-6-4 0-8 3-8 7 0 2 .8 4 2 5.5C13.2 20.3 12 22 12 22s-1.2-1.7-2-3.5C9.8 20.5 9 18.5 9 16.5 9 12.5 5 9.5 5 9.5c.5-3.5 3.5-6 7-6z" />
    </svg>
  );
}

function ExpandSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function heatmapCells() {
  const seed = 20260915;
  const weeks = 26;
  const shades = ["#19222b", "#1d4d43", "#2a7d69", "#3fae8c", "#49e2b0"];
  let s = seed;

  const cells: JSX.Element[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      s = (s * 9301 + 49297) % 233280;
      const r = s / 233280;
      const idx = r > 0.5 ? Math.min(4, Math.floor((r - 0.5) / 0.12) + 1) : 0;
      cells.push(
        <div
          key={`${w}-${d}`}
          className="hcell"
          style={{ background: shades[idx] }}
          title={idx === 0 ? "No submissions" : `${idx} activity`}
          aria-label={idx === 0 ? "No submissions" : `${idx} activity`}
        />
      );
    }
  }
  return cells;
}

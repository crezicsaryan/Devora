"use client";

/**
 * Small, dependency-free chart primitives.
 *
 * Everything is inline SVG so the dashboard stays fast and there is no chart
 * library to keep in sync with the theme tokens. All values come from props —
 * no numbers are invented here.
 */

import { useMemo, useState } from "react";
import type { ActivityPoint, DifficultyBreakdown, PlatformComparisonRow } from "@/lib/types";
import {
  formatLongDayLabel,
  type GraphBucket,
  type HeatmapGrid,
} from "@/lib/dashboard-metrics";

/* ------------------------------- activity -------------------------------- */

export function ActivityChart({
  points,
  range,
}: {
  points: ActivityPoint[];
  range: string;
}) {
  const W = 900;
  const H = 220;
  const PAD = { top: 16, right: 12, bottom: 26, left: 34 };

  if (points.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 190,
          border: "1px dashed #252529",
          borderRadius: 12,
          color: "#6b7280",
          fontSize: 13,
        }}
      >
        No activity recorded for this range yet.
      </div>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...points.map((p) => p.count));
  // Round the axis up to something readable.
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;

  const x = (i: number) =>
    points.length === 1 ? PAD.left + innerW / 2 : PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.count).toFixed(2)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(2)},${(PAD.top + innerH).toFixed(2)} L${x(0).toFixed(2)},${(PAD.top + innerH).toFixed(2)} Z`;

  const gridLines = [0, 1, 2, 3, 4].map((i) => top - step * i);

  // Label roughly six ticks regardless of range length.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const total = points.reduce((sum, p) => sum + p.count, 0);

  return (
    <>
      <div style={{ width: "100%", overflowX: "auto", overflowY: "hidden" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ display: "block", width: "100%", minWidth: 460, height: 220 }}
          role="img"
          aria-label={`Activity over the last ${range}`}
        >
          <defs>
            <linearGradient id="devoraArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff6a00" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#ff6a00" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridLines.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="#252529"
                strokeWidth="1"
                strokeDasharray={v === 0 ? undefined : "3 5"}
              />
              <text x={PAD.left - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#6b7280">
                {v}
              </text>
            </g>
          ))}

          <path d={area} fill="url(#devoraArea)" />
          <path d={line} fill="none" stroke="#ff6a00" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {points.map((p, i) => (
            <circle key={p.day} cx={x(i)} cy={y(p.count)} r={p.count > 0 ? 2.6 : 0} fill="#ff6a00" />
          ))}

          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <text key={`l-${p.day}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#6b7280">
                {formatDay(p.day)}
              </text>
            ) : null
          )}
        </svg>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          marginTop: 10,
          fontSize: 11.5,
          color: "#6b7280",
        }}
      >
        <span>
          {total} {total === 1 ? "submission" : "submissions"} in this range
        </span>
        <span>Peak {max}/day</span>
      </div>
    </>
  );
}

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ------------------------------ difficulty ------------------------------- */

const DIFF_COLORS: Record<"easy" | "medium" | "hard", string> = {
  easy: "#34d399",
  medium: "#fbbf24",
  hard: "#f87171",
};

export function DifficultyDonut({ breakdown }: { breakdown: DifficultyBreakdown }) {
  const segments = (["easy", "medium", "hard"] as const).map((key) => ({
    key,
    value: breakdown[key],
    color: DIFF_COLORS[key],
  }));

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  const SIZE = 132;
  const CENTER = SIZE / 2;
  const STROKE = 15;

  let offset = 0;

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      <circle
        cx={CENTER}
        cy={CENTER}
        r={R}
        fill="none"
        stroke="#1c1c20"
        strokeWidth={STROKE}
      />
      {total > 0 &&
        segments.map((s) => {
          const len = (s.value / total) * C;
          const el = (
            <circle
              key={s.key}
              cx={CENTER}
              cy={CENTER}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={STROKE}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      <text
        x={CENTER}
        y={CENTER - 2}
        textAnchor="middle"
        fontSize="21"
        fontWeight="700"
        fill="#ffffff"
      >
        {total}
      </text>
      <text x={CENTER} y={CENTER + 14} textAnchor="middle" fontSize="10" fill="#6b7280">
        solved
      </text>
    </svg>
  );
}

export function DifficultyBars({ breakdown }: { breakdown: DifficultyBreakdown }) {
  const rows = (["easy", "medium", "hard"] as const).map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    value: breakdown[key],
    color: DIFF_COLORS[key],
  }));

  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((row) => {
        const pct = breakdown.total > 0 ? Math.round((row.value / breakdown.total) * 100) : 0;
        return (
          <div key={row.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                fontSize: 12.5,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#9ca3af" }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 3,
                    display: "inline-block",
                    background: row.color,
                  }}
                />
                {row.label}
              </span>
              <span style={{ color: "#ffffff", fontWeight: 650 }}>
                {row.value}
                <span style={{ color: "#6b7280", fontWeight: 500, marginLeft: 5 }}>{pct}%</span>
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "#1c1c20", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: 999,
                  background: row.color,
                  width: `${(row.value / max) * 100}%`,
                  transition: "width .5s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------- heatmap --------------------------------- */

const HEAT_COLORS = ["#17171b", "#4a2410", "#8a3d0d", "#c9560f", "#ff6a00"];
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

/**
 * GitHub-style contribution heatmap.
 *
 * Every cell is a real day from the stored daily series — the level is a
 * function of that day's activity count, never a seeded random. Hovering a day
 * reveals its date, activity count and solved count.
 */
export function ActivityHeatmap({ grid }: { grid: HeatmapGrid }) {
  const [hover, setHover] = useState<{
    day: string;
    activities: number;
    problems: number;
  } | null>(null);

  if (grid.weeks.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 150,
          border: "1px dashed #252529",
          borderRadius: 12,
          color: "#6b7280",
          fontSize: 13,
        }}
      >
        No coding activity recorded for this range yet.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          minHeight: 34,
          marginBottom: 8,
          fontSize: 12.5,
          color: hover ? "#e5e7eb" : "#6b7280",
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 14px",
          alignItems: "center",
        }}
      >
        {hover ? (
          <>
            <strong style={{ color: "#ffffff", fontWeight: 650 }}>
              {formatLongDayLabel(hover.day)}
            </strong>
            <span>
              {hover.activities} {hover.activities === 1 ? "activity" : "activities"}
            </span>
            <span>
              {hover.problems} {hover.problems === 1 ? "problem" : "problems"} solved
            </span>
          </>
        ) : (
          <span>Hover a day to see its activity.</span>
        )}
      </div>

      <div style={{ width: "100%", overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
        <div style={{ display: "flex", gap: 6, minWidth: grid.weeks.length * 15 + 30 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              paddingTop: 15,
              fontSize: 9.5,
              color: "#6b7280",
            }}
            aria-hidden="true"
          >
            {DAY_LABELS.map((label, i) => (
              <span key={i} style={{ height: 12, lineHeight: "12px" }}>
                {label}
              </span>
            ))}
          </div>

          {grid.weeks.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span
                style={{
                  height: 12,
                  fontSize: 9.5,
                  color: "#6b7280",
                  whiteSpace: "nowrap",
                  lineHeight: "12px",
                }}
              >
                {grid.monthTicks.find((t) => t.index === wi)?.label ?? ""}
              </span>
              {week.map((cell, di) =>
                cell.day === null ? (
                  <span key={di} style={{ width: 12, height: 12 }} />
                ) : (
                  <button
                    key={di}
                    type="button"
                    aria-label={`${cell.day}: ${cell.activities} activities, ${cell.problems} problems`}
                    onMouseEnter={() =>
                      setHover({
                        day: cell.day as string,
                        activities: cell.activities,
                        problems: cell.problems,
                      })
                    }
                    onMouseLeave={() => setHover(null)}
                    onFocus={() =>
                      setHover({
                        day: cell.day as string,
                        activities: cell.activities,
                        problems: cell.problems,
                      })
                    }
                    style={{
                      width: 12,
                      height: 12,
                      padding: 0,
                      border: "1px solid rgba(255,255,255,0.04)",
                      borderRadius: 3,
                      background: HEAT_COLORS[cell.level],
                      cursor: "pointer",
                      transition: "transform .12s ease, box-shadow .12s ease",
                      boxShadow:
                        hover?.day === cell.day ? "0 0 0 1.5px #ff6a00" : undefined,
                    }}
                  />
                )
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginTop: 10,
          fontSize: 11.5,
          color: "#6b7280",
          flexWrap: "wrap",
        }}
      >
        <span>
          {grid.totalActivities} {grid.totalActivities === 1 ? "activity" : "activities"} ·{" "}
          {grid.totalProblems} {grid.totalProblems === 1 ? "problem" : "problems"} solved
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          Less
          {HEAT_COLORS.map((color, i) => (
            <span
              key={i}
              style={{
                width: 11,
                height: 11,
                borderRadius: 3,
                background: color,
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

/* ------------------------------ trend chart ------------------------------ */

export type TrendSeries = { key: "activities" | "problems"; label: string; color: string };

/**
 * Multi-series line chart over time.
 *
 * Points come from `bucketSeries`, which is pure and driven by stored rows, so
 * the axis is continuous and every gap is a genuine zero.
 */
export function LineTrendChart({
  buckets,
  series,
  unit,
  height = 220,
}: {
  buckets: GraphBucket[];
  series: TrendSeries[];
  unit: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 900;
  const PAD = { top: 16, right: 14, bottom: 28, left: 38 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const max = useMemo(
    () => Math.max(1, ...buckets.flatMap((b) => series.map((s) => b[s.key] ?? 0))),
    [buckets, series]
  );
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;

  if (buckets.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 170,
          border: "1px dashed #252529",
          borderRadius: 12,
          color: "#6b7280",
          fontSize: 13,
        }}
      >
        No activity recorded for this range yet.
      </div>
    );
  }

  const x = (i: number) =>
    buckets.length === 1
      ? PAD.left + innerW / 2
      : PAD.left + (i / (buckets.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;

  const labelEvery = Math.max(1, Math.ceil(buckets.length / 7));
  const active = hover != null ? buckets[hover] : null;

  return (
    <div>
      <div
        style={{
          minHeight: 30,
          marginBottom: 6,
          fontSize: 12.5,
          color: active ? "#e5e7eb" : "#6b7280",
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 14px",
        }}
      >
        {active ? (
          <>
            <strong style={{ color: "#ffffff", fontWeight: 650 }}>{active.label}</strong>
            {series.map((s) => (
              <span key={s.key}>
                {s.label}: {active[s.key] ?? 0} {unit}
              </span>
            ))}
          </>
        ) : (
          <span>Hover the chart for exact values.</span>
        )}
      </div>

      <div style={{ width: "100%", overflowX: "auto", overflowY: "hidden" }}>
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          style={{ display: "block", width: "100%", minWidth: 460, height }}
          role="img"
          aria-label={series.map((s) => s.label).join(" and ") + " over time"}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`trend-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {[0, 1, 2, 3, 4].map((i) => {
            const v = top - step * i;
            return (
              <g key={v}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="#252529"
                  strokeWidth="1"
                  strokeDasharray={v === 0 ? undefined : "3 5"}
                />
                <text x={PAD.left - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#6b7280">
                  {v}
                </text>
              </g>
            );
          })}

          {series.map((s) => {
            const line = buckets
              .map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(b[s.key] ?? 0).toFixed(2)}`)
              .join(" ");
            const area = `${line} L${x(buckets.length - 1).toFixed(2)},${(PAD.top + innerH).toFixed(2)} L${x(0).toFixed(2)},${(PAD.top + innerH).toFixed(2)} Z`;
            return (
              <g key={s.key}>
                <path d={area} fill={`url(#trend-${s.key})`} />
                <path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {buckets.map((b, i) =>
                  (b[s.key] ?? 0) > 0 ? (
                    <circle key={b.key} cx={x(i)} cy={y(b[s.key] ?? 0)} r={2.6} fill={s.color} />
                  ) : null
                )}
              </g>
            );
          })}

          {hover != null && buckets[hover] && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="#ff6a00"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {buckets.map((b, i) => (
            <rect
              key={`hit-${b.key}`}
              x={x(i) - innerW / Math.max(1, buckets.length) / 2}
              y={PAD.top}
              width={Math.max(4, innerW / Math.max(1, buckets.length))}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}

          {buckets.map((b, i) =>
            i % labelEvery === 0 || i === buckets.length - 1 ? (
              <text
                key={`l-${b.key}`}
                x={x(i)}
                y={height - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {b.label}
              </text>
            ) : null
          )}
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 10,
          fontSize: 11.5,
          color: "#6b7280",
          flexWrap: "wrap",
        }}
      >
        {series.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 3,
                background: s.color,
                display: "inline-block",
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- comparison bars ----------------------------- */

export function ComparisonBars({ rows }: { rows: PlatformComparisonRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.solved));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((row) => (
        <div key={row.platform} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12.5,
              color: "#9ca3af",
            }}
          >
            <span>{row.label}</span>
            <span style={{ color: "#ffffff", fontWeight: 650 }}>
              {row.solved.toLocaleString()}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "#1c1c20", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg, #ff6a00, #ff9a4d)",
                width: `${(row.solved / max) * 100}%`,
                transition: "width .5s ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ progress bar ----------------------------- */

export function MiniBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div style={{ height: 7, borderRadius: 999, background: "#1c1c20", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          borderRadius: 999,
          background: "linear-gradient(90deg, #ff6a00, #ff9a4d)",
          width: `${pct}%`,
          transition: "width .5s ease",
        }}
      />
    </div>
  );
}

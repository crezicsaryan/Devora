"use client";

/**
 * Small, dependency-free chart primitives.
 *
 * Everything is inline SVG so the dashboard stays fast and there is no chart
 * library to keep in sync with the theme tokens. All values come from props —
 * no numbers are invented here.
 */

import type { ActivityPoint, DifficultyBreakdown } from "@/lib/types";

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

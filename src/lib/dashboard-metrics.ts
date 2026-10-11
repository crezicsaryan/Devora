/**
 * Pure dashboard math shared by the server and the client.
 *
 * Everything here is a deterministic function of stored daily rows — no
 * randomness, no demo seeds, no fallbacks that invent a number. Keeping these
 * helpers out of the components means the range switching and streak counting
 * are unit-testable (see scripts/verify-logic.ts) and identical wherever they
 * are used.
 */

import type {
  DailyActivity,
  GraphGranularity,
  HeatmapRange,
  PersonalBests,
  ProblemsRange,
} from "@/lib/types";

/* ------------------------------- day keys -------------------------------- */

/** Local `YYYY-MM-DD` key. Never uses toISOString, which would shift the day. */
export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDayKey(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function formatDayLabel(day: string): string {
  const d = parseDayKey(day);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatLongDayLabel(day: string): string {
  const d = parseDayKey(day);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return `${MONTH_LABELS[m - 1] ?? m}`;
}

export function dayCountFor(range: HeatmapRange | ProblemsRange): number | null {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "3m":
      return 90;
    case "6m":
      return 182;
    case "1y":
      return 365;
    default:
      return null;
  }
}

/* ------------------------------ date windows ----------------------------- */

/** Inclusive [from, to] window for a range, in local days. */
export function windowFor(
  range: HeatmapRange | ProblemsRange,
  today: Date = new Date()
): { from: Date; to: Date } {
  const to = startOfDay(today);
  const days = dayCountFor(range);

  if (days != null) return { from: addDays(to, -(days - 1)), to };

  if (range === "this-year") {
    return { from: new Date(to.getFullYear(), 0, 1), to };
  }
  if (range === "last-year") {
    const year = to.getFullYear() - 1;
    return { from: new Date(year, 0, 1), to: new Date(year, 11, 31) };
  }
  // "all" — open at the start; the caller clamps to the first day with data.
  return { from: new Date(1970, 0, 1), to };
}

/**
 * Filter a daily series to a range. `fill` densifies every day in the window
 * (so a chart axis is continuous and gaps read as genuine zeros); when false
 * only days that actually have activity survive.
 */
export function sliceSeries(
  daily: DailyActivity[],
  range: HeatmapRange | ProblemsRange,
  opts: { today?: Date; fill?: boolean } = {}
): DailyActivity[] {
  const today = opts.today ?? new Date();
  const { from, to } = windowFor(range, today);
  const byDay = new Map(daily.map((d) => [d.day, d]));

  // Nothing stored means nothing to plot — return early rather than emitting
  // an empty axis that spans decades.
  if (daily.length === 0) return [];

  // "all" starts at the first day that actually has data.
  let start = from;
  if (range === "all") {
    const first = daily.reduce((min, d) => (d.day < min ? d.day : min), daily[0].day);
    start = parseDayKey(first);
  }

  const out: DailyActivity[] = [];
  for (let cursor = startOfDay(start); cursor <= to; cursor = addDays(cursor, 1)) {
    const key = toDayKey(cursor);
    const row = byDay.get(key);
    if (row) out.push(row);
    else if (opts.fill) out.push({ day: key, activities: 0, problems: 0, byPlatform: {} });
  }
  return out;
}

export function sumSeries(rows: DailyActivity[]): { activities: number; problems: number } {
  return rows.reduce(
    (acc, r) => ({
      activities: acc.activities + r.activities,
      problems: acc.problems + r.problems,
    }),
    { activities: 0, problems: 0 }
  );
}

/* -------------------------------- streaks -------------------------------- */

/**
 * Current + longest streak over the real daily series.
 *
 * A coding day is a day with at least one genuine coding activity. The current
 * streak is still "alive" if the most recent coding day is today or yesterday
 * (today may simply not be over yet) and is 0 once a full day is missed.
 */
export function computeStreaks(
  daily: DailyActivity[],
  today: Date = new Date()
): { current: number; longest: number } {
  const days = daily
    .filter((d) => d.activities > 0)
    .map((d) => d.day)
    .sort();

  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = parseDayKey(days[i - 1]);
    const cur = parseDayKey(days[i]);
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86_400_000);
    run = diff === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const todayKey = toDayKey(startOfDay(today));
  const yesterdayKey = toDayKey(addDays(startOfDay(today), -1));
  const last = days[days.length - 1];
  if (last !== todayKey && last !== yesterdayKey) return { current: 0, longest };

  // Walk backwards from the most recent coding day.
  const present = new Set(days);
  let current = 0;
  let cursor = parseDayKey(last);
  while (present.has(toDayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

export function activeDayCount(daily: DailyActivity[]): number {
  return daily.filter((d) => d.activities > 0).length;
}

/* ------------------------------- bucketing ------------------------------- */

export type GraphBucket = {
  key: string;
  label: string;
  activities: number;
  problems: number;
};

/**
 * Bucket a daily series into daily / weekly / monthly points for the graphs.
 * Weekly buckets start on Monday; monthly buckets use the calendar month.
 */
export function bucketSeries(
  rows: DailyActivity[],
  granularity: GraphGranularity
): GraphBucket[] {
  if (granularity === "daily") {
    return rows.map((r) => ({
      key: r.day,
      label: formatDayLabel(r.day),
      activities: r.activities,
      problems: r.problems,
    }));
  }

  const buckets = new Map<string, GraphBucket>();
  const order: string[] = [];

  for (const row of rows) {
    const date = parseDayKey(row.day);
    const key =
      granularity === "weekly"
        ? toDayKey(addDays(startOfDay(date), -((date.getDay() + 6) % 7)))
        : row.day.slice(0, 7);

    if (!buckets.has(key)) {
      const label =
        granularity === "weekly"
          ? `Week of ${formatDayLabel(key)}`
          : `${monthLabel(key)} ${key.slice(0, 4)}`;
      buckets.set(key, { key, label, activities: 0, problems: 0 });
      order.push(key);
    }
    const bucket = buckets.get(key)!;
    bucket.activities += row.activities;
    bucket.problems += row.problems;
  }

  return order.map((key) => buckets.get(key)!);
}

/* -------------------------------- heatmap -------------------------------- */

export type HeatmapCell = {
  day: string | null;
  activities: number;
  problems: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export type HeatmapGrid = {
  /** One entry per week; each week holds 7 cells, index 0 = Monday. */
  weeks: HeatmapCell[][];
  monthTicks: { index: number; label: string }[];
  max: number;
  totalActivities: number;
  totalProblems: number;
};

/**
 * Intensity level for a day. Thresholds are absolute counts of activities
 * (per the product spec) and are never derived from invented data.
 */
export function activityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

export function buildHeatmapGrid(
  daily: DailyActivity[],
  range: HeatmapRange,
  today: Date = new Date()
): HeatmapGrid {
  const rows = sliceSeries(daily, range, { today, fill: true });
  const byDay = new Map(rows.map((r) => [r.day, r]));

  const empty = (): HeatmapCell => ({ day: null, activities: 0, problems: 0, level: 0 });

  if (rows.length === 0) {
    return { weeks: [], monthTicks: [], max: 0, totalActivities: 0, totalProblems: 0 };
  }

  const first = parseDayKey(rows[0].day);
  const last = parseDayKey(rows[rows.length - 1].day);

  // Align the grid so each column starts on Monday.
  const lead = (first.getDay() + 6) % 7;
  let cursor = addDays(first, -lead);

  const weeks: HeatmapCell[][] = [];
  const monthTicks: { index: number; label: string }[] = [];
  let currentWeek: HeatmapCell[] = [];
  let lastMonth = -1;

  while (cursor <= last) {
    const key = toDayKey(cursor);
    const row = byDay.get(key);
    const inRange = cursor >= first;

    if (currentWeek.length === 0) {
      const weekStartMonth = cursor.getMonth();
      if (inRange && weekStartMonth !== lastMonth) {
        monthTicks.push({
          index: weeks.length,
          label: MONTH_LABELS[weekStartMonth].slice(0, 3),
        });
        lastMonth = weekStartMonth;
      }
    }

    currentWeek.push(
      inRange && row
        ? {
            day: key,
            activities: row.activities,
            problems: row.problems,
            level: activityLevel(row.activities),
          }
        : empty()
    );

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cursor = addDays(cursor, 1);
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(empty());
    weeks.push(currentWeek);
  }

  const max = rows.reduce((m, r) => Math.max(m, r.activities), 0);
  const totals = sumSeries(rows);

  return {
    weeks,
    monthTicks,
    max,
    totalActivities: totals.activities,
    totalProblems: totals.problems,
  };
}

/* ------------------------------ personal bests --------------------------- */

export function computePersonalBests(
  daily: DailyActivity[],
  today: Date = new Date()
): PersonalBests {
  const withActivity = daily.filter((d) => d.activities > 0);
  if (withActivity.length === 0) {
    return {
      longestStreak: 0,
      mostProblemsInADay: null,
      mostProblemsInAMonth: null,
      mostActiveMonth: null,
      mostActiveWeek: null,
      hasData: false,
    };
  }

  const { longest } = computeStreaks(daily, today);

  let bestDay: { day: string; problems: number } | null = null;
  for (const row of daily) {
    if (row.problems > 0 && (!bestDay || row.problems > bestDay.problems)) {
      bestDay = { day: row.day, problems: row.problems };
    }
  }

  const byMonth = new Map<string, { problems: number; activities: number }>();
  for (const row of daily) {
    const key = row.day.slice(0, 7);
    const cur = byMonth.get(key) ?? { problems: 0, activities: 0 };
    cur.problems += row.problems;
    cur.activities += row.activities;
    byMonth.set(key, cur);
  }

  let bestMonth: { label: string; problems: number } | null = null;
  let busiestMonth: { label: string; activities: number } | null = null;
  for (const [key, agg] of byMonth) {
    if (agg.problems > 0 && (!bestMonth || agg.problems > bestMonth.problems)) {
      bestMonth = { label: `${monthLabel(key)} ${key.slice(0, 4)}`, problems: agg.problems };
    }
    if (!busiestMonth || agg.activities > busiestMonth.activities) {
      busiestMonth = { label: `${monthLabel(key)} ${key.slice(0, 4)}`, activities: agg.activities };
    }
  }

  // Weeks are Monday-aligned so the figure matches the weekly graph.
  const weekTotals = new Map<string, number>();
  for (const row of daily) {
    const date = parseDayKey(row.day);
    const key = toDayKey(addDays(startOfDay(date), -((date.getDay() + 6) % 7)));
    weekTotals.set(key, (weekTotals.get(key) ?? 0) + row.activities);
  }
  let bestWeek: { start: string; end: string; activities: number } | null = null;
  for (const [key, activities] of weekTotals) {
    if (!bestWeek || activities > bestWeek.activities) {
      bestWeek = { start: key, end: toDayKey(addDays(parseDayKey(key), 6)), activities };
    }
  }

  return {
    longestStreak: longest,
    mostProblemsInADay: bestDay,
    mostProblemsInAMonth: bestMonth,
    mostActiveMonth: busiestMonth,
    mostActiveWeek: bestWeek,
    hasData: true,
  };
}

export function monthKeyOf(date: Date): string {
  return toDayKey(date).slice(0, 7);
}

export type MonthAggregate = {
  monthKey: string;
  label: string;
  activities: number;
  problems: number;
  activeDays: number;
};

/** Roll a daily series up into calendar months, oldest first. */
export function aggregateMonths(daily: DailyActivity[]): MonthAggregate[] {
  const map = new Map<string, MonthAggregate>();
  for (const row of daily) {
    const key = row.day.slice(0, 7);
    let agg = map.get(key);
    if (!agg) {
      agg = {
        monthKey: key,
        label: `${monthLabel(key)} ${key.slice(0, 4)}`,
        activities: 0,
        problems: 0,
        activeDays: 0,
      };
      map.set(key, agg);
    }
    agg.activities += row.activities;
    agg.problems += row.problems;
    if (row.activities > 0) agg.activeDays += 1;
  }
  return [...map.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

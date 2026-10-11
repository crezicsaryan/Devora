/**
 * Devora domain types shared by the server and the client.
 * No runtime code here beyond a few constant maps, so this file is safe to
 * import from both sides of the boundary.
 */

import type { PlatformKey } from "@/lib/validation";

export type { PlatformKey };

/* ------------------------------- platforms ------------------------------- */

export type PlatformStatus =
  | "connected"
  | "linked"
  | "pending"
  | "error"
  | "disconnected";
export type SyncStatus = "idle" | "syncing" | "ok" | "failed";

/* --------------------------- verification ------------------------------- */

/**
 * Why a platform check ended the way it did.
 *
 * The whole point of this enum is that "we could not check" and "this account
 * does not exist" are DIFFERENT answers. Collapsing every upstream failure into
 * "invalid username" is what made every platform look broken.
 */
export type VerificationOutcome =
  /** The platform itself confirmed the account exists. */
  | "VERIFIED"
  /** The platform answered, and said there is no such account. */
  | "INVALID_PROFILE"
  /** The platform has no usable public source for this, or it changed shape. */
  | "VERIFICATION_UNAVAILABLE"
  /** The platform is throttling us. Nothing is wrong with the input. */
  | "RATE_LIMITED"
  /** Our own setup is incomplete (missing OAuth credentials). */
  | "CONFIGURATION_ERROR"
  /** We could not reach the platform at all. */
  | "NETWORK_ERROR";

export type PlatformVerifyResult = {
  outcome: VerificationOutcome;
  /** True ONLY for VERIFIED. Never inferred from a failure to check. */
  exists: boolean;
  message: string;
  /** The handle as the platform spells it, when we could resolve one. */
  username: string | null;
  /** The platform's own profile URL when it publishes one. */
  profileUrl: string | null;
  /** Can this platform actually produce figures we are allowed to store? */
  statsAvailable: boolean;
  /** May the user still keep this as a saved (unverified) link? */
  canSaveLink: boolean;
  /** The connection needs an authorization handshake, not a handle. */
  requiresOAuth?: boolean;
};

/** What a successful "save the link" response contains. */
export type PlatformLinkResult = {
  ok: true;
  platform: PlatformKey;
  username: string | null;
  profileUrl: string | null;
  connectionStatus: "linked" | "connected";
  verification: VerificationOutcome;
  message: string;
};

export type PlatformMeta = {
  key: PlatformKey;
  label: string;
  logo: string;
  /** Where the user types their handle. GitHub uses OAuth, not a handle. */
  handleLabel: string;
  handlePlaceholder: string;
  description: string;
  accent: string;
  /** Metrics this platform actually exposes. Used to keep cards honest. */
  metrics: string[];
  authType: "oauth" | "public";
  /** Some platforms rate-limit the public username check more aggressively. */
  availabilityHint: string;
  /**
   * True when the platform publishes no reliable public statistics source, so
   * Devora can only store the profile URL. The UI must never offer a "Sync"
   * button for these, and must never present them as a verified integration.
   */
  linkOnly: boolean;
  /** The host a user's profile URL lives on — used to accept pasted URLs. */
  profileHost: string;
};

export const PLATFORMS: PlatformMeta[] = [
  {
    key: "github",
    label: "GitHub",
    logo: "/platform-logos/github-white.png",
    handleLabel: "GitHub username",
    handlePlaceholder: "octocat",
    description: "Show your repositories, contributions and development activity.",
    accent: "#e7e5dc",
    metrics: ["repositories", "followers", "contributions"],
    authType: "oauth",
    availabilityHint: "GitHub connects through a secure authorization flow.",
    linkOnly: false,
    profileHost: "github.com",
  },
  {
    key: "leetcode",
    label: "LeetCode",
    logo: "/platform-logos/leetcode.png",
    handleLabel: "LeetCode username",
    handlePlaceholder: "your-handle",
    description: "Sync solved problems, contest rating and daily streaks.",
    accent: "#f2932c",
    metrics: ["solved", "rating", "streak"],
    authType: "public",
    availabilityHint: "Public profile data only.",
    linkOnly: false,
    profileHost: "leetcode.com",
  },
  {
    key: "gfg",
    label: "GeeksforGeeks",
    logo: "/platform-logos/gfg.png",
    handleLabel: "GFG username",
    handlePlaceholder: "your-handle",
    description: "Save your GeeksforGeeks profile link. GfG publishes no public statistics source.",
    accent: "#5fae7a",
    metrics: ["link"],
    authType: "public",
    availabilityHint: "Saved as a profile link — statistics cannot be verified.",
    linkOnly: true,
    profileHost: "geeksforgeeks.org",
  },
  {
    key: "codechef",
    label: "CodeChef",
    logo: "/platform-logos/codechef.png",
    handleLabel: "CodeChef username",
    handlePlaceholder: "your-handle",
    description: "Pull in your star rating and contest history.",
    accent: "#d9a441",
    metrics: ["rating", "contests"],
    authType: "public",
    availabilityHint: "Public profile data only.",
    linkOnly: false,
    profileHost: "codechef.com",
  },
  {
    key: "codeforces",
    label: "Codeforces",
    logo: "/platform-logos/codeforces.png",
    handleLabel: "Codeforces handle",
    handlePlaceholder: "your-handle",
    description: "Import your Codeforces rating, rank and problem count.",
    accent: "#4a90d9",
    metrics: ["solved", "rating", "contests"],
    authType: "public",
    availabilityHint: "Public profile data only.",
    linkOnly: false,
    profileHost: "codeforces.com",
  },
  {
    key: "hackerrank",
    label: "HackerRank",
    logo: "/platform-logos/hackerrank.png",
    handleLabel: "HackerRank username",
    handlePlaceholder: "your-handle",
    description: "Save your HackerRank profile link. HackerRank publishes no public statistics API.",
    accent: "#5fae7a",
    metrics: ["link"],
    authType: "public",
    availabilityHint: "Saved as a profile link — statistics cannot be verified.",
    linkOnly: true,
    profileHost: "hackerrank.com",
  },
];

export const PLATFORM_BY_KEY: Record<PlatformKey, PlatformMeta> = Object.fromEntries(
  PLATFORMS.map((p) => [p.key, p])
) as Record<PlatformKey, PlatformMeta>;

/* -------------------------------- profile -------------------------------- */

export type Visibility = {
  avatar: boolean;
  bio: boolean;
  role: boolean;
  location: boolean;
  skills: boolean;
  platforms: boolean;
  socials: boolean;
  projects: boolean;
  email: boolean;
};

export const DEFAULT_VISIBILITY: Visibility = {
  avatar: true,
  bio: true,
  role: true,
  location: true,
  skills: true,
  platforms: true,
  socials: true,
  projects: true,
  email: false,
};

export type DevoraSocials = {
  linkedin: string;
  github: string;
  twitter: string;
  portfolio: string;
  website: string;
  email: string;
};

export const EMPTY_SOCIALS: DevoraSocials = {
  linkedin: "",
  github: "",
  twitter: "",
  portfolio: "",
  website: "",
  email: "",
};

export type DevoraUserProfile = {
  displayName: string;
  username: string;
  bio: string;
  developerRole: string;
  location: string;
  avatarUrl: string;
  email: string;
};

/* ------------------------------- platforms ------------------------------- */

export type PlatformAccount = {
  id: string;
  platform: PlatformKey;
  username: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  authType: "oauth" | "public";
  connectionStatus: PlatformStatus;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  connectedAt: string;
};

export type PlatformStats = {
  platform: PlatformKey;
  solvedTotal: number | null;
  solvedEasy: number | null;
  solvedMedium: number | null;
  solvedHard: number | null;
  rating: number | null;
  maxRating: number | null;
  rankLabel: string | null;
  contests: number | null;
  badges: number | null;
  reputation: number | null;
  followers: number | null;
  publicRepos: number | null;
  contributions: number | null;
  streakCurrent: number | null;
  streakLongest: number | null;
  fetchedAt: string | null;
};

export type ConnectedPlatform = {
  account: PlatformAccount;
  stats: PlatformStats | null;
  meta: PlatformMeta;
};

/* ------------------------------- dashboard ------------------------------- */

export type DashboardStats = {
  totalSolved: number | null;
  currentStreak: number | null;
  longestStreak: number | null;
  /** Unique days with at least one genuine coding activity. */
  activeDays: number;
  /** Connected platform accounts, counted from real rows only. */
  platformsConnected: number;
  githubContributions: number | null;
};

export type DifficultyBreakdown = {
  easy: number;
  medium: number;
  hard: number;
  total: number;
  available: boolean;
};

export type ActivityPoint = {
  day: string;
  count: number;
};

export type TopicProgressRow = {
  topic: string;
  solved: number;
  total: number;
};

/* ------------------------------- activity -------------------------------- */

/**
 * One day of real activity, aggregated across every connected platform.
 *
 * `activities` counts activity records (the heatmap's intensity), `problems`
 * counts solved problems (the problems chart), and `byPlatform` keeps the
 * per-platform split so the platform breakdown stays honest.
 */
export type DailyActivity = {
  day: string;
  activities: number;
  problems: number;
  byPlatform: Record<string, number>;
};

/**
 * The normalized activity types stored in `activity_events.activity_type`.
 *
 * Deliberately excludes passive events (login, profile view, dashboard visit):
 * those must never count toward streaks or active days.
 */
export const ACTIVITY_TYPES = [
  "PROBLEM_SOLVED",
  "PROBLEM_SUBMITTED",
  "GITHUB_COMMIT",
  "GITHUB_PULL_REQUEST",
  "GITHUB_ISSUE",
  "GITHUB_PUSH",
  "PROJECT_UPDATE",
  "PLATFORM_SYNC",
  "ACHIEVEMENT_UNLOCKED",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Heatmap range — "All Time" has no fixed day count. */
export type HeatmapRange = "30d" | "3m" | "6m" | "this-year" | "last-year" | "all";

export const HEATMAP_RANGES: { key: HeatmapRange; label: string; days: number | null }[] = [
  { key: "30d", label: "Last 30 Days", days: 30 },
  { key: "3m", label: "Last 3 Months", days: 90 },
  { key: "6m", label: "Last 6 Months", days: 182 },
  { key: "this-year", label: "This Year", days: null },
  { key: "last-year", label: "Last Year", days: null },
  { key: "all", label: "All Time", days: null },
];

/** Range for the problems-solved graph. */
export type ProblemsRange = "7d" | "30d" | "3m" | "6m" | "1y" | "all";

export const PROBLEMS_RANGES: { key: ProblemsRange; label: string; days: number | null }[] = [
  { key: "7d", label: "7 Days", days: 7 },
  { key: "30d", label: "30 Days", days: 30 },
  { key: "3m", label: "3 Months", days: 90 },
  { key: "6m", label: "6 Months", days: 182 },
  { key: "1y", label: "1 Year", days: 365 },
  { key: "all", label: "All Time", days: null },
];

/** Bucket size for the activity / problems graphs. */
export type GraphGranularity = "daily" | "weekly" | "monthly";

export const GRANULARITIES: { key: GraphGranularity; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

/* --------------------------------- streak -------------------------------- */

export type StreakStats = {
  current: number;
  longest: number;
  activeDays: number;
  /** Coding days since Jan 1 — the "this year" figure. */
  activeDaysThisYear: number;
  totalActivities: number;
  totalProblems: number;
  /** True while nothing has been synced, so the UI shows an empty state. */
  isEmpty: boolean;
};

/* -------------------------------- platforms ------------------------------ */

export type PlatformComparisonRow = {
  platform: PlatformKey;
  label: string;
  solved: number;
};

/* ------------------------------- github ---------------------------------- */

export type GitHubLanguage = { name: string; count: number };

export type GitHubOverview = {
  username: string;
  profileUrl: string | null;
  repositories: number | null;
  followers: number | null;
  following: number | null;
  contributions: number | null;
  commits: number | null;
  pullRequests: number | null;
  issues: number | null;
  stars: number | null;
  languages: GitHubLanguage[];
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
};

/* ---------------------------- monthly / yearly --------------------------- */

export type MonthComparison = {
  problemsSolved: number;
  activeDays: number;
  activities: number;
  currentStreak: number;
  /** Null when the previous month has no data to compare against. */
  problemsChangePercent: number | null;
};

export type MonthlyProgress = {
  label: string;
  monthKey: string;
  problemsSolved: number;
  activeDays: number;
  activities: number;
  currentStreak: number;
  previous: {
    label: string;
    problemsSolved: number;
    activeDays: number;
    activities: number;
  } | null;
  problemsChangePercent: number | null;
  hasData: boolean;
};

export type YearlyOverview = {
  year: number;
  problemsSolved: number;
  activeDays: number;
  longestStreak: number;
  activities: number;
  mostActiveMonth: { label: string; activities: number } | null;
  mostSolvedTopic: { topic: string; solved: number } | null;
  mostUsedPlatform: { platform: PlatformKey; label: string; solved: number } | null;
  hasData: boolean;
};

export type PersonalBests = {
  longestStreak: number;
  mostProblemsInADay: { day: string; problems: number } | null;
  mostProblemsInAMonth: { label: string; problems: number } | null;
  mostActiveMonth: { label: string; activities: number } | null;
  mostActiveWeek: { start: string; end: string; activities: number } | null;
  hasData: boolean;
};

/* ------------------------------ achievements ----------------------------- */

export type LockedAchievement = {
  code: string;
  title: string;
  description: string;
  icon: string;
  tier: string;
  /** Real progress toward the threshold, e.g. 43 of 100 problems. */
  progress: number;
  threshold: number;
  metric: string;
};

export type AchievementSummary = {
  unlocked: AchievementRow[];
  locked: LockedAchievement[];
  unlockedCount: number;
  totalCount: number;
};

/* ------------------------------- leaderboard ---------------------------- */

export type MonthlyLeaderboardRow = {
  rank: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  problemsSolved: number;
  activeDays: number;
  score: number;
  isCurrentUser: boolean;
};

export type ActivityEventRow = {
  id: string;
  kind:
    | "problem_solved"
    | "revision"
    | "github_sync"
    | "platform_sync"
    | "achievement"
    | "project"
    | "system";
  title: string;
  detail: string | null;
  href: string | null;
  occurredAt: string;
};

export type ProjectRow = {
  id: string;
  name: string;
  description: string;
  techStack: string[];
  imageUrl: string | null;
  githubUrl: string | null;
  liveUrl: string | null;
  isFeatured: boolean;
  source: "manual" | "github";
  createdAt: string;
};

export type AchievementRow = {
  code: string;
  title: string;
  description: string;
  icon: string;
  tier: string;
  unlockedAt: string;
};

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ProfileCompletionItem = {
  label: string;
  done: boolean;
};

export type DashboardPayload = {
  profile: DevoraUserProfile & {
    visibility: Visibility;
    createdAt: string;
  };
  plans: {
    onboardingCompleted: boolean;
    completionPercent: number;
    completionItems: ProfileCompletionItem[];
  };
  stats: DashboardStats;
  connectedPlatforms: ConnectedPlatform[];
  difficulty: DifficultyBreakdown;
  activity: ActivityPoint[];
  activityRange: ActivityRange;
  /** Full daily history — every range switch filters this locally. */
  daily: DailyActivity[];
  streak: StreakStats;
  platformComparison: PlatformComparisonRow[];
  github: GitHubOverview | null;
  monthly: MonthlyProgress;
  yearly: YearlyOverview;
  personalBests: PersonalBests;
  achievementsSummary: AchievementSummary;
  monthlyLeaderboard: MonthlyLeaderboardRow[];
  leaderboardAvailable: boolean;
  topics: TopicProgressRow[];
  events: ActivityEventRow[];
  projects: ProjectRow[];
  achievements: AchievementRow[];
  notifications: NotificationRow[];
  syncJobs: {
    platform: PlatformKey;
    status: string;
    error: string | null;
    queuedAt: string;
  }[];
};

export type ActivityRange = "7d" | "30d" | "3m" | "6m" | "1y";

export const ACTIVITY_RANGES: { key: ActivityRange; label: string; days: number }[] = [
  { key: "7d", label: "7 Days", days: 7 },
  { key: "30d", label: "30 Days", days: 30 },
  { key: "3m", label: "3 Months", days: 90 },
  { key: "6m", label: "6 Months", days: 182 },
  { key: "1y", label: "1 Year", days: 365 },
];

/** Canonical topic order for the progress panel. */
export const TOPIC_ORDER = [
  "Arrays",
  "Strings",
  "Linked List",
  "Stack",
  "Queue",
  "Trees",
  "Graphs",
  "Dynamic Programming",
  "Greedy",
  "Searching",
  "Sorting",
];

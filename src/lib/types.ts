/**
 * Devora domain types shared by the server and the client.
 * No runtime code here beyond a few constant maps, so this file is safe to
 * import from both sides of the boundary.
 */

import type { PlatformKey } from "@/lib/validation";

export type { PlatformKey };

/* ------------------------------- platforms ------------------------------- */

export type PlatformStatus = "connected" | "pending" | "error" | "disconnected";
export type SyncStatus = "idle" | "syncing" | "ok" | "failed";

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
  },
  {
    key: "gfg",
    label: "GeeksforGeeks",
    logo: "/platform-logos/gfg.png",
    handleLabel: "GFG username",
    handlePlaceholder: "your-handle",
    description: "Track your GeeksforGeeks solved count and coding score.",
    accent: "#5fae7a",
    metrics: ["solved", "score"],
    authType: "public",
    availabilityHint: "Public profile data only.",
  },
  {
    key: "codechef",
    label: "CodeChef",
    logo: "/platform-logos/codechef.png",
    handleLabel: "CodeChef username",
    handlePlaceholder: "your-handle",
    description: "Pull in your star rating and contest history.",
    accent: "#d9a441",
    metrics: ["solved", "rating", "contests"],
    authType: "public",
    availabilityHint: "Public profile data only.",
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
  },
  {
    key: "hackerrank",
    label: "HackerRank",
    logo: "/platform-logos/hackerrank.png",
    handleLabel: "HackerRank username",
    handlePlaceholder: "your-handle",
    description: "Display your badges and problem-solving achievements.",
    accent: "#5fae7a",
    metrics: ["badges", "solved"],
    authType: "public",
    availabilityHint: "Public profile data only.",
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

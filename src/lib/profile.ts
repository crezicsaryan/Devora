import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

/** One coding-platform entry. Which stat is populated depends on the platform:
 *  LeetCode/GfG → solved count, CodeChef/Codeforces → rating, HackerRank → badges. */
export type PlatformStat = {
  username: string;
  solved?: number;
  rating?: string;
  badges?: string;
  percentile: string;
  color: string;
};

export type PlatformKey = "leetcode" | "gfg" | "codechef" | "codeforces" | "hackerrank";

export type DevoraProfile = {
  name: string;
  handle: string;
  tagline: string;
  bio: string;
  location: string;
  education: string;
  role: string;
  quote: string;
  avatarUrl: string;
  socials: { github: string; linkedin: string; x: string; website: string };
  platforms: Record<PlatformKey, PlatformStat>;
  techStack: string[];
  featuredProject: { title: string; desc: string; tags: string[] };
  submissions: number;
  streak: number;
};

export const PLATFORM_META: {
  key: keyof DevoraProfile["platforms"];
  label: string;
  logo: string;
  field: { key: "solved" | "rating" | "badges"; label: string };
  percentKey: "solved" | "rating" | "badges";
}[] = [
  { key: "leetcode", label: "LeetCode", logo: "/platform-logos/leetcode.png", field: { key: "solved", label: "Solved" }, percentKey: "solved" },
  { key: "gfg", label: "GeeksforGeeks", logo: "/platform-logos/gfg.png", field: { key: "solved", label: "Solved" }, percentKey: "solved" },
  { key: "codechef", label: "CodeChef", logo: "/platform-logos/codechef.png", field: { key: "rating", label: "Rating" }, percentKey: "rating" },
  { key: "codeforces", label: "Codeforces", logo: "/platform-logos/codeforces.png", field: { key: "rating", label: "Max" }, percentKey: "rating" },
  { key: "hackerrank", label: "HackerRank", logo: "/platform-logos/hackerrank.png", field: { key: "badges", label: "Badges" }, percentKey: "badges" },
];

export const TECH_OPTIONS = [
  "React", "Next.js", "TypeScript", "Node.js", "Python", "Java", "C++", "MySQL",
  "PostgreSQL", "MongoDB", "Docker", "Tailwind", "Express", "Git",
];

export const DEMO_PROFILE: DevoraProfile = {
  name: "Aryan Singh",
  handle: "@aryansingh",
  tagline: "Building a better version of myself, one line of code at a time.",
  bio: "",
  location: "Bhopal, India",
  education: "B.Tech CSE (AI)",
  role: "Developer | Learner | Builder",
  quote: "Consistency Compounds.",
  avatarUrl: "",
  socials: { github: "github.com/aryansingh", linkedin: "in/aryansingh", x: "x.com/aryansingh", website: "aryansingh.dev" },
  platforms: {
    leetcode: { username: "aryansingh", solved: 650, percentile: "Top 12%", color: "#f2932c" },
    gfg: { username: "aryansingh", solved: 420, percentile: "Top 18%", color: "#5fae7a" },
    codechef: { username: "aryansingh", rating: "3★ 1542", percentile: "Top 20%", color: "#d9a441" },
    codeforces: { username: "aryansingh", rating: "Expert · 1623", percentile: "Top 15%", color: "#4a90d9" },
    hackerrank: { username: "aryansingh", badges: "5★", percentile: "Top 25%", color: "#5fae7a" },
  },
  techStack: ["React", "Node.js", "Express", "Python", "Java", "MySQL"],
  featuredProject: { title: "Devora", desc: "All your coding journey in one place.", tags: ["Next.js", "NestJS", "MySQL", "TypeScript"] },
  submissions: 450,
  streak: 12,
};

const EMPTY_PLATFORM = { username: "", solved: 0, rating: "", percentile: "", color: "#f2932c" };

export function emptyProfile(user: { name: string; email: string }): DevoraProfile {
  const base = user.name || user.email.split("@")[0];
  return {
    name: user.name || base,
    handle: `@${base.toLowerCase().replace(/[^a-z0-9_]/g, "")}`,
    tagline: "",
    bio: "",
    location: "",
    education: "",
    role: "Developer",
    quote: "",
    avatarUrl: "",
    socials: { github: "", linkedin: "", x: "", website: "" },
    platforms: {
      leetcode: { ...EMPTY_PLATFORM, color: "#f2932c" },
      gfg: { ...EMPTY_PLATFORM, color: "#5fae7a" },
      codechef: { ...EMPTY_PLATFORM, color: "#d9a441" },
      codeforces: { ...EMPTY_PLATFORM, color: "#4a90d9" },
      hackerrank: { ...EMPTY_PLATFORM, color: "#5fae7a" },
    },
    techStack: [],
    featuredProject: { title: "", desc: "", tags: [] },
    submissions: 0,
    streak: 0,
  };
}

export function mergeProfile(raw: unknown, fallback: DevoraProfile): DevoraProfile {
  const p = (raw ?? {}) as Partial<DevoraProfile>;
  return {
    ...fallback,
    ...p,
    socials: { ...fallback.socials, ...(p.socials ?? {}) },
    platforms: {
      leetcode: { ...fallback.platforms.leetcode, ...(p.platforms?.leetcode ?? {}) },
      gfg: { ...fallback.platforms.gfg, ...(p.platforms?.gfg ?? {}) },
      codechef: { ...fallback.platforms.codechef, ...(p.platforms?.codechef ?? {}) },
      codeforces: { ...fallback.platforms.codeforces, ...(p.platforms?.codeforces ?? {}) },
      hackerrank: { ...fallback.platforms.hackerrank, ...(p.platforms?.hackerrank ?? {}) },
    },
    techStack: p.techStack ?? fallback.techStack,
    featuredProject: p.featuredProject ?? fallback.featuredProject,
  };
}

/** Load the signed-in user + their profile row from Supabase.
 *  Falls back to demo data when Supabase isn't configured or the table doesn't exist yet. */
export async function loadProfile(): Promise<{
  user: { name: string; email: string; avatarUrl: string } | null;
  profile: DevoraProfile;
  usingDemo: boolean;
}> {
  if (!hasSupabaseEnv()) {
    return { user: null, profile: DEMO_PROFILE, usingDemo: true };
  }
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const fbUser = {
      name: user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Developer",
      email: user?.email ?? "you@example.com",
      avatarUrl: (user?.user_metadata?.avatar_url as string) || "",
    };
    if (!user) return { user: null, profile: DEMO_PROFILE, usingDemo: true };

    const { data, error } = await supabase
      .from("devora_profiles")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      return { user: fbUser, profile: emptyProfile(fbUser), usingDemo: false };
    }
    return { user: fbUser, profile: mergeProfile(data.data, emptyProfile(fbUser)), usingDemo: false };
  } catch {
    return { user: null, profile: DEMO_PROFILE, usingDemo: true };
  }
}

export async function saveProfile(profile: DevoraProfile): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase not configured" };
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in" };
    const { error } = await supabase.from("devora_profiles").upsert({
      user_id: user.id,
      data: profile,
      updated_at: new Date().toISOString(),
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

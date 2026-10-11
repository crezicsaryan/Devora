/**
 * The public profile projection.
 *
 * On Postgres this was the `devora_public_profile(text)` SQL function, marked
 * `security definer` so it could read rows the caller could not. MySQL has no
 * such function (and no RLS), and the schema's translation notes call for it to
 * be reimplemented in TypeScript — which is what this module is.
 *
 * The rule is unchanged and deliberately restrictive: a field is included ONLY
 * when the owner's `visibility` map says so, and only for profiles that
 * finished onboarding. Everything else is simply absent from the payload, so a
 * caller cannot leak data by asking for the wrong key.
 */

import { prisma } from "@/lib/db/prisma";
import { DEFAULT_VISIBILITY, type PlatformKey } from "@/lib/types";
import type { PublicProfileData } from "@/components/public/PublicProfile";
import { normalizeUsername } from "@/lib/validation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve one public profile by handle.
 * Returns null when there is no completed profile for that handle — the callers
 * turn that into a 404 / empty state.
 */
export async function loadPublicProfile(
  rawUsername: string
): Promise<PublicProfileData | null> {
  const handle = normalizeUsername(decodeURIComponent(rawUsername));
  if (!handle) return null;

  const profile = await prisma.profile.findFirst({
    where: { username_normalized: handle, onboarding_completed: true },
  });
  if (!profile) return null;

  // A missing visibility map falls back to the same defaults the app writes,
  // exactly as `coalesce(visibility, '{}')` plus the app's own merge did.
  const stored = isRecord(profile.visibility) ? profile.visibility : {};
  const visible = (key: keyof typeof DEFAULT_VISIBILITY) =>
    (stored[key] ?? DEFAULT_VISIBILITY[key]) === true;

  const out: PublicProfileData = {
    username: profile.display_username ?? handle,
    displayName: profile.display_name,
  };
  if (profile.developer_role) out.developerRole = profile.developer_role;

  if (visible("bio") && profile.bio) out.bio = profile.bio;
  if (visible("location") && profile.location) out.location = profile.location;
  if (visible("email") && profile.email) out.email = profile.email;

  if (visible("socials")) {
    const socials: Record<string, string> = {};
    if (profile.portfolio_url) socials.github = profile.portfolio_url;
    if (profile.linkedin_url) socials.linkedin = profile.linkedin_url;
    if (profile.twitter_url) socials.x = profile.twitter_url;
    if (profile.website) socials.website = profile.website;
    if (Object.keys(socials).length > 0) out.socials = socials;
  }

  if (visible("skills")) {
    const rows = await prisma.userSkill.findMany({
      where: { user_id: profile.user_id },
      include: { skill: true },
      orderBy: [{ position: "asc" }, { skill: { name: "asc" } }],
    });
    out.skills = rows.map((r) => r.custom_name || r.skill.name);
  }

  if (visible("platforms")) {
    const accounts = await prisma.platformAccount.findMany({
      where: { user_id: profile.user_id, connection_status: "connected" },
      include: { coding_stats: true },
      orderBy: { connected_at: "asc" },
    });
    out.platforms = accounts.map((account) => {
      const stats = account.coding_stats[0];
      // jsonb_strip_nulls(): keep only the numbers the platform really reported.
      const raw: Record<string, number | string | null> = {
        solvedTotal: stats?.solved_total ?? null,
        solvedEasy: stats?.solved_easy ?? null,
        solvedMedium: stats?.solved_medium ?? null,
        solvedHard: stats?.solved_hard ?? null,
        rating: stats?.rating ?? null,
        rank: stats?.rank_label ?? null,
        contributions: stats?.contributions ?? null,
        publicRepos: stats?.public_repos ?? null,
        contests: stats?.contests ?? null,
        badges: stats?.badges ?? null,
      };
      const compact: Record<string, number | string> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (value !== null) compact[key] = value;
      }
      return {
        platform: account.platform as PlatformKey,
        username: account.username,
        url: account.profile_url,
        stats: Object.keys(compact).length > 0 ? compact : null,
      };
    });
  }

  if (visible("projects")) {
    const projects = await prisma.project.findMany({
      where: { user_id: profile.user_id },
      orderBy: { created_at: "desc" },
    });
    out.projects = projects.map((p) => ({
      name: p.name,
      description: p.description || null,
      techStack: Array.isArray(p.tech_stack)
        ? (p.tech_stack as string[])
        : null,
      githubUrl: p.github_url,
      liveUrl: p.live_url,
      imageUrl: p.image_url,
    }));
  }

  return out;
}

/**
 * GET  /api/profile/create — the current draft, so a refresh preserves work.
 * POST /api/profile/create — validate, save everything, mark complete.
 *
 * This is the single write path for the /profile/create page. One request means
 * the save is all-or-nothing from the user's point of view: if anything fails
 * they get the real error, keep their input, and can retry — we never redirect
 * on a partial save.
 *
 * What it deliberately does NOT do:
 *   - It never writes statistics. Providing a profile URL stores a link only,
 *     with `connection_status = 'linked'`. Nothing is presented as connected
 *     unless a real sync produced it.
 *   - It never accepts `onboarding_completed` from the client. `markProfileComplete`
 *     re-checks the required fields in SQL.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  claimUsername,
  clearPlatformLink,
  computeProfileCompletion,
  ensureProfile,
  getPlatformLinks,
  getProfile,
  getSkills,
  markProfileComplete,
  releaseUsername,
  setPlatformLink,
  setSkills,
  updateProfile,
} from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import { LINK_SPECS, parseProfileLink } from "@/lib/profile-links";
import {
  DEVELOPER_ROLES,
  MAX_BIO,
  MAX_COLLEGE,
  MAX_DISPLAY_NAME,
  MAX_LOCATION,
  MAX_SKILLS,
  USERNAME_MAX,
  USERNAME_MIN,
  firstIssue,
  normalizeUsername,
  sanitizeMultiline,
  sanitizeText,
  validateAvatar,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

/* ------------------------------- schema -------------------------------- */

const linkShape = z.string().optional().default("");

const createSchema = z.object({
  displayName: z
    .string()
    .transform((v) => sanitizeText(v, MAX_DISPLAY_NAME))
    .refine((v) => v.length >= 1, "Display name is required."),
  username: z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .refine(
      (v) => /^[a-z0-9_-]*$/.test(v),
      "Usernames can only contain letters, numbers, underscores and hyphens — no spaces."
    )
    .refine((v) => v.length >= USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters.`)
    .refine((v) => v.length <= USERNAME_MAX, `Username must be ${USERNAME_MAX} characters or fewer.`),
  // REQUIRED: no dashboard access without a college (spec §3/§12).
  college: z
    .string()
    .transform((v) => sanitizeText(v, MAX_COLLEGE))
    .refine((v) => v.length >= 1, "College is required."),
  bio: z
    .string()
    .optional()
    .transform((v) => sanitizeMultiline(v ?? "", MAX_BIO)),
  developerRole: z
    .string()
    .optional()
    .transform((v) => sanitizeText(v ?? "", 60))
    .refine(
      (v) => v === "" || (DEVELOPER_ROLES as readonly string[]).includes(v),
      "Pick a role from the list."
    ),
  location: z
    .string()
    .optional()
    .transform((v) => sanitizeText(v ?? "", MAX_LOCATION)),
  avatarUrl: z.string().optional().nullable(),
  skills: z
    .array(z.string())
    .max(MAX_SKILLS, `Select at most ${MAX_SKILLS} skills.`)
    .optional()
    .default([])
    .transform((list) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const entry of list) {
        const name = sanitizeText(entry, 40);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue; // duplicates are dropped, never stored
        seen.add(key);
        out.push(name);
      }
      return out;
    }),
  // The eight link fields, all optional.
  github: linkShape,
  linkedin: linkShape,
  leetcode: linkShape,
  gfg: linkShape,
  codechef: linkShape,
  codeforces: linkShape,
  hackerrank: linkShape,
  portfolio: linkShape,
});

/* --------------------------------- GET --------------------------------- */

export async function GET() {
  try {
    const user = await requireProfileUser();
    await ensureProfile(user.id, user.email, user.name);

    const [profile, skills, links, completion] = await Promise.all([
      getProfile(user.id),
      getSkills(user.id),
      getPlatformLinks(user.id),
      computeProfileCompletion(user.id),
    ]);

    return okResponse({
      profile: {
        displayName: profile?.display_name ?? "",
        username: profile?.display_username ?? "",
        college: profile?.college ?? "",
        bio: profile?.bio ?? "",
        developerRole: profile?.developer_role ?? "",
        location: profile?.location ?? "",
        avatarUrl: profile?.avatar_url ?? "",
        email: profile?.email ?? user.email ?? "",
      },
      skills,
      links: links.map((l) => ({
        platform: l.platform,
        username: l.username,
        profileUrl: l.profileUrl,
        // The UI needs to tell a real connection from a bare link.
        connectionStatus: l.connectionStatus,
        connected: l.connectionStatus === "connected",
      })),
      socials: {
        linkedin: profile?.linkedin_url ?? "",
        portfolio: profile?.portfolio_url ?? "",
      },
      onboardingCompleted: profile?.onboarding_completed ?? false,
      completion: { percent: completion.percent, items: completion.items },
    });
  } catch (error) {
    return errorResponse(error, "Could not load your profile.");
  }
}

/* --------------------------------- POST -------------------------------- */

export async function POST(request: NextRequest) {
  try {
    const user = await requireProfileUser();

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const message = firstIssue(parsed.error);
      return errorResponse(new Error(message), message);
    }
    const data = parsed.data;

    // REQUIRED: at least one skill (spec §3/§12). markProfileComplete re-checks
    // this in SQL — this early return just gives a friendlier message.
    if (data.skills.length === 0) {
      const message = "Add at least one skill to continue.";
      return errorResponse(new Error(message), message);
    }

    // Validate every link BEFORE writing anything, so the user gets all the
    // problems at once instead of a partial save.
    for (const spec of LINK_SPECS) {
      const raw = data[spec.key];
      if (!raw) continue;
      const check = parseProfileLink(spec.key, raw);
      if (check.error) {
        return errorResponse(new Error(check.error), check.error);
      }
    }

    const avatar = validateAvatar(data.avatarUrl);
    if (avatar.error) {
      return errorResponse(new Error(avatar.error), avatar.error);
    }

    const desired = normalizeUsername(data.username);
    const current = await getProfile(user.id);
    const previous = current?.username_normalized ?? null;

    // ---- username: the claim owns display_username + the registry row ----
    if (desired !== previous) {
      // Drop any stale claim first — the registry is keyed by user, so leaving
      // an old row behind would reserve a handle the user no longer wants.
      if (previous) await releaseUsername(user.id);

      const claim = await claimUsername(user.id, desired);
      if (!claim.ok) {
        // Put the previous handle back so a failed attempt is not destructive.
        if (previous) await claimUsername(user.id, previous).catch(() => undefined);
        return errorResponse(new Error(claim.error), claim.error);
      }
    }

    // ---- everything else ----
    await updateProfile(user.id, {
      displayName: data.displayName,
      college: data.college,
      bio: data.bio,
      developerRole: data.developerRole,
      location: data.location,
      avatarUrl: avatar.value ?? "",
    });

    await setSkills(user.id, data.skills);

    for (const spec of LINK_SPECS) {
      const raw = data[spec.key];

      if (spec.storage.kind === "profile") {
        // LinkedIn and Portfolio live on the profile row.
        await updateProfile(user.id, {
          socials: spec.key === "linkedin" ? { linkedin: raw } : { portfolio: raw },
        });
        continue;
      }

      const platform = spec.storage.platform;

      if (!raw) {
        // Field cleared — remove only a bare link, never a real connection.
        await clearPlatformLink(user.id, platform);
        continue;
      }

      const link = parseProfileLink(spec.key, raw);
      if (!link.url) continue;

      await setPlatformLink({
        userId: user.id,
        platform,
        username: link.username ?? desired,
        profileUrl: link.url,
        authType: platform === "github" ? "oauth" : "public",
      });
    }

    // ---- only now flip the completion flag (re-checked in SQL) ----
    const complete = await markProfileComplete(user.id);
    if (!complete) {
      const message =
        "Your name, username, college and at least one skill are required to finish.";
      return errorResponse(new Error(message), message);
    }

    const completion = await computeProfileCompletion(user.id);

    return okResponse({
      ok: true,
      username: desired,
      completion,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    return errorResponse(
      error,
      "Could not save your profile. Your changes are still here — try again."
    );
  }
}

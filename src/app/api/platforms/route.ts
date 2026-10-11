/**
 * GET  /api/platforms            — connection state for every platform
 * POST /api/platforms            — verify + connect, or save a profile link
 *
 * Two clearly separated outcomes, because they are genuinely different things:
 *
 *   A. Verified integration — the platform itself confirmed the account, so the
 *      row is stored as `connected` and statistics may be synced.
 *   B. Profile link — we could not verify (or the platform has no public
 *      statistics source at all), so the row is stored as `linked` and is never
 *      presented as a synchronized account.
 *
 * The browser never calls an external platform. This route resolves the input
 * through the platform's adapter and only stores what the adapter confirms.
 */

import type { NextRequest } from "next/server";
import {
  computeProfileCompletion,
  evaluateAchievements,
  getConnectedPlatforms,
  getProfile,
  setPlatformLink,
  updateProfile,
  upsertPlatformAccount,
} from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import { getAdapter } from "@/lib/platforms/registry";
import { githubOAuthConfigured } from "@/lib/platforms/adapters/github";
import { PlatformError } from "@/lib/platforms/types";
import { parseProfileLink, resolvePlatformInput } from "@/lib/profile-links";
import { PLATFORM_BY_KEY, type PlatformVerifyResult } from "@/lib/types";
import {
  firstIssue,
  platformLinkSchema,
  type PlatformKey,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

const LINK_ONLY_TARGETS = new Set(["linkedin", "portfolio"]);

export async function GET() {
  try {
    const user = await requireProfileUser();
    const [platforms, profile] = await Promise.all([
      getConnectedPlatforms(user.id),
      getProfile(user.id),
    ]);
    return okResponse({
      profileLinks: {
        linkedin: profile?.linkedin_url ?? "",
        portfolio: profile?.portfolio_url ?? "",
      },
      platforms: platforms.map((p) => ({
        platform: p.account.platform,
        username: p.account.username,
        status: p.account.connectionStatus,
        syncStatus: p.account.syncStatus,
        syncError: p.account.syncError,
        lastSyncedAt: p.account.lastSyncedAt,
        profileUrl: p.account.profileUrl,
      })),
    });
  } catch (error) {
    return errorResponse(error, "Could not load connected platforms.");
  }
}

/**
 * Save a link-only target (LinkedIn, personal website).
 * These live on the profile row and are never claimed as synchronized data.
 */
async function saveProfileLink(
  userId: string,
  target: "linkedin" | "portfolio",
  input: string
) {
  const parsed = parseProfileLink(target, input);
  if (parsed.error || !parsed.url) {
    const message = parsed.error ?? "That profile link is not valid.";
    return errorResponse(new Error(message), message);
  }

  await updateProfile(
    userId,
    target === "linkedin"
      ? { socials: { linkedin: parsed.url } }
      : { socials: { portfolio: parsed.url } }
  );

  const completion = await computeProfileCompletion(userId);
  return okResponse({
    ok: true,
    platform: target,
    username: parsed.username,
    profileUrl: parsed.url,
    connectionStatus: "linked",
    verification: "VERIFICATION_UNAVAILABLE",
    message:
      target === "linkedin"
        ? "LinkedIn link saved. Devora never imports LinkedIn activity without an authorized integration."
        : "Portfolio link saved.",
    completion,
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const body = (await request.json()) as Record<string, unknown>;

    // `input` is the current field; `username` is accepted so older callers
    // (the onboarding step) keep working unchanged.
    const parsed = platformLinkSchema.safeParse({
      platform: body.platform,
      input: body.input ?? body.username,
    });
    if (!parsed.success) {
      const message = firstIssue(parsed.error);
      return errorResponse(new Error(message), message);
    }
    const { platform } = parsed.data;

    if (!LINK_ONLY_TARGETS.has(platform)) {
      // Validated against the platform enum above.
      const platformKey = platform as PlatformKey;
      return connectCodingPlatform(user.id, platformKey, parsed.data.input);
    }

    return saveProfileLink(user.id, platform as "linkedin" | "portfolio", parsed.data.input);
  } catch (error) {
    if (error instanceof PlatformError) {
      return errorResponse(new Error(error.message), error.message);
    }
    return errorResponse(error, "Could not save that platform.");
  }
}

async function connectCodingPlatform(
  userId: string,
  platform: PlatformKey,
  input: string
) {
  const meta = PLATFORM_BY_KEY[platform];
  const adapter = getAdapter(platform);

  const resolved = resolvePlatformInput(platform, input);
  if (resolved.error || !resolved.username) {
    const message = resolved.error ?? "Enter your username or your profile URL.";
    return errorResponse(new Error(message), message);
  }
  const profileUrl = resolved.url || null;

  /** Store the link and report exactly what we could not do. */
  const keepLink = async (verdict: PlatformVerifyResult) => {
    await setPlatformLink({
      userId,
      platform,
      username: resolved.username!,
      profileUrl: profileUrl ?? "",
      authType: adapter.authType,
    });
    const completion = await computeProfileCompletion(userId);
    return okResponse({
      ok: true,
      platform,
      username: resolved.username,
      profileUrl,
      connectionStatus: "linked",
      verification: verdict.outcome,
      message: verdict.message,
      completion,
    });
  };

  // Platforms with no public statistics source can only ever be links. Asking
  // them to "verify" would just produce a failure the user cannot act on.
  if (meta.linkOnly) {
    return keepLink(await adapter.verify(resolved.username));
  }

  const verdict = await adapter.verify(resolved.username);

  // The platform answered, and said this account does not exist. This is the
  // ONLY case that is about the user's input.
  if (verdict.outcome === "INVALID_PROFILE") {
    return errorResponse(new Error(verdict.message), verdict.message);
  }

  if (!verdict.exists) {
    // UNAVAILABLE / RATE_LIMITED / NETWORK / CONFIGURATION — none of these say
    // anything about the handle, so the link is kept and the reason reported.
    return keepLink(verdict);
  }

  // GitHub verified the handle publicly, but its data needs the authorized
  // flow, which is the callback route's job — not this one.
  if (adapter.authType === "oauth") {
    return keepLink({
      ...verdict,
      outcome: githubOAuthConfigured() ? "VERIFICATION_UNAVAILABLE" : "CONFIGURATION_ERROR",
      message: githubOAuthConfigured()
        ? `@${verdict.username} exists on GitHub. Use “Connect with GitHub” to authorize Devora and import your repositories and contributions.`
        : "GitHub authorization is required. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to devora/.env to enable it — your profile link is saved meanwhile.",
    });
  }

  // Verified: store a real connection.
  const identity = await adapter.connect({
    userId,
    username: verdict.username ?? resolved.username,
  });
  if (!identity) {
    return keepLink({
      ...verdict,
      outcome: "VERIFICATION_UNAVAILABLE",
      message:
        "That profile exists, but the platform did not return its details. Saved as an unverified link.",
    });
  }

  await upsertPlatformAccount({
    userId,
    platform,
    username: identity.username,
    externalUserId: identity.externalUserId,
    profileUrl: identity.profileUrl ?? profileUrl,
    avatarUrl: identity.avatarUrl,
    authType: adapter.authType,
    connectionStatus: "connected",
  });

  const completion = await computeProfileCompletion(userId);
  await evaluateAchievements(userId).catch(() => undefined);

  return okResponse({
    ok: true,
    platform,
    username: identity.username,
    profileUrl: identity.profileUrl ?? profileUrl,
    connectionStatus: "connected",
    verification: "VERIFIED",
    message: `Connected @${identity.username} — verified against ${meta.label}.`,
    completion,
  });
}

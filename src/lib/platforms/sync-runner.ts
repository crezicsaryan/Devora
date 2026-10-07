/**
 * Sync runner — the single place external data enters the database.
 *
 * Flow (PRD sections 5–7, 10):
 *   adapter.sync() -> normalize -> store stats -> store daily activity
 *   -> seed projects (GitHub) -> record activity events -> recompute
 *   aggregates -> evaluate achievements
 *
 * Failure policy (PRD section 10): a platform sync failing must never fail
 * onboarding. The error is persisted on the account row and mirrored onto the
 * dashboard as "Sync failed — Retry"; everything else continues.
 */

import "server-only";
import { getAdapter } from "@/lib/platforms/registry";
import { PlatformError, type AdapterRepository } from "@/lib/platforms/types";
import type { PlatformKey } from "@/lib/validation";
import {
  claimNextSyncJob,
  enqueueSyncJob,
  evaluateAchievements,
  finishSyncJob,
  getPlatformAccount,
  getProfile,
  getProjects,
  recomputeAggregates,
  recordActivityEvent,
  replaceDailyActivity,
  setSyncState,
  upsertCodingStats,
  upsertPlatformAccount,
} from "@/lib/db/repository";
import { query as rawQuery, queryOne } from "@/lib/db/pool";

/** Read the OAuth token for an account. Server-only; never returned to a client. */
async function loadAccessToken(
  userId: string,
  platform: PlatformKey
): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const row = await queryOne<{ access_token: string; refresh_token: string | null }>(
    `select access_token, refresh_token
       from public.platform_oauth_tokens
      where user_id = $1 and platform = $2`,
    [userId, platform]
  );
  return {
    accessToken: row?.access_token ?? null,
    refreshToken: row?.refresh_token ?? null,
  };
}

export type SyncOutcome =
  | { platform: PlatformKey; ok: true; stats: Record<string, number | null> }
  | { platform: PlatformKey; ok: false; error: string; reason: string };

/**
 * Run one platform sync end to end.
 * Never throws — always resolves with an outcome so a caller looping over
 * platforms can continue past a failure.
 */
export async function runPlatformSync(
  userId: string,
  platform: PlatformKey
): Promise<SyncOutcome> {
  const started = Date.now();
  const adapter = getAdapter(platform);

  const account = await getPlatformAccount(userId, platform);
  if (!account || account.connection_status === "disconnected") {
    return {
      platform,
      ok: false,
      error: "Platform is not connected.",
      reason: "not_connected",
    };
  }

  await setSyncState(userId, platform, "syncing");

  try {
    const { accessToken, refreshToken } = await loadAccessToken(userId, platform);

    if (adapter.authType === "oauth" && !accessToken) {
      throw new PlatformError(
        "auth_required",
        "This platform needs to be reconnected.",
        true
      );
    }

    const result = await adapter.sync({
      userId,
      username: account.username,
      accessToken,
      refreshToken,
    });

    // Additive normalization: store the shared shape, keep the raw payload.
    const accountId = await upsertPlatformAccount({
      userId,
      platform,
      username: result.identity.username,
      externalUserId: result.identity.externalUserId,
      profileUrl: result.identity.profileUrl,
      avatarUrl: result.identity.avatarUrl,
      authType: adapter.authType,
    });

    await upsertCodingStats(userId, accountId, platform, result.stats);

    if (result.activity && result.activity.days.length > 0) {
      await replaceDailyActivity(
        userId,
        platform,
        result.activity.days.map((d) => ({
          day: d.day,
          count: d.count,
          difficulty: d.difficulty,
        }))
      );

      // Derived streak fields are recomputed from the stored series so the
      // dashboard never depends on an adapter getting streak maths right.
      await rawQuery(
        `update public.coding_stats
            set streak_current = coalesce($3, streak_current),
                streak_longest = coalesce($4, streak_longest)
          where user_id = $1 and platform = $2`,
        [
          userId,
          platform,
          result.activity.currentStreak,
          result.activity.longestStreak,
        ]
      );
    }

    // GitHub repositories seed the Projects panel using real repo metadata.
    if (platform === "github" && accessToken) {
      const { githubAdapter } = await import("@/lib/platforms/adapters/github");
      const repos: AdapterRepository[] =
        (await githubAdapter.fetchRepositories?.(result.identity.username, {
          userId,
          username: result.identity.username,
          accessToken,
        })) ?? [];
      if (repos.length > 0) {
        const existing = await getProjects(userId);
        const existingExternal = new Set(
          existing.filter((p) => p.source === "github").map((p) => p.name)
        );
        const top = repos
          .filter((r) => !r.fork && !r.archived)
          .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
          .slice(0, 12);

        for (const repo of top) {
          if (existingExternal.has(repo.name)) continue;
          const tech = [repo.language, ...(repo.topics ?? [])].filter(
            (t): t is string => Boolean(t)
          );
          await rawQuery(
            `insert into public.projects
               (user_id, name, description, tech_stack, github_url, live_url,
                is_featured, source, external_id)
             values ($1,$2,$3,$4,$5,$6,false,'github',$7)
             on conflict (user_id, source, external_id) where external_id is not null
             do update set
               description = excluded.description,
               tech_stack = excluded.tech_stack,
               github_url = excluded.github_url,
               live_url = excluded.live_url`,
            [
              userId,
              repo.name,
              repo.description ?? "",
              tech.slice(0, 12),
              repo.html_url,
              repo.homepage || null,
              String(repo.id),
            ]
          );
        }
      }
    }

    for (const event of result.events ?? []) {
      await recordActivityEvent({
        userId,
        kind: event.kind,
        title: event.title,
        detail: event.detail ?? null,
        href: event.href ?? null,
        occurredAt: event.occurredAt,
      });
    }

    await setSyncState(userId, platform, "ok", null);
    await recomputeAggregates(userId);
    await evaluateAchievements(userId);

    return {
      platform,
      ok: true,
      stats: {
        solvedTotal: result.stats.solvedTotal,
        rating: result.stats.rating,
        contributions: result.stats.contributions,
      },
    };
  } catch (error) {
    const reason = error instanceof PlatformError ? error.reason : "unknown";
    const message =
      error instanceof PlatformError
        ? error.message
        : "Unexpected error while syncing. Try again.";

    await setSyncState(userId, platform, "failed", message);
    await recomputeAggregates(userId).catch(() => undefined);
    await recordActivityEvent({
      userId,
      kind: "system",
      title: `Sync failed for ${adapter.label}`,
      detail: message,
      href: "/dashboard/platforms",
    }).catch(() => undefined);

    return { platform, ok: false, error: message, reason };
  } finally {
    void (Date.now() - started);
  }
}

/**
 * Process a user's queued sync jobs.
 *
 * Designed to run inside `after()` so the HTTP response is not blocked by
 * external API latency. Failures are contained per platform.
 */
export async function processSyncQueue(
  userId: string,
  maxJobs = 6
): Promise<SyncOutcome[]> {
  const outcomes: SyncOutcome[] = [];
  for (let i = 0; i < maxJobs; i++) {
    const job = await claimNextSyncJob(userId);
    if (!job) break;
    const started = Date.now();
    const outcome = await runPlatformSync(userId, job.platform);
    await finishSyncJob(
      job.id,
      outcome.ok ? "succeeded" : "failed",
      outcome.ok ? null : outcome.error,
      Date.now() - started
    );
    outcomes.push(outcome);
  }
  return outcomes;
}

/** Queue a sync for every connected platform and process it. */
export async function queueAndProcessAll(
  userId: string
): Promise<SyncOutcome[]> {
  const accounts = await rawQuery<{ platform: PlatformKey }>(
    `select platform from public.platform_accounts
      where user_id = $1 and connection_status = 'connected'`,
    [userId]
  );

  for (const account of accounts) {
    const pending = await queryOne<{ id: string }>(
      `select id from public.sync_jobs
        where user_id = $1 and platform = $2 and status in ('queued','running')`,
      [userId, account.platform]
    );
    if (!pending) await enqueueSyncJob(userId, account.platform);
  }

  return processSyncQueue(userId, Math.max(accounts.length, 1) + 2);
}

/** Recompute aggregates without touching any external API. */
export async function refreshLocalAggregates(userId: string): Promise<void> {
  await recomputeAggregates(userId);
  await evaluateAchievements(userId);
}

export async function profileExists(userId: string): Promise<boolean> {
  return (await getProfile(userId)) !== null;
}

/**
 * GET /api/dashboard?range=30d
 *
 * Everything the dashboard renders, in one authenticated request.
 *
 * Every number comes from stored rows. Where a platform does not publish a
 * metric, the value is null and the UI renders "—". Nothing here is hardcoded,
 * and no external API is called at render time — the activity chart reads
 * normalized rows from activity_daily.
 */

import type { NextRequest } from "next/server";
import {
  computeProfileCompletion,
  deriveTopicProgressFromTracker,
  getAchievements,
  getActivityEvents,
  getActivitySeries,
  getConnectedPlatforms,
  getDifficultyBreakdown,
  getNotifications,
  getProfile,
  getProjects,
  getSkills,
  getSyncJobs,
  getTopicProgress,
} from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import {
  ACTIVITY_RANGES,
  DEFAULT_VISIBILITY,
  type ActivityRange,
  type DashboardPayload,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireProfileUser();

    const rangeParam = request.nextUrl.searchParams.get("range") as ActivityRange | null;
    const range: ActivityRange = ACTIVITY_RANGES.some((r) => r.key === rangeParam)
      ? (rangeParam as ActivityRange)
      : "30d";

    const [
      profile,
      skills,
      platforms,
      difficulty,
      activity,
      topicsExplicit,
      topicsDerived,
      events,
      projects,
      achievements,
      notifications,
      syncJobs,
      completion,
    ] = await Promise.all([
      getProfile(user.id),
      getSkills(user.id),
      getConnectedPlatforms(user.id),
      getDifficultyBreakdown(user.id),
      getActivitySeries(user.id, range),
      getTopicProgress(user.id),
      deriveTopicProgressFromTracker(user.id),
      getActivityEvents(user.id, 12),
      getProjects(user.id),
      getAchievements(user.id),
      getNotifications(user.id, 12),
      getSyncJobs(user.id, 12),
      computeProfileCompletion(user.id),
    ]);

    const payload: DashboardPayload = {
      profile: {
        displayName: profile?.display_name || user.name,
        username: profile?.display_username ?? "",
        bio: profile?.bio ?? "",
        developerRole: profile?.developer_role ?? "",
        location: profile?.location ?? "",
        avatarUrl: profile?.avatar_url ?? "",
        email: profile?.email ?? user.email ?? "",
        visibility: (profile?.visibility as DashboardPayload["profile"]["visibility"]) ??
          DEFAULT_VISIBILITY,
        createdAt: profile?.created_at ?? new Date().toISOString(),
      },
      plans: {
        onboardingCompleted: profile?.onboarding_completed ?? false,
        completionPercent: completion.percent,
        completionItems: completion.items,
      },
      stats: {
        // Real stored values. Null (rendered as "—") when nothing has synced.
        totalSolved:
          (profile?.total_solved ?? 0) > 0 || platforms.some((p) => p.stats?.solvedTotal != null)
            ? profile?.total_solved ?? 0
            : null,
        currentStreak:
          (profile?.current_streak ?? 0) > 0 ? profile?.current_streak ?? 0 : null,
        longestStreak:
          (profile?.longest_streak ?? 0) > 0 ? profile?.longest_streak ?? 0 : null,
        githubContributions:
          platforms.find((p) => p.account.platform === "github")?.stats?.contributions ?? null,
      },
      connectedPlatforms: platforms,
      difficulty,
      activity,
      activityRange: range,
      // Prefer rows the user's tracker produced; fall back to derived counts.
      topics: topicsExplicit.length > 0 ? topicsExplicit : topicsDerived,
      events,
      projects,
      achievements,
      notifications,
      syncJobs,
    };

    void skills;

    return okResponse(payload);
  } catch (error) {
    return errorResponse(error, "Could not load your dashboard.");
  }
}

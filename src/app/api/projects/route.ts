/**
 * Projects.
 *
 * GET    /api/projects   -> list (authenticated)
 * POST   /api/projects   -> create (authenticated)
 *
 * The Projects panel's "+ Add Project" button writes here; there is no
 * optimistic frontend-only path.
 */

import type { NextRequest } from "next/server";
import {
  computeProfileCompletion,
  evaluateAchievements,
  getProjects,
  recordActivityEvent,
  updateProfile,
} from "@/lib/db/repository";
import { prisma } from "@/lib/db/prisma";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import { firstIssue, projectSchema, validateUrl } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireProfileUser();
    return okResponse({ projects: await getProjects(user.id) });
  } catch (error) {
    return errorResponse(error, "Could not load your projects.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const body = (await request.json()) as unknown;

    const parsed = projectSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(new Error(firstIssue(parsed.error)), "Check the project details.");
    }
    const data = parsed.data;

    const github = validateUrl(data.githubUrl, {
      requiredHost: "github.com",
      label: "GitHub link",
    });
    if (github.error) return errorResponse(new Error(github.error), github.error);

    const live = validateUrl(data.liveUrl, { label: "Live demo link" });
    if (live.error) return errorResponse(new Error(live.error), live.error);

    const image = validateUrl(data.imageUrl, { label: "Project image" });
    if (image.error) return errorResponse(new Error(image.error), image.error);

    const inserted = await prisma.project.create({
      data: {
        user_id: user.id,
        name: data.name,
        description: data.description ?? "",
        tech_stack: data.techStack ?? [],
        github_url: github.url,
        live_url: live.url,
        image_url: image.url,
        source: "manual",
      },
      select: { id: true },
    });

    await recordActivityEvent({
      userId: user.id,
      kind: "project",
      title: `Added project “${data.name}”`,
      detail: (data.techStack ?? []).join(" · ") || null,
      href: github.url,
    });

    await updateProfile(user.id, {});
    await evaluateAchievements(user.id).catch(() => undefined);
    const completion = await computeProfileCompletion(user.id);

    return okResponse({ ok: true, id: inserted.id, completion });
  } catch (error) {
    return errorResponse(error, "Could not save that project.");
  }
}

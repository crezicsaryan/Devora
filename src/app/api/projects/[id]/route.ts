/**
 * PATCH /api/projects/[id] — edit a project the caller owns.
 * DELETE /api/projects/[id] — remove it.
 *
 * Ownership is enforced by `where user_id = $` on every statement. A user can
 * never touch another user's project, even with a valid id.
 */

import type { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import { computeProfileCompletion, getProjects } from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import type { RouteParams } from "@/lib/route-params";
import { firstIssue, projectSchema, validateUrl } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  ctx: RouteParams<{ id: string }>
) {
  try {
    const user = await requireProfileUser();
    const { id } = await ctx.params;
    const body = (await request.json()) as unknown;

    const parsed = projectSchema.partial().safeParse(body);
    if (!parsed.success) {
      return errorResponse(new Error(firstIssue(parsed.error)), "Check the project details.");
    }
    const data = parsed.data;

    let githubUrl: string | null | undefined;
    if (data.githubUrl !== undefined) {
      const v = validateUrl(data.githubUrl, { requiredHost: "github.com", label: "GitHub link" });
      if (v.error) return errorResponse(new Error(v.error), v.error);
      githubUrl = v.url;
    }
    let liveUrl: string | null | undefined;
    if (data.liveUrl !== undefined) {
      const v = validateUrl(data.liveUrl, { label: "Live demo link" });
      if (v.error) return errorResponse(new Error(v.error), v.error);
      liveUrl = v.url;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    const push = (col: string, value: unknown) => {
      sets.push(`${col} = $${i++}`);
      params.push(value);
    };

    if (data.name !== undefined) push("name", data.name);
    if (data.description !== undefined) push("description", data.description);
    if (data.techStack !== undefined) push("tech_stack", data.techStack);
    if (githubUrl !== undefined) push("github_url", githubUrl);
    if (liveUrl !== undefined) push("live_url", liveUrl);

    if (sets.length === 0) return okResponse({ ok: true, unchanged: true });

    params.push(id, user.id);
    const updated = await query(
      `update public.projects set ${sets.join(", ")}
        where id = $${i} and user_id = $${i + 1}
        returning id`,
      params
    );
    if (updated.length === 0) {
      return errorResponse(new Error("Project not found."), "We could not find that project.");
    }

    const completion = await computeProfileCompletion(user.id);
    return okResponse({ ok: true, completion });
  } catch (error) {
    return errorResponse(error, "Could not update that project.");
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteParams<{ id: string }>
) {
  try {
    const user = await requireProfileUser();
    const { id } = await ctx.params;

    const deleted = await queryOne<{ id: string }>(
      `delete from public.projects where id = $1 and user_id = $2 returning id`,
      [id, user.id]
    );
    if (!deleted) {
      return errorResponse(new Error("Project not found."), "We could not find that project.");
    }

    const [projects, completion] = await Promise.all([
      getProjects(user.id),
      computeProfileCompletion(user.id),
    ]);
    return okResponse({ ok: true, projects, completion });
  } catch (error) {
    return errorResponse(error, "Could not delete that project.");
  }
}

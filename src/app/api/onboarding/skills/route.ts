/**
 * PATCH /api/onboarding/skills — replace the user's skill set.
 * GET   /api/onboarding/skills — catalogue + current selection.
 *
 * Duplicates are dropped server-side, and custom skills become real catalogue
 * rows joined through user_skills, so the relation is genuine rather than a
 * JSON blob.
 */

import type { NextRequest } from "next/server";
import {
  computeProfileCompletion,
  getSkillCatalogue,
  getSkills,
  setSkills,
} from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";
import { firstIssue, skillsStepSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireProfileUser();
    const [catalogue, selected] = await Promise.all([
      getSkillCatalogue(),
      getSkills(user.id),
    ]);
    return okResponse({ catalogue, selected });
  } catch (error) {
    return errorResponse(error, "Could not load skills.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const body = (await request.json()) as unknown;

    const parsed = skillsStepSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(new Error(firstIssue(parsed.error)), "Check your skill selection.");
    }

    await setSkills(user.id, parsed.data.skills);
    const completion = await computeProfileCompletion(user.id);
    return okResponse({ ok: true, skills: parsed.data.skills, completion });
  } catch (error) {
    return errorResponse(error, "Could not save your skills.");
  }
}

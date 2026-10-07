/**
 * GET  /api/tracker?search=&status=  — list questions with the caller's status
 * POST /api/tracker                  — create a question and/or set a status
 *
 * This is the real backing for the Question Tracker. Progress written here
 * feeds topic progress and the dashboard's difficulty breakdown.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  getTrackerQuestions,
  setQuestionStatus,
  upsertQuestion,
} from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(2).max(180),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  topic: z.string().trim().max(60).optional().nullable(),
  url: z.string().trim().max(400).optional().nullable(),
  status: z.enum(["todo", "solved", "review"]).default("todo"),
  note: z.string().trim().max(500).optional().nullable(),
});

const statusSchema = z.object({
  questionId: z.string().uuid(),
  status: z.enum(["todo", "solved", "review"]),
  note: z.string().trim().max(500).optional().nullable(),
});

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || `q-${Date.now()}`
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const { searchParams } = request.nextUrl;

    const questions = await getTrackerQuestions(user.id, {
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      limit: Number(searchParams.get("limit")) || undefined,
    });

    const solved = questions.filter((q) => q.status === "solved").length;
    return okResponse({ questions, solved, total: questions.length });
  } catch (error) {
    return errorResponse(error, "Could not load your questions.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const body: unknown = await request.json();

    // Two shapes hit this endpoint: updating an existing question's status,
    // and adding a new question to the catalogue.
    const asStatus = statusSchema.safeParse(body);
    if (asStatus.success) {
      await setQuestionStatus(
        user.id,
        asStatus.data.questionId,
        asStatus.data.status,
        asStatus.data.note ?? null
      );
      return okResponse({ ok: true });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return errorResponse(
        new Error(first?.message ?? "Invalid question."),
        first?.message ?? "Invalid question."
      );
    }

    const questionId = await upsertQuestion({
      slug: slugify(parsed.data.title),
      title: parsed.data.title,
      difficulty: parsed.data.difficulty,
      topic: parsed.data.topic ?? null,
      url: parsed.data.url ?? null,
    });

    await setQuestionStatus(user.id, questionId, parsed.data.status, parsed.data.note ?? null);

    return okResponse({ ok: true, questionId });
  } catch (error) {
    return errorResponse(error, "Could not save that question.");
  }
}

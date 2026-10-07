/**
 * GET /api/sheets — coding sheets grouped from the shared question catalogue.
 *
 * A sheet's progress is derived from the caller's own tracker rows, so nothing
 * here is a fabricated statistic.
 */

import { getCodingSheets } from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireProfileUser();
    const sheets = await getCodingSheets(user.id);
    return okResponse({ sheets });
  } catch (error) {
    return errorResponse(error, "Could not load your coding sheets.");
  }
}

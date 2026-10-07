/**
 * GET   /api/notifications — the header bell
 * PATCH /api/notifications — mark all (or a subset) as read
 */

import type { NextRequest } from "next/server";
import { getNotifications, markNotificationsRead } from "@/lib/db/repository";
import { errorResponse, okResponse, requireProfileUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireProfileUser();
    const notifications = await getNotifications(user.id, 20);
    return okResponse({
      notifications,
      unread: notifications.filter((n) => !n.readAt).length,
    });
  } catch (error) {
    return errorResponse(error, "Could not load notifications.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireProfileUser();
    const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
    await markNotificationsRead(user.id, body.ids);
    return okResponse({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not update notifications.");
  }
}

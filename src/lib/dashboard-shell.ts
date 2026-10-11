/**
 * Shared loader for the signed-in dashboard pages.
 *
 * Every dashboard sub-page needs the same three things: the session user, the
 * profile row (for the shell's avatar/name), and a redirect for signed-out
 * visitors. Centralising it keeps the pages to a few lines each.
 */

import "server-only";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/db/repository";
import { hasDatabase } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/server-auth";

export type ShellUser = {
  displayName: string;
  username: string;
  avatarUrl: string;
};

export async function loadShellUser(next: string): Promise<ShellUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const profile = hasDatabase() ? await getProfile(user.id) : null;

  return {
    displayName: profile?.display_name || user.name || "Developer",
    username: profile?.display_username ?? "",
    avatarUrl: profile?.avatar_url ?? "",
  };
}

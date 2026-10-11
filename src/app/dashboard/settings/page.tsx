import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { getProfile } from "@/lib/db/repository";
import { hasDatabase } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings — Devora" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/settings");

  const profile = hasDatabase() ? await getProfile(user.id) : null;

  return (
    <DashboardShell
      active="settings"
      displayName={profile?.display_name || user.name || "Developer"}
      username={profile?.display_username ?? ""}
      avatarUrl={profile?.avatar_url ?? ""}
    >
      <SettingsPanel />
    </DashboardShell>
  );
}

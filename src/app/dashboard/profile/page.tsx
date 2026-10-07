import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ProfileEditor } from "@/components/dashboard/ProfileEditor";
import { getProfile } from "@/lib/db/repository";
import { hasDatabase } from "@/lib/db/pool";
import { getSessionUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My Profile — Devora" };

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard/profile");

  const profile = hasDatabase() ? await getProfile(user.id) : null;

  return (
    <DashboardShell
      active="profile"
      displayName={profile?.display_name || user.name || "Developer"}
      username={profile?.display_username ?? ""}
      avatarUrl={profile?.avatar_url ?? ""}
    >
      <ProfileEditor />
    </DashboardShell>
  );
}

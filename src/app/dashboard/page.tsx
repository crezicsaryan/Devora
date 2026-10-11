import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getProfile, isOnboardingComplete } from "@/lib/db/repository";
import { hasDatabase } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — Devora",
  description: "Your coding journey at a glance.",
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");

  // The database is the source of truth for profile state — never the client.
  // Incomplete profiles are sent to the profile creation page.
  if (hasDatabase()) {
    const done = await isOnboardingComplete(user.id);
    if (!done) redirect("/profile/create");
  }

  const profile = hasDatabase() ? await getProfile(user.id) : null;

  return (
    <DashboardShell
      active="dashboard"
      displayName={profile?.display_name || user.name || "Developer"}
      username={profile?.display_username ?? ""}
      avatarUrl={profile?.avatar_url ?? ""}
    >
      <DashboardView />
    </DashboardShell>
  );
}

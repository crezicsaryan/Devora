import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AchievementsView } from "@/components/dashboard/AchievementsView";
import { loadShellUser } from "@/lib/dashboard-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Achievements — Devora" };

export default async function AchievementsPage() {
  const user = await loadShellUser("/dashboard/achievements");
  return (
    <DashboardShell active="achievements" {...user}>
      <AchievementsView />
    </DashboardShell>
  );
}

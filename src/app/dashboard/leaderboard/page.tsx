import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { LeaderboardView } from "@/components/dashboard/LeaderboardView";
import { loadShellUser } from "@/lib/dashboard-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard — Devora" };

export default async function LeaderboardPage() {
  const user = await loadShellUser("/dashboard/leaderboard");
  return (
    <DashboardShell active="leaderboard" {...user}>
      <LeaderboardView />
    </DashboardShell>
  );
}

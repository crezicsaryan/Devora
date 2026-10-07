import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AnalyticsView } from "@/components/dashboard/AnalyticsView";
import { loadShellUser } from "@/lib/dashboard-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics — Devora" };

export default async function AnalyticsPage() {
  const user = await loadShellUser("/dashboard/analytics");
  return (
    <DashboardShell active="analytics" {...user}>
      <AnalyticsView />
    </DashboardShell>
  );
}

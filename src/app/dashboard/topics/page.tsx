import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TopicsView } from "@/components/dashboard/TopicsView";
import { loadShellUser } from "@/lib/dashboard-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Topics — Devora" };

export default async function TopicsPage() {
  const user = await loadShellUser("/dashboard/topics");
  return (
    <DashboardShell active="topics" {...user}>
      <TopicsView />
    </DashboardShell>
  );
}

import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TrackerView } from "@/components/dashboard/TrackerView";
import { loadShellUser } from "@/lib/dashboard-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Question Tracker — Devora" };

export default async function TrackerPage() {
  const user = await loadShellUser("/dashboard/tracker");
  return (
    <DashboardShell active="tracker" {...user}>
      <TrackerView />
    </DashboardShell>
  );
}

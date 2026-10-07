import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PlatformsManager } from "@/components/dashboard/PlatformsManager";
import { loadShellUser } from "@/lib/dashboard-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connected Platforms — Devora" };

export default async function PlatformsPage() {
  const user = await loadShellUser("/dashboard/platforms");
  return (
    <DashboardShell active="platforms" {...user}>
      <PlatformsManager />
    </DashboardShell>
  );
}

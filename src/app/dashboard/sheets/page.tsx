import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SheetsView } from "@/components/dashboard/SheetsView";
import { loadShellUser } from "@/lib/dashboard-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coding Sheets — Devora" };

export default async function SheetsPage() {
  const user = await loadShellUser("/dashboard/sheets");
  return (
    <DashboardShell active="sheets" {...user}>
      <SheetsView />
    </DashboardShell>
  );
}

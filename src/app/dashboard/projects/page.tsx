import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ProjectsManager } from "@/components/dashboard/ProjectsManager";
import { loadShellUser } from "@/lib/dashboard-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projects — Devora" };

export default async function ProjectsPage() {
  const user = await loadShellUser("/dashboard/projects");
  return (
    <DashboardShell active="projects" {...user}>
      <ProjectsManager />
    </DashboardShell>
  );
}

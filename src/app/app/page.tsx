import { redirect } from "next/navigation";

/**
 * Legacy `/app` route.
 *
 * This used to render an early prototype built on hardcoded demo data. The real
 * application lives at `/dashboard`, which reads every number from the
 * authenticated user's own rows. Rather than ship two dashboards — one of them
 * fake — this route now simply forwards to the real one.
 */
export default function LegacyAppPage() {
  redirect("/dashboard");
}

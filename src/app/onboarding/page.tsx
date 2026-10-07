import type { Metadata } from "next";
import { redirect } from "next/navigation";

/**
 * /onboarding is retired.
 *
 * Profile creation now lives at a single canonical route, /profile/create.
 * Keeping two different setup flows would mean two write paths and two places
 * for the redirect rules to drift, so this route simply forwards. Any existing
 * link, bookmark or in-flight redirect still works.
 */

export const metadata: Metadata = {
  title: "Create your Devora profile",
  description: "Build your developer identity in one place.",
};

export default function OnboardingPage() {
  redirect("/profile/create");
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile, isOnboardingComplete } from "@/lib/db/repository";
import { hasDatabase } from "@/lib/db/pool";
import { getSessionUser } from "@/lib/server-auth";
import { initialsOf } from "@/lib/avatar";
import { ProfileCreateForm } from "@/components/profile/ProfileCreateForm";
import { SignOutButton } from "@/components/profile/SignOutButton";
import { HomeButton } from "@/components/HomeButton";
import styles from "./profile-create.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create your Devora profile",
  description: "Build your developer identity in one place.",
};

export default async function ProfileCreatePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/profile/create");

  // The database is the only source of truth for completion. A user who already
  // finished is sent straight on — they must never see this page again.
  if (hasDatabase()) {
    const done = await isOnboardingComplete(user.id);
    if (done) redirect("/dashboard");
  }

  const profile = hasDatabase() ? await getProfile(user.id) : null;
  const displayName = profile?.display_name || user.name || "";

  return (
    <div className={styles.page}>
      {/* Same nav as the landing page — identical logo, spacing and treatment. */}
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand} aria-label="Devora — Code Track Build Grow">
            <Image
              src="/logo/devora-lockup-white.png"
              alt="Devora logo"
              width={152}
              height={44}
              priority
              className={styles.brandImg}
            />
          </Link>

          <div className={styles.navRight}>
            <HomeButton />
            <div className={styles.navUser}>
              <span className={styles.navAvatar}>
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  initialsOf(displayName || user.email || "Devora")
                )}
              </span>
              <span>{user.email}</span>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className={styles.wrap}>
        <div className={styles.head}>
          <div className={styles.kicker}>Step 1 of 1 · Profile setup</div>
          <h1 className={styles.title}>Create your Devora profile</h1>
          <p className={styles.subtitle}>Build your developer identity in one place.</p>
        </div>

        <ProfileCreateForm />
      </div>
    </div>
  );
}

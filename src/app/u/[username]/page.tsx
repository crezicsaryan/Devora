import type { Metadata } from "next";
import { queryOne } from "@/lib/db/pool";
import { hasDatabase } from "@/lib/db/pool";
import { normalizeUsername } from "@/lib/validation";
import { PublicProfile, type PublicProfileData } from "@/components/public/PublicProfile";
import { HomeButton } from "@/components/HomeButton";
import styles from "@/app/dashboard/dashboard.module.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const handle = normalizeUsername(decodeURIComponent(username)) ?? username;
  return {
    title: `@${handle} — Devora`,
    description: `${handle}'s developer profile on Devora.`,
  };
}

export default async function PublicProfilePage({ params }: Params) {
  const { username } = await params;
  const handle = normalizeUsername(decodeURIComponent(username));

  let profile: PublicProfileData | null = null;

  if (handle && hasDatabase()) {
    const row = await queryOne<{ devora_public_profile: PublicProfileData | null }>(
      `select public.devora_public_profile($1) as devora_public_profile`,
      [handle]
    );
    const value = row?.devora_public_profile;
    if (value && typeof value === "object" && Object.keys(value).length > 0) {
      profile = value;
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0b0d",
        color: "#ffffff",
        padding: "48px 20px",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* Flex header — the Home button is placed by the layout, not by a
            fixed offset, so it adapts to any viewport. */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 26,
          }}
        >
          <HomeButton />
        </header>

        {profile ? (
          <PublicProfile profile={profile} />
        ) : (
          <div className={styles.empty} style={{ marginTop: 26, background: "#111114" }}>
            <strong>That profile is not available.</strong>
            <span>
              We could not find a public Devora profile for{" "}
              {handle ? `@${handle}` : "that handle"}. It may not exist, or the owner has kept it
              private.
            </span>
          </div>
        )}
      </div>
    </main>
  );
}

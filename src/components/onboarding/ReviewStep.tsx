"use client";

/**
 * Step 5 — Review.
 *
 * A faithful preview of the public profile, built from exactly the data that
 * was saved. Edit Profile jumps back to step 1; nothing here is a static mock.
 */

import Image from "next/image";
import { initialsOf } from "@/lib/avatar";
import type { OnboardingDraft } from "@/components/onboarding/OnboardingFlow";
import styles from "@/app/onboarding/onboarding.module.css";

function hostOf(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}

function displayNameOf(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const map: Record<string, string> = {
    "linkedin.com": "LinkedIn",
    "github.com": "GitHub",
    "x.com": "X",
    "twitter.com": "X",
  };
  return map[hostOf(raw)] ?? "Portfolio";
}

export function ReviewStep({
  draft,
  onEdit,
}: {
  draft: OnboardingDraft;
  onEdit: (step: number) => void;
}) {
  const connected = draft.platforms.filter(
    (p) => p.account.connectionStatus === "connected"
  );

  const socialEntries = (
    [
      { key: "linkedin", value: draft.socials.linkedin },
      { key: "github", value: draft.socials.github },
      { key: "twitter", value: draft.socials.twitter },
      { key: "portfolio", value: draft.socials.portfolio },
    ] as const
  ).filter((entry) => entry.value.trim().length > 0);

  const displayName = draft.displayName.trim() || "Your name";
  const initials = initialsOf(displayName);

  return (
    <div className={styles.stepWrap}>
      <header className={styles.stepHead}>
        <h2 className={styles.stepTitle}>Your Devora profile is ready.</h2>
        <p className={styles.stepSub}>
          Here&apos;s how your profile will look to other developers.
        </p>
      </header>

      <div className={styles.reviewCard}>
        <div className={styles.reviewHead}>
          <div className={styles.reviewAvatar}>
            {draft.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.avatarUrl} alt="" className={styles.reviewAvatarImg} />
            ) : (
              <span className={styles.reviewAvatarFallback}>{initials}</span>
            )}
          </div>
          <div className={styles.reviewIdentity}>
            <h3 className={styles.reviewName}>{displayName}</h3>
            <div className={styles.reviewHandle}>
              {draft.username ? `@${draft.username}` : "@username"}
            </div>
            {draft.developerRole && (
              <div className={styles.reviewRole}>{draft.developerRole}</div>
            )}
            {draft.location && (
              <div className={styles.reviewLocation}>{draft.location}</div>
            )}
          </div>
          <button
            type="button"
            className={styles.reviewEditTop}
            onClick={() => onEdit(1)}
            aria-label="Edit profile"
          >
            Edit
          </button>
        </div>

        {draft.bio.trim() && <p className={styles.reviewBio}>{draft.bio}</p>}

        <section className={styles.reviewSection}>
          <h4 className={styles.reviewSectionTitle}>Skills</h4>
          <div className={styles.reviewChips}>
            {draft.skills.length === 0 ? (
              <span className={styles.reviewEmpty}>
                No skills selected yet.{" "}
                <button type="button" className={styles.inlineLink} onClick={() => onEdit(2)}>
                  Add skills
                </button>
              </span>
            ) : (
              <>
                {draft.skills.slice(0, 14).map((skill) => (
                  <span key={skill} className={styles.reviewChip}>
                    {skill}
                  </span>
                ))}
                {draft.skills.length > 14 && (
                  <span className={styles.reviewChipMore}>
                    +{draft.skills.length - 14} more
                  </span>
                )}
              </>
            )}
          </div>
        </section>

        <section className={styles.reviewSection}>
          <h4 className={styles.reviewSectionTitle}>Coding platforms</h4>
          <div className={styles.reviewChips}>
            {connected.length === 0 ? (
              <span className={styles.reviewEmpty}>
                No platforms connected.{" "}
                <button type="button" className={styles.inlineLink} onClick={() => onEdit(3)}>
                  Connect one
                </button>
              </span>
            ) : (
              connected.map((platform) => (
                <span key={platform.account.platform} className={styles.reviewPlatform}>
                  <Image
                    src={platform.meta.logo}
                    alt=""
                    width={15}
                    height={15}
                    className={styles.reviewPlatformLogo}
                  />
                  {platform.meta.label}
                  <span className={styles.reviewPlatformHandle}>
                    @{platform.account.username}
                  </span>
                </span>
              ))
            )}
          </div>
        </section>

        <section className={styles.reviewSection}>
          <h4 className={styles.reviewSectionTitle}>Social</h4>
          <div className={styles.reviewChips}>
            {socialEntries.length === 0 ? (
              <span className={styles.reviewEmpty}>
                No links added.{" "}
                <button type="button" className={styles.inlineLink} onClick={() => onEdit(4)}>
                  Add links
                </button>
              </span>
            ) : (
              socialEntries.map((entry) => (
                <span key={entry.key} className={styles.reviewSocial}>
                  {displayNameOf(entry.value)}
                  <span className={styles.reviewSocialHost}>{hostOf(entry.value)}</span>
                </span>
              ))
            )}
          </div>
        </section>

        <footer className={styles.reviewFoot}>
          <span>
            Your profile can be edited anytime from{" "}
            <button type="button" className={styles.inlineLink} onClick={() => onEdit(1)}>
              Settings
            </button>
            .
          </span>
        </footer>
      </div>

      <div className={styles.reviewSummary}>
        <div className={styles.reviewSummaryRow}>
          <span className={styles.reviewSummaryLabel}>Photo</span>
          <span className={draft.avatarUrl ? styles.summaryOk : styles.summaryMissing}>
            {draft.avatarUrl ? "Added" : "Using default avatar"}
          </span>
        </div>
        <div className={styles.reviewSummaryRow}>
          <span className={styles.reviewSummaryLabel}>Skills</span>
          <span className={draft.skills.length > 0 ? styles.summaryOk : styles.summaryMissing}>
            {draft.skills.length > 0 ? `${draft.skills.length} selected` : "None"}
          </span>
        </div>
        <div className={styles.reviewSummaryRow}>
          <span className={styles.reviewSummaryLabel}>Platforms</span>
          <span className={connected.length > 0 ? styles.summaryOk : styles.summaryMissing}>
            {connected.length > 0 ? `${connected.length} connected` : "None"}
          </span>
        </div>
        <div className={styles.reviewSummaryRow}>
          <span className={styles.reviewSummaryLabel}>Links</span>
          <span
            className={socialEntries.length > 0 ? styles.summaryOk : styles.summaryMissing}
          >
            {socialEntries.length > 0 ? `${socialEntries.length} added` : "None"}
          </span>
        </div>
      </div>

      <p className={styles.reviewHint}>
        Missing pieces won&apos;t block you — your dashboard will show{" "}
        <strong>—</strong> for anything we don&apos;t have data for yet, and you
        can fill it in later.
      </p>
    </div>
  );
}

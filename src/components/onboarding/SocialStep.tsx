"use client";

/**
 * Step 4 — Social links.
 *
 * Entirely optional. Every value is validated as an http(s) URL on the client
 * for instant feedback and again on the server before it is stored. The live
 * preview shows exactly which links will become clickable on the profile.
 */

import { useMemo } from "react";
import styles from "@/app/onboarding/onboarding.module.css";

type Socials = {
  linkedin: string;
  github: string;
  twitter: string;
  portfolio: string;
  email: string;
};

const FIELDS: {
  key: keyof Socials;
  label: string;
  placeholder: string;
  hint: string;
  glyph: string;
}[] = [
  {
    key: "linkedin",
    label: "LinkedIn",
    placeholder: "linkedin.com/in/yourname",
    hint: "Must be a linkedin.com link",
    glyph: "in",
  },
  {
    key: "github",
    label: "GitHub",
    placeholder: "github.com/yourname",
    hint: "Must be a github.com link",
    glyph: "gh",
  },
  {
    key: "twitter",
    label: "X / Twitter",
    placeholder: "x.com/yourname",
    hint: "Must be an x.com link",
    glyph: "X",
  },
  {
    key: "portfolio",
    label: "Portfolio / Personal website",
    placeholder: "yourname.dev",
    hint: "Any https address",
    glyph: "↗",
  },
  {
    key: "email",
    label: "Contact email",
    placeholder: "you@example.com",
    hint: "Hidden unless you make it public",
    glyph: "@",
  },
];

function normalise(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function SocialStep({
  socials,
  username,
  onChange,
  onError,
}: {
  socials: Socials;
  username: string;
  onChange: (socials: Socials) => void;
  onError: (message: string | null) => void;
}) {
  const validity = useMemo(() => {
    const out: Record<string, boolean | null> = {};
    for (const field of FIELDS) {
      const value = socials[field.key] ?? "";
      if (!value.trim()) {
        out[field.key] = null; // empty is fine — these are optional
      } else if (field.key === "email") {
        out[field.key] = isValidEmail(value);
      } else {
        out[field.key] = normalise(value) !== null;
      }
    }
    return out;
  }, [socials]);

  const previewLinks = useMemo(
    () =>
      FIELDS.filter((f) => f.key !== "email").filter((f) => {
        const value = socials[f.key];
        return Boolean(value?.trim()) && validity[f.key] !== false;
      }),
    [socials, validity]
  );

  function set(key: keyof Socials, value: string) {
    onError(null);
    onChange({ ...socials, [key]: value });
  }

  return (
    <div className={styles.stepWrap}>
      <header className={styles.stepHead}>
        <h2 className={styles.stepTitle}>Make your profile easy to discover.</h2>
        <p className={styles.stepSub}>
          Add the links you want people to find. Every field is optional.
        </p>
      </header>

      <div className={styles.socialGrid}>
        {FIELDS.map((field) => {
          const value = socials[field.key] ?? "";
          const state = validity[field.key];
          return (
            <label key={field.key} className={styles.field}>
              <span className={styles.label}>
                <span className={styles.socialGlyph}>{field.glyph}</span>
                {field.label}
                <span className={styles.optional}>optional</span>
              </span>
              <input
                className={`${styles.input} ${
                  state === false ? styles.inputInvalid : ""
                }`}
                value={value}
                onChange={(e) => set(field.key, e.target.value)}
                placeholder={field.placeholder}
                spellCheck={false}
                autoComplete="off"
              />
              <span className={styles.helper}>
                {state === false ? (
                  <span className={styles.helperBad}>
                    {field.key === "email"
                      ? "That email doesn't look right."
                      : `Enter a valid ${field.label} link.`}
                  </span>
                ) : (
                  <span className={styles.helperNeutral}>{field.hint}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <section className={styles.previewBlock} aria-label="Link preview">
        <div className={styles.previewHead}>Preview</div>
        <div className={styles.previewLinks}>
          {previewLinks.length === 0 ? (
            <span className={styles.chipEmpty}>
              Add a link above and it will appear here as a clickable profile link.
            </span>
          ) : (
            previewLinks.map((field) => {
              const url = normalise(socials[field.key])!;
              return (
                <a
                  key={field.key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.previewLink}
                >
                  <span className={styles.previewLinkGlyph}>{field.glyph}</span>
                  {field.key === "portfolio" ? "Portfolio" : field.label}
                  <span className={styles.previewLinkHandle}>
                    {url.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 34)}
                  </span>
                </a>
              );
            })
          )}
        </div>
        {username && (
          <p className={styles.previewNote}>
            These will appear on your Devora profile at{" "}
            <strong>devora.app/{username}</strong> — you can hide any of them
            later in Settings.
          </p>
        )}
      </section>
    </div>
  );
}

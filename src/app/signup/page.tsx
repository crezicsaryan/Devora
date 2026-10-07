"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  createClient,
  describeAuthFailure,
  hasSupabaseEnv,
} from "@/lib/supabase/client";
import { HomeButton } from "@/components/HomeButton";
import styles from "../auth.module.css";

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = hasSupabaseEnv();

  async function handleGoogle() {
    setError(null);
    if (!configured) {
      setError(
        "Auth isn't wired up yet — add your Supabase keys to devora/.env.local and restart the dev server."
      );
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // Brand-new accounts always start in onboarding; the callback
          // re-checks the database, so a returning user is never trapped here.
          redirectTo: `${window.location.origin}/auth/callback?next=/profile/create`,
        },
      });
      if (error) {
        setError(error.message);
        setBusy(false);
      }
      // on success the browser redirects to Google
    } catch (err) {
      setError(describeAuthFailure(err));
      setBusy(false);
    }
  }

  return (
    <div className={styles.authPage}>
      <div className={`${styles.authGlow} ${styles.glowTop}`} />
      <div className={`${styles.authGlow} ${styles.glowBottom}`} />

      <header className={styles.authNav}>
        <HomeButton />
      </header>

      <div className={styles.authBody}>
        <div className={styles.authCard}>
          <div className={styles.brandRow}>
            <Image
              src="/logo/devora-lockup-white.png"
              alt="Devora logo"
              width={140}
              height={40}
              priority
              className={styles.brandImg}
            />
          </div>

          <h1 className={styles.title}>Create your Devora</h1>
          <p className={styles.subtitle}>
            Sign up with Google — one profile to track, showcase and grow your
            entire journey.
          </p>

          {error && <div className={styles.errorBox}>{error}</div>}

          <button
            type="button"
            className={styles.googleBtn}
            onClick={handleGoogle}
            disabled={busy}
          >
            <GoogleMark /> {busy ? "Redirecting…" : "Continue with Google"}
          </button>

          <p className={styles.footNote}>
            Already have an account? <Link href="/login">Log in</Link>
          </p>
        </div>

        <p className={styles.legalNote}>
          By signing up you agree to our terms · Only Google sign-in is supported
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.6c-.1 1.1-.9 2.8-2.5 3.9l3.8 3c2.3-2.1 3.6-5.2 3.6-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-3c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.8-2.1-6.8-5l-3.9 3C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3l-4-3C.4 8.3 0 10.1 0 12s.4 3.7 1.2 5.3l4-3z" />
      <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.2 6.7l4 3c1-2.9 3.6-5 6.8-5z" />
    </svg>
  );
}

"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  createClient,
  describeAuthFailure,
  hasSupabaseEnv,
} from "@/lib/supabase/client";
import { HomeButton } from "@/components/HomeButton";
import styles from "../auth.module.css";

/**
 * `useSearchParams()` forces client-side rendering, so Next requires the
 * reading component to sit inside a Suspense boundary — otherwise the page
 * cannot be prerendered at build time.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const explicitNext = params.get("next");
  // No guesswork: without an explicit deep link we let the server decide
  // between /profile/create and /dashboard from the database.
  const authError = params.get("error");

  const [error, setError] = useState<string | null>(
    authError === "auth_code_invalid"
      ? "That sign-in link has expired. Please try again."
      : authError === "auth_not_configured"
        ? "Auth isn't configured yet — add your Supabase keys to devora/.env.local."
        : null
  );
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
          redirectTo: explicitNext
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(explicitNext)}`
            : `${window.location.origin}/auth/callback`,
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

          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>
            Log in with Google to track, showcase and grow your developer
            journey.
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
            New to Devora? <Link href="/signup">Create your account</Link>
          </p>
        </div>

        <p className={styles.legalNote}>
          Only Google sign-in is supported · <Link href="/app">Go to app</Link>
        </p>
      </div>
    </div>
  );
}

function AuthFallback() {
  return (
    <div className={styles.authPage}>
      <div className={`${styles.authGlow} ${styles.glowTop}`} />
      <div className={`${styles.authGlow} ${styles.glowBottom}`} />
      <header className={styles.authNav}>
        <HomeButton />
      </header>
      <div className={styles.authBody}>
        <div className={styles.authCard} style={{ opacity: 0.6 }}>
          <p className={styles.subtitle}>Loading…</p>
        </div>
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

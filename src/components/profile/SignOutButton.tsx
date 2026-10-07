"use client";

/**
 * Sign out, using the real Supabase session.
 *
 * A client component because signing out has to clear cookies in the browser
 * and then refresh; a plain form post would need its own route for no benefit.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "@/app/profile/create/profile-create.module.css";

export function SignOutButton({ label = "Log out" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <button type="button" className={styles.btnGhost} onClick={signOut} disabled={busy}>
      {busy ? "Signing out…" : label}
    </button>
  );
}

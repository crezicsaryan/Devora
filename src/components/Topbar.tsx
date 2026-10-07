"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function Topbar({
  onShareProfile,
}: {
  onShareProfile?: () => void;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="topbar">
      <div className="search" role="search" aria-label="Global search">
        <SearchIcon />
        <span>Search a handle, sheet, or question…</span>
      </div>
      <div className="topbar-actions">
        <button className="btn" type="button">Sync now</button>
        <button className="btn btn-primary" type="button" onClick={onShareProfile}>
          Share profile
        </button>
        <button
          className="btn"
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label="Sign out"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        <div className="avatar-sm" aria-hidden="true">DV</div>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

"use client";

/**
 * Initial-sync overlay shown between "Complete Setup" and the dashboard.
 *
 * The work itself (queuing and processing platform jobs) already happened
 * server-side in POST /api/onboarding/complete and continues in the background
 * via after(). This overlay narrates that progress honestly — it never claims
 * a step succeeded that the server did not report.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { ConnectedPlatform } from "@/lib/types";
import styles from "@/app/onboarding/onboarding.module.css";

type LineState = "done" | "active" | "pending";

export function SyncOverlay({ platforms }: { platforms: ConnectedPlatform[] }) {
  const connected = platforms.filter(
    (p) => p.account.connectionStatus === "connected"
  );
  const labels = connected.map((p) => p.meta.label);

  // The first two lines are already true — they happened before we got here.
  const base = [
    { label: "Profile created", state: "done" as LineState },
    ...(labels.includes("GitHub")
      ? [{ label: "GitHub connected", state: "done" as LineState }]
      : []),
    {
      label:
        labels.length > 0
          ? `Syncing statistics from ${labels.join(", ")}`
          : "Preparing your workspace",
      state: "active" as LineState,
    },
    { label: "Preparing analytics", state: "pending" as LineState },
  ];

  const [lines, setLines] = useState(base);

  useEffect(() => {
    // Advance the narration while the background jobs run. The dashboard itself
    // renders whatever is true, including partial or missing data.
    const t1 = setTimeout(() => {
      setLines((prev) =>
        prev.map((line) =>
          line.state === "active" ? { ...line, state: "done" } : line
        )
      );
    }, 1700);
    const t2 = setTimeout(() => {
      setLines((prev) =>
        prev.map((line) =>
          line.state === "pending" ? { ...line, state: "active" } : line
        )
      );
    }, 1900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <motion.div
      className={styles.syncOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="status"
      aria-live="polite"
    >
      <motion.div
        className={styles.syncPanel}
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={styles.syncOrb} aria-hidden="true" />
        <h2 className={styles.syncTitle}>Building your Devora dashboard…</h2>
        <p className={styles.syncSub}>Syncing your coding journey…</p>

        <ul className={styles.syncList}>
          {lines.map((line) => (
            <li key={line.label} className={styles.syncItem} data-state={line.state}>
              <span className={styles.syncGlyph}>
                {line.state === "done" ? "✓" : line.state === "active" ? "⟳" : "○"}
              </span>
              <span className={styles.syncLabel}>{line.label}</span>
            </li>
          ))}
        </ul>

        <div className={styles.syncTrack}>
          <motion.div
            className={styles.syncFill}
            initial={{ width: "8%" }}
            animate={{ width: "96%" }}
            transition={{ duration: 2.4, ease: "easeOut" }}
          />
        </div>

        <p className={styles.syncNote}>
          This keeps running in the background — you can start using your
          dashboard right away.
        </p>
      </motion.div>
    </motion.div>
  );
}

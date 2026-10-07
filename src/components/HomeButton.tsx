"use client";

/**
 * HomeButton — the one "Home" control used across the app.
 *
 * Placement rule: it always lives in the page's header/nav, as a normal flex
 * child. It is never absolutely or fixed positioned, so it cannot collide with
 * anything on an unusual screen size — the browser lays it out.
 *
 * Responsiveness is pure CSS (viewport media queries + flexbox), never
 * JavaScript device detection and never a hardcoded pixel offset. The label
 * stays "Home" at every size; only the padding tightens on narrow screens.
 */

import Link from "next/link";
import styles from "./HomeButton.module.css";

export function HomeButton({
  className,
  /** `solid` adds a subtle fill for headers that sit on a busy backdrop. */
  variant = "ghost",
}: {
  className?: string;
  variant?: "ghost" | "solid";
}) {
  return (
    <Link
      href="/"
      className={`${styles.btn} ${variant === "solid" ? styles.solid : ""} ${className ?? ""}`}
      // Not the current page, but a real destination — announce it clearly.
      aria-label="Home"
    >
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M3 10.5L12 3l9 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5.5 9.5V20a1 1 0 001 1H10v-5.5h4V21h3.5a1 1 0 001-1V9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.label}>Home</span>
    </Link>
  );
}

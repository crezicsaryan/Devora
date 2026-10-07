"use client";

/**
 * Dashboard shell: sidebar, header, content area, mobile bottom nav.
 * Wraps the signed-in pages so navigation, notifications and the profile menu
 * behave identically everywhere.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { initialsOf } from "@/lib/avatar";
import type { NotificationRow } from "@/lib/types";
import { NAV_ITEMS, type NavId } from "@/components/dashboard/nav-items";
import { HomeButton } from "@/components/HomeButton";
import styles from "@/app/dashboard/dashboard.module.css";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function DashboardShell({
  active,
  displayName,
  username,
  avatarUrl,
  children,
}: {
  active: NavId;
  displayName: string;
  username: string;
  avatarUrl: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api.notifications().then((res) => {
      if (!alive || !res.ok) return;
      setNotifications(res.data.notifications);
      setUnread(res.data.unread);
    });
    return () => {
      alive = false;
    };
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Close the tablet rail whenever the route changes. Adjusting state during
  // render is React's documented alternative to a setState-in-effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (railOpen) setRailOpen(false);
  }

  const openNotifications = useCallback(async () => {
    setBellOpen((prev) => !prev);
    setMenuOpen(false);
    if (!bellOpen && unread > 0) {
      const res = await api.markNotificationsRead();
      if (res.ok) {
        setUnread(0);
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
        );
      }
    }
  }, [bellOpen, unread]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  const submitSearch = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const q = search.trim();
      if (!q) return;
      // Search maps onto the existing navigation rather than inventing routes.
      router.push(
        /^[a-z0-9_-]{3,30}$/i.test(q)
          ? `/dashboard/leaderboard?q=${encodeURIComponent(q)}`
          : `/dashboard/tracker?q=${encodeURIComponent(q)}`
      );
    },
    [search, router]
  );

  const mainItems = NAV_ITEMS.filter((item) => item.group === "main");
  const accountItems = NAV_ITEMS.filter((item) => item.group === "account");
  const mobileItems = NAV_ITEMS.filter((item) => item.mobile);

  return (
    <div className={styles.shell}>
      {/* backdrop for the tablet rail */}
      <div className={styles.backdrop} data-hidden={!railOpen} onClick={() => setRailOpen(false)} />

      {/* ---------------- sidebar ---------------- */}
      <aside className={styles.sidebar} data-open={railOpen}>
        <div className={styles.sidebarBrand}>
          <Image
            src="/logo/devora-lockup-white.png"
            alt="Devora"
            width={132}
            height={38}
            className={styles.brandImg}
          />
          <button
            type="button"
            className={styles.railClose}
            onClick={() => setRailOpen(false)}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        <nav className={styles.navGroup} aria-label="Main">
          {mainItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`${styles.navItem} ${active === item.id ? styles.navItemOn : ""}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.navGroupLabel}>Account</div>
        <nav className={styles.navGroup} aria-label="Account">
          {accountItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`${styles.navItem} ${active === item.id ? styles.navItemOn : ""}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFoot}>
          <Link href="/dashboard/platforms" className={styles.syncPill}>
            <span className={styles.syncDot} aria-hidden="true" />
            Platform sync
          </Link>
        </div>
      </aside>

      {/* ---------------- main column ---------------- */}
      <div className={styles.column}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.railToggle}
            onClick={() => setRailOpen(true)}
            aria-label="Open navigation"
          >
            <span /><span /><span />
          </button>

          <Link href="/dashboard" className={styles.headerBrand}>
            <Image
              src="/logo/devora-lockup-white.png"
              alt="Devora"
              width={112}
              height={32}
            />
          </Link>

          {/* Always present in the header, at every breakpoint. */}
          <HomeButton className={styles.homeBtn} variant="solid" />

          <form className={styles.search} onSubmit={submitSearch} role="search">
            <SearchGlyph />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions, handles, sheets…"
              aria-label="Search"
            />
          </form>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={openNotifications}
              aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
            >
              <BellGlyph />
              {unread > 0 && <span className={styles.badge}>{unread > 9 ? "9+" : unread}</span>}
            </button>

            <div className={styles.profileWrap} ref={menuRef}>
              <button
                type="button"
                className={styles.profileBtn}
                onClick={() => {
                  setMenuOpen((prev) => !prev);
                  setBellOpen(false);
                }}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className={styles.avatar}>
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className={styles.avatarImg} />
                  ) : (
                    initialsOf(displayName)
                  )}
                </span>
                <span className={styles.profileText}>
                  <span className={styles.profileName}>{displayName || "Developer"}</span>
                  <span className={styles.profileHandle}>
                    {username ? `@${username}` : "No username"}
                  </span>
                </span>
                <ChevronGlyph />
              </button>

              {menuOpen && (
                <div className={styles.menu} role="menu">
                  <Link
                    href="/dashboard/profile"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    My Profile
                  </Link>
                  <Link
                    href="/dashboard/achievements"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    Achievements
                  </Link>
                  <Link
                    href="/dashboard/settings"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    Settings
                  </Link>
                  <div className={styles.menuSep} />
                  <button
                    type="button"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={signOut}
                    disabled={signingOut}
                  >
                    {signingOut ? "Signing out…" : "Log out"}
                  </button>
                </div>
              )}

              {bellOpen && (
                <div className={styles.notifPanel} role="dialog" aria-label="Notifications">
                  <div className={styles.notifHead}>Notifications</div>
                  {notifications.length === 0 ? (
                    <p className={styles.notifEmpty}>Nothing yet — syncs and achievements land here.</p>
                  ) : (
                    <ul className={styles.notifList}>
                      {notifications.slice(0, 8).map((n) => (
                        <li key={n.id} className={styles.notifItem}>
                          <span
                            className={styles.notifDot}
                            data-unread={!n.readAt}
                            aria-hidden="true"
                          />
                          <div className={styles.notifBody}>
                            <span className={styles.notifTitle}>{n.title}</span>
                            {n.body && <span className={styles.notifText}>{n.body}</span>}
                            <span className={styles.notifTime}>{relativeTime(n.createdAt)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={styles.content}>{children}</main>
      </div>

      {/* ---------------- mobile bottom nav ---------------- */}
      <nav className={styles.bottomNav} aria-label="Mobile navigation">
        {mobileItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`${styles.bottomItem} ${active === item.id ? styles.bottomItemOn : ""}`}
          >
            <span className={styles.bottomIcon}>{item.icon}</span>
            <span className={styles.bottomLabel}>{item.label.split(" ")[0]}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function BellGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" />
    </svg>
  );
}

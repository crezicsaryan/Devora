"use client";

/**
 * Dashboard navigation. One nav model drives the sidebar, the tablet rail and
 * the mobile bottom bar, so the three layouts can never drift apart.
 */

import type { ReactNode } from "react";

export type NavId =
  | "dashboard"
  | "profile"
  | "tracker"
  | "topics"
  | "projects"
  | "analytics"
  | "achievements"
  | "platforms"
  | "leaderboard"
  | "settings";

export type NavItem = {
  id: NavId;
  label: string;
  href: string;
  icon: ReactNode;
  group: "main" | "account";
  mobile?: boolean;
};

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    group: "main",
    mobile: true,
    icon: <Icon d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  },
  {
    id: "profile",
    label: "My Profile",
    href: "/dashboard/profile",
    group: "main",
    mobile: true,
    icon: <Icon d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a8 8 0 0116 0v1" />,
  },
  {
    id: "tracker",
    label: "Question Tracker",
    href: "/dashboard/tracker",
    group: "main",
    icon: <Icon d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />,
  },
  {
    id: "topics",
    label: "Topics",
    href: "/dashboard/topics",
    group: "main",
    icon: <Icon d="M4 5h16M4 12h16M4 19h10" />,
  },
  {
    id: "projects",
    label: "Projects",
    href: "/dashboard/projects",
    group: "main",
    mobile: true,
    icon: <Icon d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  },
  {
    id: "analytics",
    label: "Analytics",
    href: "/dashboard/analytics",
    group: "main",
    icon: <Icon d="M3 21V9M9 21V3M15 21v-8M21 21v-5" />,
  },
  {
    id: "achievements",
    label: "Achievements",
    href: "/dashboard/achievements",
    group: "main",
    icon: <Icon d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3" />,
  },
  {
    id: "platforms",
    label: "Connected Platforms",
    href: "/dashboard/platforms",
    group: "main",
    icon: <Icon d="M9 3H5a2 2 0 00-2 2v4M15 3h4a2 2 0 012 2v4M9 21H5a2 2 0 01-2-2v-4M15 21h4a2 2 0 002-2v-4M12 8v8M8 12h8" />,
  },
  {
    id: "leaderboard",
    label: "Leaderboard",
    href: "/dashboard/leaderboard",
    group: "main",
    icon: <Icon d="M12 2l3 6 6 1-4.5 4.3L18 20l-6-3.2L6 20l1.5-6.7L3 9l6-1z" />,
  },
  {
    id: "settings",
    label: "Settings",
    href: "/dashboard/settings",
    group: "account",
    mobile: true,
    icon: <Icon d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 007 19.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15H3a2 2 0 110-4h.1A1.7 1.7 0 004.7 9L4.6 9a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 5V5a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />,
  },
];

export function navById(id: NavId): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.id === id);
}

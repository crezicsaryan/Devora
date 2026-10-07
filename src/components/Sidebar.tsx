"use client";

import { DevoraLogo } from "./DevoraLogo";

const navItems = [
  { id: "dashboard", label: "Dashboard", svg: <DashboardSvg /> },
  { id: "questions", label: "Question Tracker", svg: <ListSvg /> },
  { id: "events", label: "Event Tracker", svg: <CalendarSvg /> },
  { id: "share", label: "Portfolio Card", svg: <ShareSvg /> },
];

const accountItems = [
  { id: "profile", label: "Edit Profile", svg: <UserSvg /> },
  { id: "settings", label: "Settings", svg: <CogSvg /> },
];

export function Sidebar({
  active,
  onNavigate,
}: {
  active?: string;
  onNavigate?: (view: string) => void;
}) {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-brand">
        <DevoraLogo size="md" showSub />
      </div>

      <ul className="nav-list" role="list">
        {navItems.map((item) => (
          <li key={item.id}>
            <button
              className={`nav-item ${active === item.id ? "active" : ""}`}
              onClick={() => onNavigate?.(item.id)}
              type="button"
            >
              {item.svg}
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="nav-group-label">Account</div>
      <ul className="nav-list" role="list">
        {accountItems.map((item) => (
          <li key={item.id}>
            <button
              className={`nav-item ${active === item.id ? "active" : ""}`}
              onClick={() => onNavigate?.(item.id)}
              type="button"
            >
              {item.svg}
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-foot">
        <div className="sync-pill">
          <span className="sync-dot" aria-hidden="true" />
          Synced 4 min ago
        </div>
      </div>
    </aside>
  );
}

function DashboardSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  );
}

function ListSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function CalendarSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function ShareSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 12h8M8 8h8M8 16h5" />
    </svg>
  );
}

function UserSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0116 0v1" />
    </svg>
  );
}

function CogSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </svg>
  );
}

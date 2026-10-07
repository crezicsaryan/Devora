"use client";

/**
 * Small shared hook the read-only dashboard pages use.
 *
 * One dashboard payload backs several pages, so they never issue their own
 * queries or duplicate fetch logic.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { ActivityRange, DashboardPayload } from "@/lib/types";

export function useDashboard(range: ActivityRange = "30d") {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (next: ActivityRange, isActive?: () => boolean) => {
      const res = await api.dashboard(next);
      if (isActive && !isActive()) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    let alive = true;
    // State is only touched after the request resolves, so this cannot cause a
    // synchronous cascading render.
    void (async () => {
      await load(range, () => alive);
    })();
    return () => {
      alive = false;
    };
  }, [range, load]);

  return { data, loading, error, reload: () => load(range) };
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString();
}

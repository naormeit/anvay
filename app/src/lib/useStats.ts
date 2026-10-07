"use client";

import { useEffect, useState } from "react";
import type { StatsResponse } from "./indexer";

/** Public usage numbers from /api/stats. `stats` stays null while loading or if the request fails. */
export function useStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Stats are unavailable right now.");
        if (!cancelled) setStats(body);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Stats are unavailable."));
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, error };
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(seconds: number) {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

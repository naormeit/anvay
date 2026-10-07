"use client";

import { useEffect, useState } from "react";
import { Card, Notice, Shell } from "@/components/ui";
import { ESCROW_ADDRESS, isMainnet } from "@/lib/config";
import { formatInr, formatUsd } from "@/lib/format";
import type { StatsResponse } from "@/lib/indexer";

const explorer = isMainnet ? "https://monadvision.com" : "https://testnet.monadvision.com";
const statusLabel = { pending: "Link created", claimed: "Collected", cancelled: "Cancelled" } as const;

function timeAgo(seconds: number) {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default function StatsPage() {
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

  return (
    <Shell>
      <section className="flex flex-col gap-1 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight">Anvay in numbers</h1>
        <p className="text-sm text-muted">
          Live from Monad{isMainnet ? "" : " testnet"}
          {stats && (stats.source === "envio" ? ", indexed by Envio." : ", read directly from the contract.")}
        </p>
        <p className="text-xs text-muted">Real usage only: transfers made by our automated tests are excluded.</p>
      </section>

      {error && <Notice tone="danger">{error}</Notice>}
      {!stats && !error && <Notice>Loading…</Notice>}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Payment links" value={String(stats.links)} sub={`${stats.pending} waiting`} />
            <Stat
              label="Collected"
              value={String(stats.collected)}
              sub={stats.links ? `${Math.round((stats.collected / stats.links) * 100)}% of links` : undefined}
            />
            <Stat
              label="Dollars sent"
              value={formatUsd(BigInt(stats.volume))}
              sub={stats.rate ? `About ${formatInr(BigInt(stats.volume), stats.rate.inrPerUsd)}` : undefined}
            />
            <Stat label="Dollars collected" value={formatUsd(BigInt(stats.collectedVolume))} />
            <Stat label="Senders" value={String(stats.senders)} />
            <Stat label="Recipients" value={stats.recipients === null ? "–" : String(stats.recipients)} />
          </div>

          {stats.rate && (
            <Card>
              <p className="text-sm text-muted">Today&apos;s rate</p>
              <p className="text-xl font-semibold">$1 = ₹{stats.rate.inrPerUsd.toFixed(2)}</p>
              <p className="text-xs text-muted">
                {stats.rate.source === "chainlink"
                  ? "From Anvay's Chainlink CRE feed on Monad (median of three sources)"
                  : "From open.er-api.com"}
                {" · updated "}
                {timeAgo(Math.floor(new Date(stats.rate.updatedAt).getTime() / 1000))}
              </p>
            </Card>
          )}

          {stats.recent.length > 0 && (
            <Card className="flex flex-col gap-2">
              <p className="font-medium">Recent activity</p>
              <ul className="flex flex-col divide-y divide-border text-sm">
                {stats.recent.map((a) => (
                  <li key={`${a.id}-${a.status}`} className="flex items-center justify-between py-2">
                    <span>
                      {statusLabel[a.status]} · {formatUsd(BigInt(a.amount))}
                    </span>
                    <span className="text-xs text-muted">{timeAgo(a.at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <p className="text-xs text-muted">
            Escrow contract:{" "}
            <a className="underline" href={`${explorer}/address/${ESCROW_ADDRESS}`} target="_blank" rel="noopener noreferrer">
              {ESCROW_ADDRESS.slice(0, 6)}…{ESCROW_ADDRESS.slice(-4)}
            </a>
          </p>
        </>
      )}
    </Shell>
  );
}

"use client";

import { SplitBar, TimeChart } from "@/components/charts";
import { ChartIcon, LinkIcon, RupeeIcon, WalletIcon } from "@/components/icons";
import { Card, Notice, Shell } from "@/components/ui";
import { ESCROW_ADDRESS, explorerAddress, isMainnet } from "@/lib/config";
import { formatInr, formatUsd } from "@/lib/format";
import { timeAgo, useStats } from "@/lib/useStats";

const statusLabel = { pending: "Link created", claimed: "Collected", cancelled: "Cancelled" } as const;
const statusDot = { pending: "bg-amber-500", claimed: "bg-success", cancelled: "bg-muted" } as const;

const usd = (dollars: number) =>
  dollars.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">{icon}</span>
      <p className="mt-1 text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default function StatsPage() {
  const { stats, error } = useStats();

  return (
    <Shell wide>
      <section className="flex flex-col gap-2 pt-2">
        <span className="flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Live from Monad{isMainnet ? "" : " testnet"}
          {stats && (stats.source === "envio" ? " · indexed by Envio" : " · read from the contract")}
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Anvay in numbers</h1>
        <p className="text-sm text-muted">Real usage only. Transfers made by our automated tests are left out.</p>
      </section>

      {error && <Notice tone="danger">{error}</Notice>}
      {!stats && !error && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              icon={<LinkIcon className="h-4 w-4" />}
              label="Payment links"
              value={String(stats.links)}
              sub={`${stats.senders} ${stats.senders === 1 ? "sender" : "senders"}`}
            />
            <Stat
              icon={<WalletIcon className="h-4 w-4" />}
              label="Dollars sent"
              value={formatUsd(BigInt(stats.volume))}
              sub={stats.rate ? `About ${formatInr(BigInt(stats.volume), stats.rate.inrPerUsd)}` : undefined}
            />
            <Stat
              icon={<ChartIcon className="h-4 w-4" />}
              label="Collected"
              value={stats.links ? `${Math.round((stats.collected / stats.links) * 100)}%` : "–"}
              sub={`${formatUsd(BigInt(stats.collectedVolume))} collected`}
            />
            <Stat
              icon={<RupeeIcon className="h-4 w-4" />}
              label="Today's rate"
              value={stats.rate ? `₹${stats.rate.inrPerUsd.toFixed(2)}` : "–"}
              sub={stats.rate?.source === "chainlink" ? "per $1 · Chainlink CRE" : "per $1"}
            />
          </div>

          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="font-medium">Dollars sent over time</p>
                <p className="text-xs text-muted">Running total, one step per payment link</p>
              </div>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatUsd(BigInt(stats.volume))}</p>
            </div>
            <TimeChart
              label="Running total of dollars sent"
              step
              until={stats.asOf}
              format={usd}
              points={stats.growth.map((g) => ({ at: g.at, value: Number(BigInt(g.volume)) / 1e6 }))}
            />
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="flex flex-col gap-4">
              <div>
                <p className="font-medium">Where the links are</p>
                <p className="text-xs text-muted">
                  {stats.recipients === null
                    ? "Every link, by status"
                    : `${stats.recipients} ${stats.recipients === 1 ? "person has" : "people have"} collected money`}
                </p>
              </div>
              <SplitBar
                parts={[
                  { label: "Collected", value: stats.collected, className: "bg-success" },
                  { label: "Waiting", value: stats.pending, className: "bg-amber-500" },
                  { label: "Cancelled", value: stats.cancelled, className: "bg-muted" },
                ]}
              />
            </Card>

            <Card className="flex flex-col gap-2">
              <p className="font-medium">Recent activity</p>
              {stats.recent.length === 0 ? (
                <p className="text-sm text-muted">Nothing yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border text-sm">
                  {stats.recent.slice(0, 5).map((a) => (
                    <li key={`${a.id}-${a.status}`} className="flex items-center justify-between gap-2 py-2">
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${statusDot[a.status]}`} />
                        {statusLabel[a.status]}
                        <span className="font-medium tabular-nums">{formatUsd(BigInt(a.amount))}</span>
                      </span>
                      <span className="text-xs text-muted">{timeAgo(a.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {stats.rate && (
            <Card className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="font-medium">Dollar to rupee rate</p>
                  <p className="text-xs text-muted">
                    {stats.rate.source === "chainlink"
                      ? "Written on Monad by Anvay's Chainlink CRE workflow: the median of three sources, agreed by the network"
                      : "From open.er-api.com"}
                    {" · updated "}
                    {timeAgo(Math.floor(new Date(stats.rate.updatedAt).getTime() / 1000))}
                  </p>
                </div>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">₹{stats.rate.inrPerUsd.toFixed(2)}</p>
              </div>
              {stats.rateHistory.length > 0 && (
                <TimeChart
                  label="Dollar to rupee rate written on-chain"
                  zeroBased={false}
                  until={stats.asOf}
                  format={(v) => `₹${v.toFixed(2)}`}
                  points={stats.rateHistory.map((r) => ({ at: r.at, value: r.inrPerUsd }))}
                />
              )}
            </Card>
          )}

          <p className="text-xs text-muted">
            Money waits in a verified escrow contract:{" "}
            <a className="underline" href={explorerAddress(ESCROW_ADDRESS)} target="_blank" rel="noopener noreferrer">
              {ESCROW_ADDRESS.slice(0, 6)}…{ESCROW_ADDRESS.slice(-4)}
            </a>
          </p>
        </>
      )}
    </Shell>
  );
}

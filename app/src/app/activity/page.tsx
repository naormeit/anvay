"use client";

import { HandIcon, LinkIcon, WalletIcon } from "@/components/icons";
import { SentListView } from "@/components/SentList";
import { SignedInOnly } from "@/components/SignedInOnly";
import { Card, CardTitle, Notice, Shell } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { explorerAddress, ESCROW_ADDRESS } from "@/lib/config";
import { formatInr, formatUsd } from "@/lib/format";
import { useDollarBalance, useInrRate } from "@/lib/hooks";
import { sentTotals, useMyLinks, useReceived } from "@/lib/useMyLinks";
import { timeAgo } from "@/lib/useStats";

function Summary({ label, value, sub, tint }: { label: string; value: string; sub?: string; tint: string }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-2xl border p-4 shadow-soft ${tint}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Activity() {
  const { account } = useAccount();
  const { refresh } = useDollarBalance(account?.address);
  const inrPerUsd = useInrRate();
  const myLinks = useMyLinks(refresh);
  const { links, stateOf } = myLinks;
  const received = useReceived();
  const totals = sentTotals(links, stateOf);
  const receivedTotal = (received ?? []).reduce((sum, r) => sum + BigInt(r.amount), BigInt(0));

  return (
    <Shell>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted">Every link you&apos;ve sent, and money you&apos;ve collected.</p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Summary
          tint="tint-warm"
          label="You've sent"
          value={formatUsd(totals.sent)}
          sub={inrPerUsd ? `About ${formatInr(totals.sent, inrPerUsd)}` : undefined}
        />
        <Summary
          tint="tint-amber"
          label="Links"
          value={String(totals.count)}
          sub={`${totals.collected} collected · ${totals.waiting} waiting`}
        />
      </div>

      <SentListView data={myLinks} filterable />

      <Card tint="neutral" className="flex flex-col gap-3">
        <CardTitle icon={<HandIcon className="h-4 w-4" />}>Collected by you</CardTitle>
        {received === null ? (
          <Notice>Money you collect from other people shows up here.</Notice>
        ) : received.length === 0 ? (
          <Notice>Nothing yet. When someone sends you a link and you collect it, it shows up here.</Notice>
        ) : (
          <>
            <p className="text-sm text-muted">
              {formatUsd(receivedTotal)} from {received.length} {received.length === 1 ? "link" : "links"}
            </p>
            <ul className="flex flex-col divide-y divide-border">
              {received.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-success/15 text-success">
                      <WalletIcon className="h-4 w-4" />
                    </span>
                    <span className="flex flex-col">
                      <span className="font-medium tabular-nums">+{formatUsd(BigInt(r.amount))}</span>
                      <span className="text-xs text-muted">
                        From {r.sender.slice(0, 6)}…{r.sender.slice(-4)}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs text-muted">{r.at ? timeAgo(r.at) : ""}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <LinkIcon className="h-3.5 w-3.5" />
        <span>
          Every link is a deposit in the{" "}
          <a className="underline" href={explorerAddress(ESCROW_ADDRESS)} target="_blank" rel="noopener noreferrer">
            escrow contract
          </a>
          .
        </span>
      </p>
    </Shell>
  );
}

export default function ActivityPage() {
  return (
    <SignedInOnly title="Your activity">
      <Activity />
    </SignedInOnly>
  );
}

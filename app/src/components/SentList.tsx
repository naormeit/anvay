"use client";

import { useState } from "react";
import Link from "next/link";
import { buildClaimUrl } from "@/lib/claimLink";
import { formatUsd } from "@/lib/format";
import { linkStateLabel, useMyLinks, type LinkState } from "@/lib/useMyLinks";
import { ArrowRightIcon } from "./icons";
import { Button, Card, CardTitle, Notice } from "./ui";
import { ShareLink } from "./ShareLink";

const chip: Record<LinkState, string> = {
  waiting: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  claimed: "bg-success/15 text-success",
  cancelled: "bg-muted/15 text-muted",
  expired: "bg-danger/10 text-danger",
  unknown: "bg-muted/10 text-muted",
};

const filters = [
  { key: "all", label: "All" },
  { key: "waiting", label: "Waiting" },
  { key: "claimed", label: "Collected" },
  { key: "cancelled", label: "Cancelled" },
] as const;
type Filter = (typeof filters)[number]["key"];

function matches(filter: Filter, state: LinkState) {
  if (filter === "all") return true;
  if (filter === "waiting") return state === "waiting" || state === "expired";
  return state === filter;
}

/**
 * Links the signed-in account has sent. On the home screen it shows the latest few (`limit`) with a link to the
 * Activity page; on the Activity page it shows everything with status filters. Rendered only after sign-in.
 */
export function SentList({ onChange, limit }: { onChange: () => void; limit?: number }) {
  return <SentListView data={useMyLinks(onChange)} limit={limit} />;
}

/** The list itself, for a parent that already holds `useMyLinks()` data. */
export function SentListView({
  data,
  limit,
  filterable = false,
}: {
  data: ReturnType<typeof useMyLinks>;
  limit?: number;
  filterable?: boolean;
}) {
  const { links, stateOf, loading, refresh, cancel, cancelling, error } = data;
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  if (!filterable && links.length === 0) return null;
  const anyRecovered = links.some((l) => l.recovered);
  const shown = links.filter((l) => matches(filter, stateOf(l)));
  const visible = limit ? shown.slice(0, limit) : shown;

  return (
    <Card tint="neutral" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <CardTitle icon={<ArrowRightIcon className="h-4 w-4" />}>Sent</CardTitle>
        <button onClick={refresh} className="-mr-2 rounded-lg px-2 py-2.5 text-sm text-muted hover:text-foreground">
          Refresh
        </button>
      </div>
      {anyRecovered && (
        <Notice>Restored with your passkey. Your links work on any device where you sign in with it.</Notice>
      )}
      {filterable && (
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-background/60 p-1 text-[13px]" role="tablist">
          {filters.map((f) => {
            const count = links.filter((l) => matches(f.key, stateOf(l))).length;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`flex-1 rounded-lg px-2 py-1.5 whitespace-nowrap transition ${
                  filter === f.key ? "bg-card font-medium shadow-soft" : "text-muted hover:text-foreground"
                }`}
              >
                {f.label} <span className="text-xs text-muted tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {filterable && loading && <Notice>Loading your links…</Notice>}
      {filterable && !loading && visible.length === 0 && (
        <Notice>{links.length === 0 ? "You haven't sent any links yet." : "No links here."}</Notice>
      )}
      <ul className="flex flex-col divide-y divide-border">
        {visible.map((link) => {
          const state = stateOf(link);
          const canAct = link.id && (state === "waiting" || state === "expired");
          const isOpen = open === link.uid;
          return (
            <li key={link.uid} className="flex flex-col gap-3 py-3">
              <button
                className="flex items-center justify-between gap-3 text-left"
                onClick={() => setOpen(isOpen ? null : link.uid)}
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium">
                    {formatUsd(BigInt(link.amount))}
                    {link.note && <span className="font-normal text-muted"> · {link.note}</span>}
                  </span>
                  <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${chip[state]}`}>
                    {linkStateLabel[state]}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {new Date(link.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </button>
              {isOpen && canAct && link.id && (
                <div className="flex flex-col gap-2">
                  {state === "waiting" && link.key && (
                    <ShareLink
                      url={buildClaimUrl(window.location.origin, BigInt(link.id), link.key)}
                      amount={BigInt(link.amount)}
                    />
                  )}
                  <Button variant="danger" onClick={() => cancel(link)} disabled={cancelling !== null}>
                    {cancelling === link.uid ? "Cancelling…" : "Cancel and get money back"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {limit !== undefined && shown.length > limit && (
        <Link href="/activity" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          See all {shown.length} links <ArrowRightIcon className="h-4 w-4" />
        </Link>
      )}
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import { useAccount } from "@/lib/account";
import { buildClaimUrl } from "@/lib/claimLink";
import { ESCROW_ADDRESS, publicClient } from "@/lib/config";
import { escrowAbi, toTransfer, TransferStatus } from "@/lib/contracts";
import { formatUsd } from "@/lib/format";
import { loadMyLinks, type MyLink } from "@/lib/myLinks";
import { useSendTx } from "@/lib/useSendTx";
import { Button, Card, Notice } from "./ui";
import { ShareLink } from "./ShareLink";

type LinkState = "waiting" | "claimed" | "cancelled" | "expired" | "unknown";

const label: Record<LinkState, string> = {
  waiting: "Waiting to be collected",
  claimed: "Collected",
  cancelled: "Cancelled, money returned",
  expired: "Expired, cancel to get it back",
  unknown: "Checking…",
};

async function readState(id: string): Promise<LinkState> {
  const t = toTransfer(
    await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "transfers",
      args: [BigInt(id)],
    }),
  );
  if (t.status === TransferStatus.Claimed) return "claimed";
  if (t.status === TransferStatus.Cancelled) return "cancelled";
  if (BigInt(Math.floor(Date.now() / 1000)) > t.expiresAt) return "expired";
  return "waiting";
}

/** Rendered only after sign-in, so it never runs during server rendering. */
export function SentList({ onChange }: { onChange: () => void }) {
  const { account } = useAccount();
  const [links, setLinks] = useState<MyLink[]>([]);
  const [states, setStates] = useState<Record<string, LinkState>>({});
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { submit, confirm } = useSendTx();

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    (async () => {
      const loaded = await loadMyLinks(account).catch((err) => {
        console.error("loading links failed", err);
        return [] as MyLink[];
      });
      const entries = await Promise.all(
        loaded.map(
          async (l) => [l.uid, l.id ? await readState(l.id).catch(() => "unknown" as const) : "unknown"] as const,
        ),
      );
      if (!cancelled) {
        setLinks(loaded);
        setStates(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, version]);

  async function cancel(link: MyLink) {
    if (!link.id) return;
    setCancelling(link.uid);
    setError(null);
    try {
      await confirm(
        await submit(
          ESCROW_ADDRESS,
          encodeFunctionData({ abi: escrowAbi, functionName: "cancel", args: [BigInt(link.id)] }),
        ),
      );
      setVersion((v) => v + 1);
      onChange();
    } catch (err) {
      console.error(err);
      setError("Could not cancel. It may have just been collected.");
    } finally {
      setCancelling(null);
    }
  }

  if (links.length === 0) return null;
  const anyRecovered = links.some((l) => l.recovered);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-medium">Sent</p>
        <button
          onClick={() => setVersion((v) => v + 1)}
          className="-mr-2 rounded-lg px-2 py-2.5 text-sm text-muted hover:text-foreground"
        >
          Refresh
        </button>
      </div>
      {anyRecovered && (
        <Notice>Restored with your passkey. Your links work on any device where you sign in with it.</Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <ul className="flex flex-col divide-y divide-border">
        {links.map((link) => {
          const state = states[link.uid] ?? "unknown";
          const canAct = link.id && (state === "waiting" || state === "expired");
          const isOpen = open === link.uid;
          return (
            <li key={link.uid} className="flex flex-col gap-3 py-3">
              <button
                className="flex items-center justify-between text-left"
                onClick={() => setOpen(isOpen ? null : link.uid)}
              >
                <span>
                  <span className="block font-medium">
                    {formatUsd(BigInt(link.amount))}
                    {link.note && <span className="font-normal text-muted"> · {link.note}</span>}
                  </span>
                  <span className={`text-xs ${state === "claimed" ? "text-success" : "text-muted"}`}>
                    {label[state]}
                  </span>
                </span>
                <span className="text-xs text-muted">
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
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import { encodeFunctionData, parseEventLogs, type Address } from "viem";
import { buildClaimUrl } from "@/lib/claimLink";
import { ESCROW_ADDRESS, publicClient } from "@/lib/config";
import { escrowAbi, toTransfer, TransferStatus } from "@/lib/contracts";
import { formatUsd } from "@/lib/format";
import { loadSentLinks, saveSentLink, type SentLink } from "@/lib/sentLinks";
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

/** Resolve the transfer id for a link whose deposit was sent but not yet recorded (e.g. page closed mid-send). */
async function resolveId(owner: Address, link: SentLink): Promise<SentLink> {
  if (link.id) return link;
  const receipt = await publicClient.getTransactionReceipt({ hash: link.depositHash }).catch(() => null);
  if (!receipt || receipt.status !== "success") return link;
  const [deposited] = parseEventLogs({ abi: escrowAbi, eventName: "Deposited", logs: receipt.logs });
  if (!deposited) return link;
  const resolved = { ...link, id: deposited.args.id.toString() };
  saveSentLink(owner, resolved);
  return resolved;
}

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

/** Rendered only after sign-in, so it never runs during server rendering and can read localStorage directly. */
export function SentList({ address, onChange }: { address: Address; onChange: () => void }) {
  const [links, setLinks] = useState<SentLink[]>(() => loadSentLinks(address));
  const [states, setStates] = useState<Record<string, LinkState>>({});
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { submit, confirm } = useSendTx(address);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(loadSentLinks(address).map((l) => resolveId(address, l)));
      const entries = await Promise.all(
        resolved.map(async (l) => [l.depositHash, l.id ? await readState(l.id).catch(() => "unknown" as const) : "unknown"] as const),
      );
      if (!cancelled) {
        setLinks(resolved);
        setStates(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, version]);

  async function cancel(link: SentLink) {
    if (!link.id) return;
    setCancelling(link.depositHash);
    setError(null);
    try {
      await confirm(
        await submit(ESCROW_ADDRESS, encodeFunctionData({ abi: escrowAbi, functionName: "cancel", args: [BigInt(link.id)] })),
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

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-medium">Sent</p>
        <button onClick={() => setVersion((v) => v + 1)} className="text-sm text-muted hover:text-foreground">
          Refresh
        </button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      <ul className="flex flex-col divide-y divide-border">
        {links.map((link) => {
          const state = states[link.depositHash] ?? "unknown";
          const canAct = link.id && (state === "waiting" || state === "expired");
          const isOpen = open === link.depositHash;
          return (
            <li key={link.depositHash} className="flex flex-col gap-3 py-3">
              <button
                className="flex items-center justify-between text-left"
                onClick={() => setOpen(isOpen ? null : link.depositHash)}
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
                <span className="text-xs text-muted">{new Date(link.createdAt).toLocaleDateString()}</span>
              </button>
              {isOpen && canAct && link.id && (
                <div className="flex flex-col gap-2">
                  {state === "waiting" && (
                    <ShareLink
                      url={buildClaimUrl(window.location.origin, BigInt(link.id), link.key)}
                      amount={BigInt(link.amount)}
                    />
                  )}
                  <Button variant="danger" onClick={() => cancel(link)} disabled={cancelling !== null}>
                    {cancelling === link.depositHash ? "Cancelling…" : "Cancel and get money back"}
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

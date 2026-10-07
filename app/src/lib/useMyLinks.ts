"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData } from "viem";
import { useAccount } from "./account";
import { ESCROW_ADDRESS, publicClient } from "./config";
import { escrowAbi, toTransfer, TransferStatus } from "./contracts";
import { indexerReceivedBy, indexerUrl, type ReceivedTransfer } from "./indexer";
import { loadMyLinks, type MyLink } from "./myLinks";
import { useSendTx } from "./useSendTx";

export type LinkState = "waiting" | "claimed" | "cancelled" | "expired" | "unknown";

export const linkStateLabel: Record<LinkState, string> = {
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

/** The signed-in account's sent links with their on-chain state, plus cancel. `loading` is true until first load. */
export function useMyLinks(onChange?: () => void) {
  const { account } = useAccount();
  const [links, setLinks] = useState<MyLink[]>([]);
  const [states, setStates] = useState<Record<string, LinkState>>({});
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { submit, confirm } = useSendTx();
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

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
        setLoading(false);
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
      refresh();
      onChange?.();
    } catch (err) {
      console.error(err);
      setError("Could not cancel. It may have just been collected.");
    } finally {
      setCancelling(null);
    }
  }

  const stateOf = (link: MyLink): LinkState => states[link.uid] ?? "unknown";
  return { links, stateOf, loading, refresh, cancel, cancelling, error };
}

/** Money the signed-in account has collected from other people. Null when unavailable (no indexer). */
export function useReceived() {
  const { account } = useAccount();
  const address = account?.address;
  const [received, setReceived] = useState<ReceivedTransfer[] | null>(null);

  useEffect(() => {
    if (!address || !indexerUrl) return;
    let cancelled = false;
    indexerReceivedBy(address)
      .then((r) => !cancelled && setReceived(r))
      .catch(() => !cancelled && setReceived(null));
    return () => {
      cancelled = true;
    };
  }, [address]);

  return received;
}

/** Totals over sent links. Self-collected links are counted as sent; this is the user's own view. */
export function sentTotals(links: MyLink[], stateOf: (l: MyLink) => LinkState) {
  let sent = BigInt(0);
  let collected = 0;
  let waiting = 0;
  for (const l of links) {
    const state = stateOf(l);
    if (state !== "cancelled") sent += BigInt(l.amount);
    if (state === "claimed") collected += 1;
    if (state === "waiting" || state === "expired") waiting += 1;
  }
  return { count: links.length, sent, collected, waiting };
}

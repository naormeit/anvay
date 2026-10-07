"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isAddressEqual } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseClaimFragment, signClaim } from "@/lib/claimLink";
import { ESCROW_ADDRESS, explorerTx, publicClient } from "@/lib/config";
import { escrowAbi, toTransfer, TransferStatus, type OnchainTransfer } from "@/lib/contracts";
import { formatInr, formatUsd } from "@/lib/format";
import { useAccount } from "@/lib/account";
import { useInrRate, useLocationHash } from "@/lib/hooks";
import { SignIn } from "@/components/SignIn";
import { Button, Card, Notice, Shell } from "@/components/ui";

type Loaded = { transfer: OnchainTransfer; keyMatches: boolean; expired: boolean } | { error: string };

export default function ClaimPage() {
  const hash = useLocationHash();
  const link = useMemo(() => parseClaimFragment(hash), [hash]);
  const { ready, account, settingUp } = useAccount();
  const address = account?.address;
  const inrPerUsd = useInrRate();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: string; amount: bigint } | null>(null);

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    publicClient
      .readContract({ address: ESCROW_ADDRESS, abi: escrowAbi, functionName: "transfers", args: [link.id] })
      .then((raw) => {
        const transfer = toTransfer(raw);
        const keyMatches = isAddressEqual(privateKeyToAccount(link.key).address, transfer.claimKey);
        const expired = BigInt(Math.floor(Date.now() / 1000)) > transfer.expiresAt;
        if (!cancelled) setLoaded({ transfer, keyMatches, expired });
      })
      .catch(() => !cancelled && setLoaded({ error: "We could not load this link. Check your connection and try again." }));
    return () => {
      cancelled = true;
    };
  }, [link]);

  async function claim() {
    if (!link || !address) return;
    setClaiming(true);
    setError(null);
    try {
      const signature = await signClaim(link.key, link.id, address);
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: link.id.toString(), recipient: address, signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setDone({ hash: data.hash, amount: BigInt(data.amount) });
      // The link is used up; remove the key from the address bar and browser history.
      window.history.replaceState(null, "", "/claim");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setClaiming(false);
    }
  }

  if (done) {
    return (
      <Shell>
        <Card className="flex flex-col gap-3 text-center">
          <p className="text-sm text-muted">Collected</p>
          <p className="text-4xl font-semibold text-success">{formatUsd(done.amount)}</p>
          <p className="text-sm text-muted">The money is in your Anvay balance.</p>
          <Link href="/" className="grid h-11 place-items-center rounded-xl bg-accent text-sm font-medium text-accent-foreground">
            See my balance
          </Link>
          <a href={explorerTx(done.hash)} target="_blank" rel="noopener noreferrer" className="text-xs text-muted underline">
            Receipt
          </a>
        </Card>
      </Shell>
    );
  }

  if (!link) {
    return (
      <Shell>
        <Card>
          <p className="font-medium">This link is incomplete</p>
          <Notice>Ask the sender to share the full link again.</Notice>
        </Card>
      </Shell>
    );
  }

  if (!loaded) {
    return (
      <Shell>
        <Notice>Opening your link…</Notice>
      </Shell>
    );
  }

  if ("error" in loaded) {
    return (
      <Shell>
        <Notice tone="danger">{loaded.error}</Notice>
      </Shell>
    );
  }

  const { transfer, keyMatches, expired } = loaded;
  const problem =
    transfer.status === TransferStatus.None || !keyMatches
      ? "This link is not valid. Ask the sender to share it again."
      : transfer.status === TransferStatus.Claimed
        ? "This money has already been collected."
        : transfer.status === TransferStatus.Cancelled
          ? "The sender cancelled this payment."
          : expired
            ? "This link has expired. Ask the sender to send a new one."
            : null;

  return (
    <Shell>
      <Card className="flex flex-col gap-4 text-center">
        <p className="text-sm text-muted">Someone sent you</p>
        <div>
          <p className="text-5xl font-semibold tracking-tight">{formatUsd(transfer.amount)}</p>
          {inrPerUsd && <p className="mt-1 text-muted">About {formatInr(transfer.amount, inrPerUsd)}</p>}
        </div>
        {problem ? (
          <Notice tone="danger">{problem}</Notice>
        ) : !ready ? (
          <Notice>Loading…</Notice>
        ) : settingUp ? (
          <Notice>Setting up your account…</Notice>
        ) : !address ? (
          <div className="flex flex-col gap-3 text-left">
            <Notice>Sign in to collect it. New here? This creates your Anvay account. Nothing to install.</Notice>
            <SignIn emailLabel="Use Google or email instead" />
          </div>
        ) : (
          <Button onClick={claim} disabled={claiming}>
            {claiming ? "Collecting…" : `Collect ${formatUsd(transfer.amount)}`}
          </Button>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>
    </Shell>
  );
}

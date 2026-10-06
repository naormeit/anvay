"use client";

import { useState } from "react";
import type { Address } from "viem";
import { isMainnet } from "@/lib/config";
import { formatInr, formatUsd } from "@/lib/format";
import { Button, Card, Notice } from "./ui";

export function BalanceCard({
  address,
  balance,
  inrPerUsd,
  onChange,
}: {
  address: Address;
  balance: bigint | null;
  inrPerUsd: number | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getTestDollars() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="text-sm text-muted">Your balance</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight">{balance === null ? "…" : formatUsd(balance)}</p>
      {balance !== null && inrPerUsd && (
        <p className="text-sm text-muted">About {formatInr(balance, inrPerUsd)}</p>
      )}
      {!isMainnet && (
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="secondary" onClick={getTestDollars} disabled={busy}>
            {busy ? "Adding test dollars…" : "Add $100 test dollars"}
          </Button>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      )}
    </Card>
  );
}

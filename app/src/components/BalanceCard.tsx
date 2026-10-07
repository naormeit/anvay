"use client";

import { useState } from "react";
import type { Address } from "viem";
import { isMainnet } from "@/lib/config";
import { formatInr, formatUsd } from "@/lib/format";
import { Button } from "./ui";

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
    <section className="hero-gradient relative overflow-hidden rounded-2xl p-5 shadow-soft">
      <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      <p className="relative text-sm opacity-80">Your balance</p>
      <p className="relative mt-1 text-4xl font-semibold tracking-tight tabular-nums">
        {balance === null ? "…" : formatUsd(balance)}
      </p>
      {balance !== null && inrPerUsd && (
        <p className="relative text-sm opacity-85">About {formatInr(balance, inrPerUsd)}</p>
      )}
      {!isMainnet && (
        <div className="relative mt-4 flex flex-col gap-2">
          <Button
variant="glass" onClick={getTestDollars} disabled={busy}>
            {busy ? "Adding test dollars…" : "Add $100 test dollars"}
          </Button>
          {error && <p className="text-sm font-medium">{error}</p>}
        </div>
      )}
    </section>
  );
}

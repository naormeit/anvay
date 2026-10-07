"use client";

import { useState } from "react";
import { formatInr, formatUsd, inrToUsdUnits, parseInr, parseUsd } from "@/lib/format";
import { useInrRateSource } from "@/lib/hooks";
import { useCreateLink, type CreatedLink } from "@/lib/useCreateLink";
import { LinkReady } from "./LinkReady";
import { LinkIcon } from "./icons";
import { Button, Card, CardTitle, Notice } from "./ui";

type Currency = "USD" | "INR";

/** Dollar token units for what the user typed, or null if it is not a valid amount yet. */
function toUnits(input: string, currency: Currency, inrPerUsd: number | null): bigint | null {
  if (currency === "USD") return parseUsd(input);
  const rupees = parseInr(input);
  if (rupees === null || !inrPerUsd) return null;
  const units = inrToUsdUnits(rupees, inrPerUsd);
  return units > BigInt(0) ? units : null;
}

export function SendCard({
  balance,
  inrPerUsd,
  onSent,
}: {
  balance: bigint | null;
  inrPerUsd: number | null;
  onSent: () => void;
}) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const { createLink, step, busy } = useCreateLink();
  const rateSource = useInrRateSource();

  const units = toUnits(amountInput, currency, inrPerUsd);
  const equivalent =
    units === null || !inrPerUsd
      ? null
      : currency === "USD"
        ? `About ${formatInr(units, inrPerUsd)}`
        : `Sends ${formatUsd(units)}`;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (currency === "INR" && !inrPerUsd) return setError("Rupee rates are unavailable right now. Switch to dollars.");
    if (!units) return setError(currency === "USD" ? "Enter an amount, like 25 or 25.50." : "Enter an amount, like 5000.");
    if (balance !== null && units > balance) return setError("You don't have enough dollars for that.");
    try {
      setCreated(await createLink(units, note));
      setAmountInput("");
      setNote("");
      onSent();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (created) return <LinkReady link={created} inrPerUsd={inrPerUsd} onDone={() => setCreated(null)} />;

  return (
    <Card>
      <form onSubmit={send} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <CardTitle icon={<LinkIcon className="h-4 w-4" />}>Send money</CardTitle>
          <div className="flex rounded-lg border border-border p-0.5 text-sm" role="group" aria-label="Currency">
            {(["USD", "INR"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                aria-pressed={currency === c}
                className={`rounded-md px-3 py-2 ${currency === c ? "bg-accent text-accent-foreground" : "text-muted"}`}
                disabled={busy}
              >
                {c === "USD" ? "$ USD" : "₹ INR"}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-border px-3 focus-within:border-accent">
          <span className="text-2xl text-muted">{currency === "USD" ? "$" : "₹"}</span>
          <input
            inputMode="decimal"
            placeholder={currency === "USD" ? "0.00" : "0"}
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="h-14 w-full bg-transparent text-2xl outline-none"
            aria-label={currency === "USD" ? "Amount in dollars" : "Amount in rupees"}
            disabled={busy}
          />
        </label>
        {equivalent && (
          <Notice>
            {equivalent} at today&apos;s rate{rateSource === "chainlink" && " (via Chainlink on Monad)"}
          </Notice>
        )}
        <input
          placeholder="Who is it for? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={40}
          className="h-11 rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus:border-accent"
          disabled={busy}
        />
        <Button type="submit" disabled={busy}>
          {step === "approving" ? "Preparing…" : step === "sending" ? "Creating link…" : "Create payment link"}
        </Button>
        {error && <Notice tone="danger">{error}</Notice>}
      </form>
    </Card>
  );
}

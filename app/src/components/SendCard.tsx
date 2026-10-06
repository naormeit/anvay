"use client";

import { useState } from "react";
import { encodeFunctionData, parseEventLogs, type Address } from "viem";
import { buildClaimUrl, newLinkKey } from "@/lib/claimLink";
import { AUSD_ADDRESS, ESCROW_ADDRESS, LINK_LIFETIME_SECONDS, publicClient } from "@/lib/config";
import { ausdAbi, escrowAbi } from "@/lib/contracts";
import { formatUsd, parseUsd } from "@/lib/format";
import { saveSentLink, type SentLink } from "@/lib/sentLinks";
import { useSendTx } from "@/lib/useSendTx";
import { Button, Card, Notice } from "./ui";
import { ShareLink } from "./ShareLink";

type Step = "idle" | "approving" | "sending" | "done";

export function SendCard({
  address,
  balance,
  onSent,
}: {
  address: Address;
  balance: bigint | null;
  onSent: () => void;
}) {
  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; amount: bigint; note: string } | null>(null);
  const { submit, confirm } = useSendTx(address);

  const busy = step === "approving" || step === "sending";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseUsd(amountInput);
    if (!amount) return setError("Enter an amount, like 25 or 25.50.");
    if (balance !== null && amount > balance) return setError("You don't have enough dollars for that.");

    try {
      const allowance = await publicClient.readContract({
        address: AUSD_ADDRESS,
        abi: ausdAbi,
        functionName: "allowance",
        args: [address, ESCROW_ADDRESS],
      });
      if (allowance < amount) {
        setStep("approving");
        await confirm(
          await submit(
            AUSD_ADDRESS,
            encodeFunctionData({ abi: ausdAbi, functionName: "approve", args: [ESCROW_ADDRESS, amount] }),
          ),
        );
      }

      setStep("sending");
      const link = newLinkKey();
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + LINK_LIFETIME_SECONDS);
      const hash = await submit(
        ESCROW_ADDRESS,
        encodeFunctionData({ abi: escrowAbi, functionName: "deposit", args: [amount, link.address, expiresAt] }),
      );

      // Save the link key before waiting, so it is never lost if the page closes mid-send.
      const record: SentLink = {
        id: null,
        key: link.key,
        amount: amount.toString(),
        note: note.trim(),
        depositHash: hash,
        createdAt: Date.now(),
      };
      saveSentLink(address, record);

      const receipt = await confirm(hash);
      const [deposited] = parseEventLogs({ abi: escrowAbi, eventName: "Deposited", logs: receipt.logs });
      const id = deposited.args.id;
      saveSentLink(address, { ...record, id: id.toString() });

      setCreated({ url: buildClaimUrl(window.location.origin, id, link.key), amount, note: record.note });
      setStep("done");
      setAmountInput("");
      setNote("");
      onSent();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("idle");
    }
  }

  if (step === "done" && created) {
    return (
      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-muted">Link ready</p>
          <p className="text-2xl font-semibold">{formatUsd(created.amount)} is on its way</p>
          {created.note && <p className="text-sm text-muted">For {created.note}</p>}
        </div>
        <ShareLink url={created.url} amount={created.amount} />
        <Notice>Anyone with this link can collect the money, so only send it to the person you are paying.</Notice>
        <Button variant="secondary" onClick={() => setStep("idle")}>
          Send more
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={send} className="flex flex-col gap-3">
        <p className="font-medium">Send money</p>
        <label className="flex items-center gap-2 rounded-xl border border-border px-3 focus-within:border-accent">
          <span className="text-2xl text-muted">$</span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="h-14 w-full bg-transparent text-2xl outline-none"
            aria-label="Amount in dollars"
            disabled={busy}
          />
        </label>
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

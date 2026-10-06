"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { formatInr, formatUsd } from "@/lib/format";
import { useCreateLink, type CreatedLink } from "@/lib/useCreateLink";
import { LinkReady } from "./LinkReady";
import { Button, Card, Notice } from "./ui";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Draft = { units: bigint; amount: number; currency: "USD" | "INR"; recipient: string | null; text?: string };

const EXAMPLES = ["Send ₹5,000 to Mom", "Papa ko 2 hazaar bhej do"];

function describe(draft: Draft) {
  const original =
    draft.currency === "INR"
      ? draft.amount.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })
      : draft.amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return `${original}${draft.recipient ? ` to ${draft.recipient}` : ""}`;
}

export function AssistantCard({
  address,
  balance,
  inrPerUsd,
  onSent,
}: {
  address: Address;
  balance: bigint | null;
  inrPerUsd: number | null;
  onSent: () => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const { createLink, step, busy } = useCreateLink(address);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assistant")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => !cancelled && setEnabled(Boolean(d.enabled)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function ask(text: string) {
    const content = text.trim();
    if (!content || thinking) return;
    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    setDraft(null);
    setError(null);
    setThinking(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (data.type === "draft") {
        const next: Draft = {
          units: BigInt(data.units),
          amount: data.amount,
          currency: data.currency,
          recipient: data.recipient,
          text: data.text,
        };
        setDraft(next);
        setMessages([...history, { role: "assistant", content: `Drafted a payment of ${describe(next)}.` }]);
      } else {
        setMessages([...history, { role: "assistant", content: data.text }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setThinking(false);
    }
  }

  async function confirm() {
    if (!draft) return;
    if (balance !== null && draft.units > balance) return setError("You don't have enough dollars for that.");
    setError(null);
    try {
      setCreated(await createLink(draft.units, draft.recipient ?? ""));
      // Keep the conversation so "next" / "now Papa" can continue a multi-payment request.
      const done = `Link created for ${describe(draft)}.${draft.text ? ` ${draft.text}` : ""}`;
      setMessages((m) => [...m, { role: "assistant", content: done }]);
      setDraft(null);
      onSent();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (!enabled) return null;
  if (created) return <LinkReady link={created} inrPerUsd={inrPerUsd} onDone={() => setCreated(null)} />;

  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-medium">Just say it</p>
        {messages.length > 0 && !busy && (
          <button
            onClick={() => {
              setMessages([]);
              setDraft(null);
              setError(null);
            }}
            className="-mr-2 rounded-lg px-2 py-2.5 text-sm text-muted hover:text-foreground"
          >
            Start over
          </button>
        )}
      </div>

      {draft ? (
        <div className="flex flex-col gap-3 rounded-xl border border-accent p-4">
          <div>
            <p className="text-sm text-muted">Send{draft.recipient ? ` to ${draft.recipient}` : ""}</p>
            <p className="text-3xl font-semibold tracking-tight">{formatUsd(draft.units)}</p>
            {inrPerUsd && <p className="text-sm text-muted">About {formatInr(draft.units, inrPerUsd)} at today&apos;s rate</p>}
          </div>
          {draft.text && <p className="text-sm">{draft.text}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={busy}>
              Change
            </Button>
            <Button onClick={confirm} disabled={busy}>
              {step === "approving" ? "Preparing…" : step === "sending" ? "Creating link…" : "Confirm"}
            </Button>
          </div>
        </div>
      ) : (
        lastReply && <p className="rounded-xl bg-background px-3 py-2 text-sm">{lastReply.content}</p>
      )}

      {!draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send ₹5,000 to Mom"
            maxLength={400}
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus:border-accent"
            disabled={thinking}
            aria-label="Tell Anvay what to send"
          />
          <Button type="submit" disabled={thinking || !input.trim()}>
            {thinking ? "…" : "Go"}
          </Button>
        </form>
      )}

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => ask(ex)}
              className="rounded-full border border-border px-3 py-2 text-sm text-muted hover:text-foreground"
              disabled={thinking}
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </Card>
  );
}

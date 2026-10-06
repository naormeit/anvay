"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/format";
import { Button } from "./ui";

export function ShareLink({ url, amount }: { url: string; amount: bigint }) {
  const [copied, setCopied] = useState(false);
  const message = `I sent you ${formatUsd(amount)} with Anvay. Tap to collect it: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="secondary" onClick={copy}>
        {copied ? "Copied" : "Copy link"}
      </Button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="grid h-11 place-items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90"
      >
        Share on WhatsApp
      </a>
    </div>
  );
}

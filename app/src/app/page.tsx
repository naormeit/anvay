"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { AssistantCard } from "@/components/AssistantCard";
import { BalanceCard } from "@/components/BalanceCard";
import { SendCard } from "@/components/SendCard";
import { SentList } from "@/components/SentList";
import { Button, Card, Notice, Shell } from "@/components/ui";
import { useDollarBalance, useEmbeddedWallet, useInrRate } from "@/lib/hooks";

export default function Home() {
  const { ready, authenticated, login } = usePrivy();
  const { address } = useEmbeddedWallet();
  const { balance, refresh } = useDollarBalance(address);
  const [sentCount, setSentCount] = useState(0);
  const inrPerUsd = useInrRate();

  if (!ready) {
    return (
      <Shell>
        <Notice>Loading…</Notice>
      </Shell>
    );
  }

  if (!authenticated) {
    return (
      <Shell>
        <section className="flex flex-col gap-4 pt-8">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Send dollars home with a link.</h1>
          <p className="text-muted">
            Type an amount, share the link on WhatsApp, and your family collects it in seconds. No bank details, no
            waiting days, almost no fees.
          </p>
          <Button onClick={login} className="mt-2">
            Get started with email or phone
          </Button>
        </section>
        <Card className="mt-6">
          <ol className="flex flex-col gap-3 text-sm">
            <li>
              <span className="font-medium">1. Add dollars.</span> <span className="text-muted">Your balance stays in US dollars.</span>
            </li>
            <li>
              <span className="font-medium">2. Create a link.</span> <span className="text-muted">Pick an amount and who it is for.</span>
            </li>
            <li>
              <span className="font-medium">3. They tap to collect.</span>{" "}
              <span className="text-muted">They sign in with their phone or email. Nothing to install.</span>
            </li>
          </ol>
        </Card>
      </Shell>
    );
  }

  if (!address) {
    return (
      <Shell>
        <Notice>Setting up your account…</Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <BalanceCard address={address} balance={balance} inrPerUsd={inrPerUsd} onChange={refresh} />
      <AssistantCard
        address={address}
        balance={balance}
        inrPerUsd={inrPerUsd}
        onSent={() => {
          refresh();
          setSentCount((c) => c + 1);
        }}
      />
      <SendCard
        address={address}
        balance={balance}
        inrPerUsd={inrPerUsd}
        onSent={() => {
          refresh();
          setSentCount((c) => c + 1);
        }}
      />
      <SentList key={`${address}:${sentCount}`} address={address} onChange={refresh} />
    </Shell>
  );
}

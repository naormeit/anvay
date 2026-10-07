"use client";

import { useState } from "react";
import { AssistantCard } from "@/components/AssistantCard";
import { BalanceCard } from "@/components/BalanceCard";
import { SendCard } from "@/components/SendCard";
import { SentList } from "@/components/SentList";
import { Landing } from "@/components/Landing";
import { Notice, Shell } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { useDollarBalance, useInrRate } from "@/lib/hooks";

export default function Home() {
  const { ready, account, settingUp } = useAccount();
  const address = account?.address;
  const { balance, refresh } = useDollarBalance(address);
  const [sentCount, setSentCount] = useState(0);
  const inrPerUsd = useInrRate();

  if (!ready) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center py-24" aria-label="Loading">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-accent" />
        </div>
      </Shell>
    );
  }

  if (settingUp) {
    return (
      <Shell>
        <Notice>Setting up your account…</Notice>
      </Shell>
    );
  }

  if (!account || !address) return <Landing />;

  const onSent = () => {
    refresh();
    setSentCount((c) => c + 1);
  };

  return (
    <Shell>
      <BalanceCard address={address} balance={balance} inrPerUsd={inrPerUsd} onChange={refresh} />
      <AssistantCard balance={balance} inrPerUsd={inrPerUsd} onSent={onSent} />
      <SendCard balance={balance} inrPerUsd={inrPerUsd} onSent={onSent} />
      <SentList key={`${address}:${sentCount}`} onChange={refresh} />
    </Shell>
  );
}

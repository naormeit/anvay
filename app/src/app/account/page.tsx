"use client";

import { useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { BalanceCard } from "@/components/BalanceCard";
import { InstallApp } from "@/components/InstallApp";
import { ArrowRightIcon, ChartIcon, CheckIcon, FingerprintIcon, KeyIcon, ShieldIcon } from "@/components/icons";
import { SignedInOnly } from "@/components/SignedInOnly";
import { Avatar, Button, Card, CardTitle, GITHUB_URL, Shell } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { explorerAddress, isMainnet } from "@/lib/config";
import { formatUsd } from "@/lib/format";
import { useDollarBalance, useInrRate } from "@/lib/hooks";
import { sentTotals, useMyLinks, useReceived } from "@/lib/useMyLinks";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium">{children}</span>
    </div>
  );
}

function AccountView() {
  const { account, signOut } = useAccount();
  const { user } = usePrivy();
  const { balance, refresh } = useDollarBalance(account?.address);
  const inrPerUsd = useInrRate();
  const { links, stateOf } = useMyLinks();
  const received = useReceived();
  const [copied, setCopied] = useState(false);
  if (!account) return null;

  const totals = sentTotals(links, stateOf);
  const receivedTotal = (received ?? []).reduce((sum, r) => sum + BigInt(r.amount), BigInt(0));
  const isPasskey = account.kind === "mera";
  const contact = user?.email?.address ?? user?.phone?.number ?? null;
  const short = `${account.address.slice(0, 6)}…${account.address.slice(-4)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(account!.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable; the address is still shown
    }
  }

  return (
    <Shell>
      <section className="tint-warm flex items-center gap-4 rounded-2xl border p-5 shadow-soft">
        <Avatar address={account.address} size="h-14 w-14 text-base" />
        <div className="flex min-w-0 flex-col">
          <h1 className="text-xl font-semibold tracking-tight">Your account</h1>
          <p className="truncate text-sm text-muted">
            {isPasskey ? "Signed in with a passkey" : contact ? `Signed in as ${contact}` : "Signed in with email or phone"}
          </p>
        </div>
      </section>

      <BalanceCard address={account.address} balance={balance} inrPerUsd={inrPerUsd} onChange={refresh} />

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Sent", value: formatUsd(totals.sent), tint: "tint-warm" },
          { label: "Links", value: String(totals.count), tint: "tint-amber" },
          { label: "Collected", value: received ? formatUsd(receivedTotal) : "–", tint: "tint-rose" },
        ].map((s) => (
          <div key={s.label} className={`flex flex-col gap-0.5 rounded-2xl border p-3 shadow-soft ${s.tint}`}>
            <p className="text-xs text-muted">{s.label}</p>
            <p className="truncate text-lg font-semibold tracking-tight tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <Card tint="neutral" className="flex flex-col">
        <CardTitle icon={<KeyIcon className="h-4 w-4" />}>Account details</CardTitle>
        <div className="mt-2 flex flex-col divide-y divide-border">
          <Row label="Sign-in">
            <span className="flex items-center gap-1.5">
              {isPasskey && <FingerprintIcon className="h-4 w-4 text-accent" />}
              {isPasskey ? "Passkey (Mera)" : "Email or phone (Privy)"}
            </span>
          </Row>
          <Row label="Wallet address">
            <button onClick={copy} className="flex items-center gap-1.5 font-mono text-xs hover:text-accent">
              {copied ? <CheckIcon className="h-3.5 w-3.5 text-success" /> : null}
              {copied ? "Copied" : short}
            </button>
          </Row>
          <Row label="Network">Monad{isMainnet ? "" : " testnet"}</Row>
          <Row label="On the explorer">
            <a
              href={explorerAddress(account.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-accent hover:underline"
            >
              MonadVision <ArrowRightIcon className="h-3.5 w-3.5" />
            </a>
          </Row>
        </div>
      </Card>

      <Card tint="amber" className="flex flex-col gap-3">
        <CardTitle icon={<ShieldIcon className="h-4 w-4" />}>How your account is protected</CardTitle>
        {isPasskey ? (
          <ul className="flex flex-col gap-2 text-sm text-muted">
            <li>Your passkey (fingerprint, face or screen lock) is the only key. Anvay never stores it.</li>
            <li>Signing in with it on another device opens the same account and rebuilds every link you&apos;ve sent.</li>
            <li>Notes like &quot;Papa&quot; are encrypted with a key that only your passkey can recreate.</li>
          </ul>
        ) : (
          <ul className="flex flex-col gap-2 text-sm text-muted">
            <li>Your wallet is created and secured by Privy, and only you can use it after signing in.</li>
            <li>Links you send are saved on this device. To open them anywhere, use a passkey account instead.</li>
          </ul>
        )}
      </Card>

      <InstallApp />

      <div className="flex flex-col gap-2">
        <Link
          href="/stats"
          className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-soft hover:bg-background"
        >
          <span className="flex items-center gap-2">
            <ChartIcon className="h-4 w-4 text-accent" /> Anvay&apos;s live stats
          </span>
          <ArrowRightIcon className="h-4 w-4 text-muted" />
        </Link>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm shadow-soft hover:bg-background"
        >
          <span className="flex items-center gap-2">
            <KeyIcon className="h-4 w-4 text-accent" /> Code and security model on GitHub
          </span>
          <ArrowRightIcon className="h-4 w-4 text-muted" />
        </a>
      </div>

      <Button variant="danger" onClick={signOut}>
        Sign out of Anvay
      </Button>
    </Shell>
  );
}

export default function AccountPage() {
  return (
    <SignedInOnly title="Your account">
      <AccountView />
    </SignedInOnly>
  );
}

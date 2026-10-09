"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/lib/account";
import { ESCROW_ADDRESS, explorerAddress, isMainnet } from "@/lib/config";

export const GITHUB_URL = "https://github.com/naormeit/anvay";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg shadow-soft" priority />
      Anvay
      {!isMainnet && (
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted">test mode</span>
      )}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="mt-12 flex flex-col items-center gap-2 border-t border-border pt-6 text-xs text-muted">
      <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <Link href="/stats" className="hover:text-foreground">
          Live stats
        </Link>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
          GitHub
        </a>
        <a href={explorerAddress(ESCROW_ADDRESS)} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
          Escrow contract
        </a>
      </nav>
      <p>{isMainnet ? "Built on Monad." : "Test mode on Monad testnet. Test dollars have no real value."}</p>
    </footer>
  );
}

/** A round gradient badge for an address. The second colour (rose to amber) comes from the address, so it stays the same. */
export function Avatar({ address, size = "h-9 w-9 text-xs" }: { address: string; size?: string }) {
  const hue = (330 + (parseInt(address.slice(2, 6), 16) % 75)) % 360;
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-soft ${size}`}
      style={{ background: `linear-gradient(135deg, var(--hero-from), hsl(${hue} 70% 45%))` }}
      aria-hidden="true"
    >
      {address.slice(2, 4).toUpperCase()}
    </span>
  );
}

const tabs = [
  { href: "/", label: "Home" },
  { href: "/activity", label: "Activity" },
  { href: "/account", label: "Account" },
];

function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-4 flex gap-1 rounded-2xl border border-border bg-card/70 p-1 shadow-soft backdrop-blur" aria-label="App">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 rounded-xl py-2 text-center text-sm transition ${
              active ? "hero-gradient font-medium shadow-soft" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const { account, settingUp, signOut } = useAccount();
  const signedIn = Boolean(account || settingUp);
  return (
    <div className={`${signedIn ? "page-glow-strong" : "page-glow"} flex flex-1 flex-col`}>
      <div className={`mx-auto flex w-full flex-1 flex-col px-4 pb-8 ${wide ? "max-w-3xl" : "max-w-md"}`}>
        <header className="flex items-center justify-between py-5">
          <Logo />
          <div className="-mr-2 flex items-center gap-1">
            {!signedIn && (
              <Link href="/stats" className="rounded-lg px-2 py-2.5 text-sm text-muted hover:text-foreground">
                Stats
              </Link>
            )}
            {signedIn && (
              <button onClick={signOut} className="rounded-lg px-2 py-2.5 text-sm text-muted hover:text-foreground">
                Sign out
              </button>
            )}
            {account && (
              <Link href="/account" aria-label="Your account" className="ml-1 rounded-full">
                <Avatar address={account.address} />
              </Link>
            )}
          </div>
        </header>
        {account && <TabNav />}
        <main className="flex flex-1 flex-col gap-4">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

export function Card({
  children,
  className = "",
  tint,
}: {
  children: React.ReactNode;
  className?: string;
  tint?: "warm" | "amber" | "rose" | "neutral";
}) {
  const surface = tint ? `tint-${tint}` : "border-border bg-card";
  return <section className={`rounded-2xl border p-5 shadow-soft ${surface} ${className}`}>{children}</section>;
}

export function CardTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-medium">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-accent">{icon}</span>
      {children}
    </p>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "glass" };

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-accent text-accent-foreground hover:opacity-90",
    secondary: "border border-border bg-card hover:bg-background",
    danger: "border border-border text-danger hover:bg-background",
    glass: "border border-white/25 bg-white/15 text-hero-foreground hover:bg-white/25",
  }[variant];
  return (
    <button
      {...props}
      className={`h-11 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Notice({ tone = "muted", children }: { tone?: "muted" | "danger" | "success"; children: React.ReactNode }) {
  const color = { muted: "text-muted", danger: "text-danger", success: "text-success" }[tone];
  return <p className={`text-sm break-words ${color}`}>{children}</p>;
}

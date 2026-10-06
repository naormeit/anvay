"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { isMainnet } from "@/lib/config";

export function Shell({ children }: { children: React.ReactNode }) {
  const { authenticated, logout } = usePrivy();
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10">
      <header className="flex items-center justify-between py-5">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground">A</span>
          Anvay
          {!isMainnet && (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted">
              test mode
            </span>
          )}
        </Link>
        {authenticated && (
          <button onClick={logout} className="-mr-2 rounded-lg px-2 py-2.5 text-sm text-muted hover:text-foreground">
            Sign out
          </button>
        )}
      </header>
      <main className="flex flex-1 flex-col gap-4">{children}</main>
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-card p-5 ${className}`}>{children}</section>;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" };

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-accent text-accent-foreground hover:opacity-90",
    secondary: "border border-border bg-card hover:bg-background",
    danger: "border border-border text-danger hover:bg-background",
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
  return <p className={`text-sm ${color}`}>{children}</p>;
}

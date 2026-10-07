"use client";

import { useAccount } from "@/lib/account";
import { SignIn } from "./SignIn";
import { Card, Shell } from "./ui";

/** Renders `children` for a signed-in account, otherwise a loader or a sign-in card. */
export function SignedInOnly({ title, children }: { title: string; children: React.ReactNode }) {
  const { ready, account, settingUp } = useAccount();
  if (!ready || settingUp) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center py-24" aria-label="Loading">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-accent" />
        </div>
      </Shell>
    );
  }
  if (!account) {
    return (
      <Shell>
        <Card tint="warm" className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted">Sign in to see this page.</p>
          </div>
          <SignIn />
        </Card>
      </Shell>
    );
  }
  return <>{children}</>;
}

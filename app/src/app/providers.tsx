"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { chain } from "@/lib/config";

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return (
      <main className="mx-auto max-w-md p-6 text-sm">
        Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> in <code>app/.env.local</code>, then restart the dev server.
      </main>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "sms"],
        appearance: { accentColor: "#c2410c", landingHeader: "Sign in to Anvay" },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      {children}
    </PrivyProvider>
  );
}

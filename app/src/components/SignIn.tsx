"use client";

import { useState } from "react";
import { useAccount } from "@/lib/account";
import { Button, Notice } from "./ui";

/**
 * Passkey (Mera) sign-in first. Google, email or phone (Privy) sits behind "Other ways to sign in", and opens by
 * itself when a passkey fails, for devices whose passkeys can't create an Anvay account.
 */
export function SignIn({ emailLabel = "Continue with Google or email" }: { emailLabel?: string }) {
  const { loginWithEmail, loginWithPasskey, hasUsedPasskey } = useAccount();
  const [busy, setBusy] = useState<"create" | "signin" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);

  async function passkey(mode: "create" | "signin") {
    setBusy(mode);
    setError(null);
    try {
      await loginWithPasskey(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey sign-in failed.");
      setShowOther(true);
    } finally {
      setBusy(null);
    }
  }

  const primaryMode = hasUsedPasskey ? "signin" : "create";
  const secondaryMode = hasUsedPasskey ? "create" : "signin";

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => passkey(primaryMode)} disabled={busy !== null}>
        {busy === primaryMode
          ? "Waiting for your passkey…"
          : hasUsedPasskey
            ? "Sign in with your passkey"
            : "Create an account with a passkey"}
      </Button>
      <button
        onClick={() => passkey(secondaryMode)}
        disabled={busy !== null}
        className="rounded-lg py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
      >
        {busy === secondaryMode
          ? "Waiting for your passkey…"
          : hasUsedPasskey
            ? "Create a new passkey account instead"
            : "I already have an Anvay passkey"}
      </button>
      {error && <Notice tone="danger">{error}</Notice>}
      {showOther ? (
        <Button variant="secondary" onClick={loginWithEmail} disabled={busy !== null}>
          {emailLabel}
        </Button>
      ) : (
        <button
          onClick={() => setShowOther(true)}
          className="rounded-lg py-1 text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          Other ways to sign in
        </button>
      )}
      <p className="text-xs text-muted">
        A passkey is your fingerprint, face or screen lock. Nothing to remember, and it works on your other devices
        too. Phone number sign-in works for US and Canadian numbers only; in India, use a passkey, Google or email.
      </p>
    </div>
  );
}

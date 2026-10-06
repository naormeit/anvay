"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePrivy, useSendTransaction } from "@privy-io/react-auth";
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { createWalletClient, http, parseGwei, type Address, type Hex } from "viem";
import { chain, publicClient, rpcUrl } from "./config";
import { useEmbeddedWallet } from "./hooks";
import { deriveAnvayKeys, linkKeyForNonce } from "./meraKeys";

/**
 * One account interface for the whole app, backed by either:
 * - Privy: email/phone sign-in with an embedded wallet, or
 * - Mera: a passkey whose PRF output becomes the account key (and the claim-link and notes keys).
 */
export type Account = {
  kind: "privy" | "mera";
  address: Address;
  /** Sign and send a transaction. `nonce` is honoured for passkey accounts. */
  sendTx: (to: Address, data: Hex, opts?: { nonce?: number }) => Promise<Hex>;
  /** Passkey accounts only: re-derive the claim-link key for a deposit sent with this nonce. */
  linkKey?: (nonce: number) => Promise<Hex>;
  /** Passkey accounts only: AES-GCM key that seals local notes. */
  notesKey?: CryptoKey;
};

type MeraState = {
  session: Secp256k1SigningSession;
  address: Address;
  linkRoot: Uint8Array;
  notesKey: CryptoKey;
};

type AccountContextValue = {
  /** False until we know whether someone is signed in. */
  ready: boolean;
  /** Signed in and the account can transact. */
  account: Account | null;
  /** Signed in with Privy but the embedded wallet is still being created. */
  settingUp: boolean;
  loginWithEmail: () => void;
  /** Create a new passkey account, or sign in with an existing passkey. */
  loginWithPasskey: (mode: "create" | "signin") => Promise<void>;
  /** Whether this browser has used a passkey account here before. */
  hasUsedPasskey: boolean;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);
const PASSKEY_FLAG = "anvay:passkey-used";
const PASSKEY_EVENT = "anvay:passkey-flag";

function readPasskeyFlag() {
  try {
    return localStorage.getItem(PASSKEY_FLAG) === "1";
  } catch {
    return false;
  }
}

function subscribePasskeyFlag(callback: () => void) {
  window.addEventListener(PASSKEY_EVENT, callback);
  return () => window.removeEventListener(PASSKEY_EVENT, callback);
}

/**
 * Monad checks gas against account state from 3 blocks back, so a send right after receiving MON can be refused with
 * "insufficient balance", and the node then rejects that exact transaction again. Wait, then re-sign with a slightly
 * higher tip so it is a new transaction.
 */
async function sendWithFreshFundsRetry(send: (tipBumpGwei: number) => Promise<Hex>): Promise<Hex> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send(attempt);
    } catch (err) {
      const text = String((err as { details?: string }).details ?? (err as Error).message ?? err);
      if (attempt >= 3 || !/insufficient balance/i.test(text)) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

function passkeyErrorMessage(err: unknown) {
  if (isMeraError(err)) {
    if (err.code === "PRF_UNAVAILABLE") {
      return "This device's passkeys can't create an Anvay account yet. Try your phone, or sign in with email.";
    }
    if (err.code === "PASSKEY_OPERATION_FAILED") return "Passkey sign-in was cancelled or isn't available here.";
  }
  return "Passkey sign-in failed. Please try again.";
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const privy = usePrivy();
  const { address: privyAddress } = useEmbeddedWallet();
  const { sendTransaction } = useSendTransaction();
  const [mera, setMera] = useState<MeraState | null>(null);
  const hasUsedPasskey = useSyncExternalStore(subscribePasskeyFlag, readPasskeyFlag, () => false);
  const meraRef = useRef<MeraState | null>(null);
  useEffect(() => {
    meraRef.current = mera;
  }, [mera]);

  // Wipe passkey-derived keys from memory when the page goes away.
  useEffect(() => {
    const wipe = () => {
      meraRef.current?.session.end();
      meraRef.current?.linkRoot.fill(0);
    };
    window.addEventListener("pagehide", wipe);
    return () => window.removeEventListener("pagehide", wipe);
  }, []);

  const loginWithPasskey = useCallback(async (mode: "create" | "signin") => {
    const rpId = window.location.hostname;
    let prfOutput: Uint8Array;
    try {
      prfOutput =
        mode === "create"
          ? (
              await createPasskeyWithPrfOutput({
                rp: { id: rpId, name: "Anvay" },
                user: { name: "Anvay account", displayName: "Anvay" },
              })
            ).prfOutput
          : (await getPasskeyPrfOutput({ rpId })).prfOutput;
    } catch (err) {
      throw new Error(passkeyErrorMessage(err));
    }

    const keys = await deriveAnvayKeys(prfOutput);
    prfOutput.fill(0);
    const session = createSecp256k1SigningSession({ privateKey: keys.accountKey });
    keys.accountKey.fill(0);
    const address = toViemAccount(session).address;

    meraRef.current?.session.end();
    setMera({ session, address, linkRoot: keys.linkRoot, notesKey: keys.notesKey });
    try {
      localStorage.setItem(PASSKEY_FLAG, "1");
      window.dispatchEvent(new Event(PASSKEY_EVENT));
    } catch {
      // storage unavailable; only the "welcome back" shortcut is lost
    }
  }, []);

  const signOut = useCallback(async () => {
    if (meraRef.current) {
      meraRef.current.session.end();
      meraRef.current.linkRoot.fill(0);
      setMera(null);
      return;
    }
    await privy.logout();
  }, [privy]);

  const account = useMemo<Account | null>(() => {
    if (mera) {
      const wallet = createWalletClient({ account: toViemAccount(mera.session), chain, transport: http(rpcUrl) });
      return {
        kind: "mera",
        address: mera.address,
        sendTx: (to, data, opts) =>
          sendWithFreshFundsRetry(async (tipBumpGwei) => {
            if (tipBumpGwei === 0) return wallet.sendTransaction({ to, data, nonce: opts?.nonce });
            const fees = await publicClient.estimateFeesPerGas();
            const bump = parseGwei(String(tipBumpGwei));
            return wallet.sendTransaction({
              to,
              data,
              nonce: opts?.nonce,
              maxFeePerGas: fees.maxFeePerGas + bump,
              maxPriorityFeePerGas: fees.maxPriorityFeePerGas + bump,
            });
          }),
        linkKey: (nonce) => linkKeyForNonce(mera.linkRoot, nonce),
        notesKey: mera.notesKey,
      };
    }
    if (privy.authenticated && privyAddress) {
      return {
        kind: "privy",
        address: privyAddress,
        sendTx: async (to, data) =>
          (
            await sendTransaction(
              { to, data, chainId: chain.id },
              { address: privyAddress, uiOptions: { showWalletUIs: false } },
            )
          ).hash,
      };
    }
    return null;
  }, [mera, privy.authenticated, privyAddress, sendTransaction]);

  const value: AccountContextValue = {
    ready: privy.ready || mera !== null,
    account,
    settingUp: !mera && privy.authenticated && !privyAddress,
    loginWithEmail: () => privy.login(),
    loginWithPasskey,
    hasUsedPasskey,
    signOut,
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}

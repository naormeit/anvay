"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useWallets } from "@privy-io/react-auth";
import type { Address } from "viem";
import { AUSD_ADDRESS, publicClient } from "./config";
import { ausdAbi } from "./contracts";

/** The user's Privy embedded wallet, once it exists. */
export function useEmbeddedWallet() {
  const { wallets, ready } = useWallets();
  const wallet = wallets.find((w) => w.walletClientType === "privy");
  return { wallet, address: wallet?.address as Address | undefined, ready };
}

/** Dollar balance of `address`. Call `refresh` after anything that changes it. */
export function useDollarBalance(address: Address | undefined) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    publicClient
      .readContract({ address: AUSD_ADDRESS, abi: ausdAbi, functionName: "balanceOf", args: [address] })
      .then((b) => !cancelled && setBalance(b))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [address, version]);

  return { balance, refresh };
}

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

/** The URL fragment (after `#`). Empty during server rendering. */
export function useLocationHash() {
  return useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => "",
  );
}

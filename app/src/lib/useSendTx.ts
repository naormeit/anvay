"use client";

import type { Address, Hex } from "viem";
import { useAccount } from "./account";
import { publicClient } from "./config";

/** Send a transaction from the signed-in account (Privy or passkey) and wait for it to land. */
export function useSendTx() {
  const { account } = useAccount();

  async function submit(to: Address, data: Hex, opts?: { nonce?: number }) {
    if (!account) throw new Error("Your account is still being set up.");
    return account.sendTx(to, data, opts);
  }

  async function confirm(hash: Hex) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction failed.");
    return receipt;
  }

  return { submit, confirm };
}

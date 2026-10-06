"use client";

import { useSendTransaction } from "@privy-io/react-auth";
import type { Address, Hex } from "viem";
import { chain, publicClient } from "./config";

/** Send a transaction from the embedded wallet without wallet pop-ups, and wait for it to land. */
export function useSendTx(from: Address | undefined) {
  const { sendTransaction } = useSendTransaction();

  async function submit(to: Address, data: Hex) {
    if (!from) throw new Error("Your account is still being set up.");
    const { hash } = await sendTransaction(
      { to, data, chainId: chain.id },
      { address: from, uiOptions: { showWalletUIs: false } },
    );
    return hash;
  }

  async function confirm(hash: Hex) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction failed.");
    return receipt;
  }

  return { submit, confirm };
}

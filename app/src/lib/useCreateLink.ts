"use client";

import { useState } from "react";
import { encodeFunctionData, parseEventLogs, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useAccount } from "./account";
import { buildClaimUrl, newLinkKey } from "./claimLink";
import { AUSD_ADDRESS, ESCROW_ADDRESS, LINK_LIFETIME_SECONDS, publicClient } from "./config";
import { ausdAbi, escrowAbi } from "./contracts";
import { saveSealedNote } from "./myLinks";
import { saveSentLink, type SentLink } from "./sentLinks";
import { useSendTx } from "./useSendTx";

export type CreatedLink = { url: string; amount: bigint; note: string };
export type CreateStep = "idle" | "approving" | "sending";

/** Lock `amount` in the escrow behind a link key and return the shareable claim link. */
export function useCreateLink() {
  const [step, setStep] = useState<CreateStep>("idle");
  const { account } = useAccount();
  const { submit, confirm } = useSendTx();

  async function createLink(amount: bigint, note: string): Promise<CreatedLink> {
    if (!account) throw new Error("Your account is still being set up.");
    const address = account.address;
    try {
      const allowance = await publicClient.readContract({
        address: AUSD_ADDRESS,
        abi: ausdAbi,
        functionName: "allowance",
        args: [address, ESCROW_ADDRESS],
      });
      if (allowance < amount) {
        setStep("approving");
        await confirm(
          await submit(
            AUSD_ADDRESS,
            encodeFunctionData({ abi: ausdAbi, functionName: "approve", args: [ESCROW_ADDRESS, amount] }),
          ),
        );
      }

      setStep("sending");
      // Passkey accounts derive the link key from the passkey and the deposit's nonce, so it never needs storing.
      let linkKey: Hex;
      let nonce: number | undefined;
      if (account.kind === "mera" && account.linkKey) {
        nonce = await publicClient.getTransactionCount({ address, blockTag: "pending" });
        linkKey = await account.linkKey(nonce);
      } else {
        linkKey = newLinkKey().key;
      }

      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + LINK_LIFETIME_SECONDS);
      const hash = await submit(
        ESCROW_ADDRESS,
        encodeFunctionData({
          abi: escrowAbi,
          functionName: "deposit",
          args: [amount, privateKeyToAccount(linkKey).address, expiresAt],
        }),
        { nonce },
      );

      // Record the link before waiting, so it is never lost if the page closes mid-send.
      const trimmedNote = note.trim();
      let record: SentLink | null = null;
      if (nonce !== undefined && account.notesKey) {
        await saveSealedNote(address, account.notesKey, nonce, trimmedNote);
      } else {
        record = {
          id: null,
          key: linkKey,
          amount: amount.toString(),
          note: trimmedNote,
          depositHash: hash,
          createdAt: Date.now(),
        };
        saveSentLink(address, record);
      }

      const receipt = await confirm(hash);
      const [deposited] = parseEventLogs({ abi: escrowAbi, eventName: "Deposited", logs: receipt.logs });
      const id = deposited.args.id;
      if (record) saveSentLink(address, { ...record, id: id.toString() });

      return { url: buildClaimUrl(window.location.origin, id, linkKey), amount, note: trimmedNote };
    } finally {
      setStep("idle");
    }
  }

  return { createLink, step, busy: step !== "idle" };
}

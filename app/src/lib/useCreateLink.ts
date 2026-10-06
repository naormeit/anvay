"use client";

import { useState } from "react";
import { encodeFunctionData, parseEventLogs, type Address } from "viem";
import { buildClaimUrl, newLinkKey } from "./claimLink";
import { AUSD_ADDRESS, ESCROW_ADDRESS, LINK_LIFETIME_SECONDS, publicClient } from "./config";
import { ausdAbi, escrowAbi } from "./contracts";
import { saveSentLink, type SentLink } from "./sentLinks";
import { useSendTx } from "./useSendTx";

export type CreatedLink = { url: string; amount: bigint; note: string };
export type CreateStep = "idle" | "approving" | "sending";

/** Lock `amount` in the escrow behind a fresh link key and return the shareable claim link. */
export function useCreateLink(address: Address) {
  const [step, setStep] = useState<CreateStep>("idle");
  const { submit, confirm } = useSendTx(address);

  async function createLink(amount: bigint, note: string): Promise<CreatedLink> {
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
      const link = newLinkKey();
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + LINK_LIFETIME_SECONDS);
      const hash = await submit(
        ESCROW_ADDRESS,
        encodeFunctionData({ abi: escrowAbi, functionName: "deposit", args: [amount, link.address, expiresAt] }),
      );

      // Save the link key before waiting, so it is never lost if the page closes mid-send.
      const record: SentLink = {
        id: null,
        key: link.key,
        amount: amount.toString(),
        note: note.trim(),
        depositHash: hash,
        createdAt: Date.now(),
      };
      saveSentLink(address, record);

      const receipt = await confirm(hash);
      const [deposited] = parseEventLogs({ abi: escrowAbi, eventName: "Deposited", logs: receipt.logs });
      const id = deposited.args.id;
      saveSentLink(address, { ...record, id: id.toString() });

      return { url: buildClaimUrl(window.location.origin, id, link.key), amount, note: record.note };
    } finally {
      setStep("idle");
    }
  }

  return { createLink, step, busy: step !== "idle" };
}

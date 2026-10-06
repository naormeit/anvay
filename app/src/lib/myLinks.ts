"use client";

import { parseEventLogs, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Account } from "./account";
import { ESCROW_ADDRESS, LINK_LIFETIME_SECONDS, publicClient } from "./config";
import { escrowAbi, toTransfer, type OnchainTransfer } from "./contracts";
import { openJson, sealJson } from "./meraKeys";
import { loadSentLinks, saveSentLink, type SentLink } from "./sentLinks";

/** A payment link the signed-in account created, from either source. */
export type MyLink = {
  uid: string;
  id: string | null;
  /** Claim-link private key, if this account can rebuild the link. */
  key: Hex | null;
  amount: string;
  note: string;
  createdAt: number;
  /** True when the link was rebuilt from the passkey rather than read from this device. */
  recovered: boolean;
};

// ---------------------------------------------------------------- passkey notes (sealed)

const notesKeyName = (owner: string) => `anvay:notes:${owner.toLowerCase()}`;
type NotesByNonce = Record<string, string>;

async function readNotes(owner: string, notesKey: CryptoKey): Promise<NotesByNonce> {
  try {
    const sealed = localStorage.getItem(notesKeyName(owner));
    return (sealed && (await openJson<NotesByNonce>(notesKey, sealed))) || {};
  } catch {
    return {};
  }
}

/** Store "who is it for" for a passkey link, encrypted with the passkey-derived notes key. */
export async function saveSealedNote(owner: string, notesKey: CryptoKey, nonce: number, note: string) {
  if (!note) return;
  const notes = await readNotes(owner, notesKey);
  notes[String(nonce)] = note;
  try {
    localStorage.setItem(notesKeyName(owner), await sealJson(notesKey, notes));
  } catch {
    // storage unavailable: the payment still works, only the label is lost
  }
}

// ---------------------------------------------------------------- loading

async function loadAllTransfers(): Promise<(OnchainTransfer & { id: bigint })[]> {
  const count = Number(
    await publicClient.readContract({ address: ESCROW_ADDRESS, abi: escrowAbi, functionName: "transferCount" }),
  );
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
  const out: (OnchainTransfer & { id: bigint })[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const results = await publicClient.multicall({
      allowFailure: false,
      contracts: chunk.map((id) => ({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "transfers" as const,
        args: [id] as const,
      })),
    });
    results.forEach((raw, j) => out.push({ ...toTransfer(raw), id: chunk[j] }));
  }
  return out;
}

/**
 * Passkey accounts store no link keys. Find this account's transfers on-chain, re-derive the link key for every
 * nonce the account has used, and match each derived claim address to a transfer.
 */
async function recoverPasskeyLinks(account: Account): Promise<MyLink[]> {
  if (!account.linkKey || !account.notesKey) return [];
  const mine = (await loadAllTransfers()).filter((t) => t.sender.toLowerCase() === account.address.toLowerCase());
  if (mine.length === 0) return [];

  const nonceCount = await publicClient.getTransactionCount({ address: account.address });
  const byClaimAddress = new Map<string, { nonce: number; key: Hex }>();
  for (let nonce = 0; nonce < nonceCount; nonce++) {
    const key = await account.linkKey(nonce);
    byClaimAddress.set(privateKeyToAccount(key).address.toLowerCase(), { nonce, key });
  }
  const notes = await readNotes(account.address, account.notesKey);

  return mine
    .map((t) => {
      const match = byClaimAddress.get(t.claimKey.toLowerCase());
      return {
        uid: `t${t.id}`,
        id: t.id.toString(),
        key: match?.key ?? null,
        amount: t.amount.toString(),
        note: match ? (notes[String(match.nonce)] ?? "") : "",
        createdAt: (Number(t.expiresAt) - LINK_LIFETIME_SECONDS) * 1000,
        recovered: true,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Resolve the transfer id for a stored link whose deposit was sent but not yet recorded (e.g. page closed mid-send). */
async function resolveId(owner: Address, link: SentLink): Promise<SentLink> {
  if (link.id) return link;
  const receipt = await publicClient.getTransactionReceipt({ hash: link.depositHash }).catch(() => null);
  if (!receipt || receipt.status !== "success") return link;
  const [deposited] = parseEventLogs({ abi: escrowAbi, eventName: "Deposited", logs: receipt.logs });
  if (!deposited) return link;
  const resolved = { ...link, id: deposited.args.id.toString() };
  saveSentLink(owner, resolved);
  return resolved;
}

async function loadStoredLinks(owner: Address): Promise<MyLink[]> {
  const stored = await Promise.all(loadSentLinks(owner).map((l) => resolveId(owner, l)));
  return stored.map((l) => ({
    uid: l.depositHash,
    id: l.id,
    key: l.key,
    amount: l.amount,
    note: l.note,
    createdAt: l.createdAt,
    recovered: false,
  }));
}

export function loadMyLinks(account: Account): Promise<MyLink[]> {
  return account.kind === "mera" ? recoverPasskeyLinks(account) : loadStoredLinks(account.address);
}

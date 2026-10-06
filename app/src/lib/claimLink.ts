import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { chain, ESCROW_ADDRESS } from "./config";

/**
 * A claim link carries a one-time private key in the URL fragment (after `#`).
 * Browsers never send the fragment to a server, so only the person holding the link has the key.
 */
export function newLinkKey() {
  const key = generatePrivateKey();
  return { key, address: privateKeyToAccount(key).address };
}

export function buildClaimUrl(origin: string, id: bigint, key: Hex) {
  return `${origin}/claim#t=${id}&k=${key}`;
}

export function parseClaimFragment(hash: string): { id: bigint; key: Hex } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const t = params.get("t");
  const k = params.get("k");
  if (!t || !/^\d+$/.test(t) || !k || !/^0x[0-9a-fA-F]{64}$/.test(k)) return null;
  return { id: BigInt(t), key: k as Hex };
}

/** EIP-712 data the escrow checks in `claim`. Must match ClaimLinkEscrow's domain and CLAIM_TYPEHASH. */
export function claimTypedData(id: bigint, recipient: Address) {
  return {
    domain: { name: "ClaimLinkEscrow", version: "1", chainId: chain.id, verifyingContract: ESCROW_ADDRESS },
    types: { Claim: [{ name: "transferId", type: "uint256" }, { name: "recipient", type: "address" }] },
    primaryType: "Claim" as const,
    message: { transferId: id, recipient },
  };
}

/** Sign "pay transfer `id` to `recipient`" with the link key, entirely in the browser. */
export function signClaim(key: Hex, id: bigint, recipient: Address) {
  return privateKeyToAccount(key).signTypedData(claimTypedData(id, recipient));
}

import type { Hex } from "viem";
import { ESCROW_ADDRESS } from "./config";

/**
 * Links the sender created, kept on their device so they can re-share or cancel them.
 * The link key is stored here because the sender may need to send the link again.
 */
export type SentLink = {
  id: string | null; // null until the deposit is confirmed
  key: Hex;
  amount: string; // token units
  note: string;
  depositHash: Hex;
  createdAt: number;
  /** Escrow the link was created in. Links from an earlier escrow deployment (no value) are not shown. */
  escrow?: string;
};

const storageKey = (owner: string) => `anvay:sent:${owner.toLowerCase()}`;

export function loadSentLinks(owner: string): SentLink[] {
  try {
    const all = JSON.parse(localStorage.getItem(storageKey(owner)) ?? "[]") as SentLink[];
    return all.filter((l) => l.escrow?.toLowerCase() === ESCROW_ADDRESS.toLowerCase());
  } catch {
    return [];
  }
}

export function saveSentLink(owner: string, link: SentLink) {
  try {
    const all = JSON.parse(localStorage.getItem(storageKey(owner)) ?? "[]") as SentLink[];
    const others = all.filter((l) => l.depositHash !== link.depositHash);
    localStorage.setItem(storageKey(owner), JSON.stringify([{ ...link, escrow: ESCROW_ADDRESS }, ...others]));
  } catch {
    // Storage can be unavailable (private mode). The link is still shown on screen to copy.
  }
}

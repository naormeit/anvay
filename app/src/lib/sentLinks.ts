import type { Hex } from "viem";

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
};

const storageKey = (owner: string) => `anvay:sent:${owner.toLowerCase()}`;

export function loadSentLinks(owner: string): SentLink[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(owner)) ?? "[]") as SentLink[];
  } catch {
    return [];
  }
}

export function saveSentLink(owner: string, link: SentLink) {
  try {
    const others = loadSentLinks(owner).filter((l) => l.depositHash !== link.depositHash);
    localStorage.setItem(storageKey(owner), JSON.stringify([link, ...others]));
  } catch {
    // Storage can be unavailable (private mode). The link is still shown on screen to copy.
  }
}

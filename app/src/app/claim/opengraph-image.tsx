import { ogCard, ogSize } from "@/lib/ogCard";

export const alt = "You've been sent money on Anvay";
export const size = ogSize;
export const contentType = "image/png";

/** The card recipients see when a claim link is shared on WhatsApp. The amount stays private (it is not in the URL path). */
export default function ClaimOpengraphImage() {
  return ogCard("You've been sent money.", "Tap to collect it with your fingerprint. No app, no fees.");
}

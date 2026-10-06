import { ogCard, ogSize } from "@/lib/ogCard";

export const alt = "Anvay: send dollars home with a link";
export const size = ogSize;
export const contentType = "image/png";

export default function OpengraphImage() {
  return ogCard("Send dollars home with a link.", "Tap to collect. Arrives in seconds. Almost no fees.");
}

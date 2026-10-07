import { isMainnet } from "./config";

/** A short, readable message for a failed wallet transaction (viem errors carry long RPC dumps). */
export function txErrorMessage(err: unknown): string {
  const e = err as { shortMessage?: string; details?: string; message?: string; name?: string } | null;
  const text = `${e?.details ?? ""} ${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  if (/insufficient (balance|funds)/i.test(text)) {
    return isMainnet
      ? "Your account doesn't have enough MON to pay the network fee."
      : "Your account has no MON for network fees yet. Tap “Add $100 test dollars”, wait a few seconds, then try again.";
  }
  if (/user rejected|denied/i.test(text)) return "You cancelled the request.";
  if (/nonce/i.test(text)) return "Another payment is still going through. Wait a few seconds and try again.";
  const short = e?.shortMessage ?? (err instanceof Error ? err.message : "");
  return short && short.length < 160 ? short : "Something went wrong sending the payment. Please try again.";
}

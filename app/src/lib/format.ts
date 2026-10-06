import { formatUnits, parseUnits } from "viem";
import { AUSD_DECIMALS } from "./config";

export function formatUsd(amount: bigint) {
  const n = Number(formatUnits(amount, AUSD_DECIMALS));
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Parse a dollar amount typed by a user ("25", "25.5", "$1,000") into token units, or null if invalid. */
export function parseUsd(input: string): bigint | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = parseUnits(cleaned, AUSD_DECIMALS);
  return value > BigInt(0) ? value : null;
}

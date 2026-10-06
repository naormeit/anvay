import { formatUnits, parseUnits } from "viem";
import { AUSD_DECIMALS } from "./config";

export function formatUsd(amount: bigint) {
  const n = Number(formatUnits(amount, AUSD_DECIMALS));
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Rupee value of a dollar amount, rounded to whole rupees ("₹2,410"). */
export function formatInr(amount: bigint, inrPerUsd: number) {
  const n = Number(formatUnits(amount, AUSD_DECIMALS)) * inrPerUsd;
  return n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

/** Parse a dollar amount typed by a user ("25", "25.5", "$1,000") into token units, or null if invalid. */
export function parseUsd(input: string): bigint | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = parseUnits(cleaned, AUSD_DECIMALS);
  return value > BigInt(0) ? value : null;
}

/** Parse a rupee amount ("5000", "₹5,000", "5,000.50") into a number of rupees, or null if invalid. */
export function parseInr(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 ? value : null;
}

/** Convert rupees to dollar token units, rounded to the nearest cent. */
export function inrToUsdUnits(rupees: number, inrPerUsd: number): bigint {
  const cents = Math.round((rupees / inrPerUsd) * 100);
  return BigInt(cents) * BigInt(10 ** (AUSD_DECIMALS - 2));
}

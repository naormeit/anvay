import "server-only";
import { parseAbi, type Address } from "viem";
import { publicClient } from "./config";

/**
 * USD->INR rate for display.
 *
 * Preferred source: InrRateFeed on Monad, written by Anvay's Chainlink CRE workflow (median of three public FX
 * sources, agreed by DON consensus). If the feed is missing or older than MAX_FEED_AGE, fall back to open.er-api.com.
 * Cached in memory for TTL_MS either way.
 */
const FALLBACK_SOURCE = "https://open.er-api.com/v6/latest/USD";
const TTL_MS = 10 * 60 * 1000;
const MAX_FEED_AGE_SECONDS = 24 * 60 * 60;
const FEED_ADDRESS = process.env.NEXT_PUBLIC_RATE_FEED_ADDRESS as Address | undefined;

const feedAbi = parseAbi(["function latest() view returns (uint256 rateE6, uint64 observed, uint64 updated)"]);

export type InrRate = {
  inrPerUsd: number;
  source: "chainlink" | "open.er-api";
  /** ISO time the rate was last updated at its source. */
  updatedAt: string;
};

let cached: (InrRate & { fetchedAt: number }) | null = null;

async function fromFeed(): Promise<InrRate | null> {
  if (!FEED_ADDRESS) return null;
  try {
    const [rateE6, , updated] = await publicClient.readContract({
      address: FEED_ADDRESS,
      abi: feedAbi,
      functionName: "latest",
    });
    const ageSeconds = Math.floor(Date.now() / 1000) - Number(updated);
    if (rateE6 === BigInt(0) || ageSeconds > MAX_FEED_AGE_SECONDS) return null;
    return {
      inrPerUsd: Number(rateE6) / 1e6,
      source: "chainlink",
      updatedAt: new Date(Number(updated) * 1000).toISOString(),
    };
  } catch (err) {
    console.error("rate feed read failed", err);
    return null;
  }
}

async function fromApi(): Promise<InrRate> {
  const res = await fetch(FALLBACK_SOURCE, { cache: "no-store" });
  if (!res.ok) throw new Error(`rate source returned ${res.status}`);
  const data = (await res.json()) as { result?: string; rates?: { INR?: number }; time_last_update_unix?: number };
  const inr = data.rates?.INR;
  if (data.result !== "success" || !inr || inr <= 0) throw new Error("rate source returned no INR rate");
  return {
    inrPerUsd: inr,
    source: "open.er-api",
    updatedAt: new Date((data.time_last_update_unix ?? Date.now() / 1000) * 1000).toISOString(),
  };
}

export async function getInrRate(): Promise<InrRate> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  const rate = (await fromFeed()) ?? (await fromApi());
  cached = { ...rate, fetchedAt: Date.now() };
  return rate;
}

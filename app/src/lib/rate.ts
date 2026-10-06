import "server-only";

/** USD→INR rate for display. Cached in memory for an hour; the source updates daily. */
const SOURCE = "https://open.er-api.com/v6/latest/USD";
const TTL_MS = 60 * 60 * 1000;

let cached: { inrPerUsd: number; updatedAt: string; fetchedAt: number } | null = null;

export async function getInrRate() {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  const res = await fetch(SOURCE, { cache: "no-store" });
  if (!res.ok) throw new Error(`rate source returned ${res.status}`);
  const data = (await res.json()) as { result?: string; rates?: { INR?: number }; time_last_update_utc?: string };
  const inr = data.rates?.INR;
  if (data.result !== "success" || !inr || inr <= 0) throw new Error("rate source returned no INR rate");
  cached = { inrPerUsd: inr, updatedAt: data.time_last_update_utc ?? "", fetchedAt: Date.now() };
  return cached;
}

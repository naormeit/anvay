import { ESCROW_ADDRESS, LINK_LIFETIME_SECONDS, publicClient } from "@/lib/config";
import { escrowAbi, toTransfer, TransferStatus } from "@/lib/contracts";
import { indexerStats, indexerUrl, type Activity, type IndexedStats, type StatsResponse } from "@/lib/indexer";
import { getInrRate } from "@/lib/rate";
import { isTestSender, TEST_SENDERS } from "@/lib/testAccounts";

const CACHE_MS = 30_000;
let cached: { at: number; body: StatsResponse } | null = null;

/** Fallback when no indexer is configured: read every transfer from the escrow. */
async function chainStats(): Promise<IndexedStats> {
  const count = Number(
    await publicClient.readContract({ address: ESCROW_ADDRESS, abi: escrowAbi, functionName: "transferCount" }),
  );
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
  const raw = ids.length
    ? await publicClient.multicall({
        allowFailure: false,
        contracts: ids.map((id) => ({
          address: ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "transfers" as const,
          args: [id] as const,
        })),
      })
    : [];
  const transfers = raw.map((r, i) => ({ ...toTransfer(r), id: ids[i] })).filter((t) => !isTestSender(t.sender));

  let volume = BigInt(0);
  let collectedVolume = BigInt(0);
  const senders = new Set<string>();
  const statusName = (s: number) =>
    s === TransferStatus.Claimed ? "claimed" : s === TransferStatus.Cancelled ? "cancelled" : "pending";
  for (const t of transfers) {
    volume += t.amount;
    if (t.status === TransferStatus.Claimed) collectedVolume += t.amount;
    senders.add(t.sender.toLowerCase());
  }
  const recent = transfers
    .slice(-10)
    .reverse()
    .map((t) => ({
      id: t.id.toString(),
      amount: t.amount.toString(),
      status: statusName(t.status) as Activity["status"],
      at: Number(t.expiresAt) - LINK_LIFETIME_SECONDS,
    }));

  return {
    source: "chain",
    links: transfers.length,
    collected: transfers.filter((t) => t.status === TransferStatus.Claimed).length,
    cancelled: transfers.filter((t) => t.status === TransferStatus.Cancelled).length,
    pending: transfers.filter((t) => t.status === TransferStatus.Pending).length,
    volume: volume.toString(),
    collectedVolume: collectedVolume.toString(),
    senders: senders.size,
    recipients: null,
    recent,
  };
}

/**
 * Public usage numbers for the /stats page, excluding automated test accounts. Served from the Envio indexer when
 * configured, else read from the chain.
 */
export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_MS) return Response.json(cached.body);
  try {
    let stats: IndexedStats | null = null;
    if (indexerUrl) {
      stats = await indexerStats(TEST_SENDERS).catch((err) => {
        console.error("indexer stats failed, falling back to chain", err);
        return null;
      });
    }
    stats ??= await chainStats();
    const rate = await getInrRate().catch(() => null);
    const body: StatsResponse = { ...stats, rate };
    cached = { at: Date.now(), body };
    return Response.json(body);
  } catch (err) {
    console.error("stats failed", err);
    return Response.json({ error: "Stats are unavailable right now." }, { status: 503 });
  }
}

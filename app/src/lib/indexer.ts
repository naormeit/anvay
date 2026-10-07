/**
 * Client for Anvay's Envio indexer (see /indexer). It indexes ClaimLinkEscrow and InrRateFeed events on Monad and
 * serves them over GraphQL. Everything that uses it has an on-chain fallback, so the app works without it.
 */

export const indexerUrl = process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL || "";

export type Activity = { id: string; amount: string; status: "pending" | "claimed" | "cancelled"; at: number };

/** Running totals at `at` (unix seconds). */
export type GrowthPoint = { at: number; links: number; volume: string };
export type RatePoint = { at: number; inrPerUsd: number };

export type IndexedStats = {
  source: "envio" | "chain";
  links: number;
  collected: number;
  cancelled: number;
  pending: number;
  volume: string;
  collectedVolume: string;
  senders: number;
  recipients: number | null;
  recent: Activity[];
  /** Running totals of links and dollars sent, one point per transfer, oldest first. */
  growth: GrowthPoint[];
  /** Rates written on-chain by the Chainlink CRE workflow, oldest first. Empty without the indexer. */
  rateHistory: RatePoint[];
};

export type StatsResponse = IndexedStats & {
  rate: { inrPerUsd: number; source: string; updatedAt: string } | null;
  /** When these numbers were computed (unix seconds). */
  asOf: number;
};

export type IndexedTransfer = {
  id: string;
  sender: string;
  claimKey: string;
  amount: string;
  expiresAt: string;
  status: "pending" | "claimed" | "cancelled";
  createdAt: number;
};

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!indexerUrl) throw new Error("indexer not configured");
  const res = await fetch(indexerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || body.errors?.length || !body.data) {
    throw new Error(`indexer query failed: ${body.errors?.map((e) => e.message).join("; ") ?? res.status}`);
  }
  return body.data;
}

/** Running totals after each transfer, oldest first. */
export function growthSeries(rows: { amount: string | bigint; createdAt: number }[]): GrowthPoint[] {
  let links = 0;
  let volume = BigInt(0);
  return [...rows]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => {
      links += 1;
      volume += BigInt(r.amount);
      return { at: r.createdAt, links, volume: volume.toString() };
    });
}

type StatRow = {
  id: string;
  sender: string;
  recipient: string | null;
  amount: string;
  status: Activity["status"];
  createdAt: number;
  settledAt: number | null;
};

/** Public totals from the indexer, leaving out `excludedSenders` (automated test accounts). */
export async function indexerStats(excludedSenders: readonly string[] = []): Promise<IndexedStats> {
  const data = await gql<{ Transfer: StatRow[]; RateUpdate: { inrPerUsdE6: string; blockTime: number }[] }>(
    `query AnvayStats($excluded: [String!]!) {
      Transfer(where: { sender: { _nin: $excluded } }, order_by: { createdAt: desc }) {
        id sender recipient amount status createdAt settledAt
      }
      RateUpdate(order_by: { blockTime: desc }, limit: 120) { inrPerUsdE6 blockTime }
    }`,
    { excluded: excludedSenders.map((a) => a.toLowerCase()) },
  );
  const rows = data.Transfer;
  const sum = (list: StatRow[]) => list.reduce((acc, t) => acc + BigInt(t.amount), BigInt(0));
  const claimed = rows.filter((t) => t.status === "claimed");
  return {
    source: "envio",
    links: rows.length,
    collected: claimed.length,
    cancelled: rows.filter((t) => t.status === "cancelled").length,
    pending: rows.filter((t) => t.status === "pending").length,
    volume: sum(rows).toString(),
    collectedVolume: sum(claimed).toString(),
    senders: new Set(rows.map((t) => t.sender)).size,
    recipients: new Set(claimed.map((t) => t.recipient).filter(Boolean)).size,
    recent: rows.slice(0, 10).map((t) => ({
      id: t.id,
      amount: String(t.amount),
      status: t.status,
      at: t.settledAt ?? t.createdAt,
    })),
    growth: growthSeries(rows),
    rateHistory: data.RateUpdate.map((r) => ({ at: r.blockTime, inrPerUsd: Number(r.inrPerUsdE6) / 1e6 })).reverse(),
  };
}

/**
 * Every transfer an address has sent, newest first, plus the highest transfer id the indexer has seen overall.
 * Callers read anything newer than `latestIndexedId` from the chain, since the indexer can lag by a few seconds.
 */
export async function indexerTransfersBySender(
  sender: string,
): Promise<{ transfers: IndexedTransfer[]; latestIndexedId: bigint }> {
  const data = await gql<{ mine: IndexedTransfer[]; stats: { links: number }[] }>(
    `query BySender($sender: String!) {
      mine: Transfer(where: { sender: { _eq: $sender } }, order_by: { createdAt: desc }) {
        id sender claimKey amount expiresAt status createdAt
      }
      stats: Stats(where: { id: { _eq: "global" } }) { links }
    }`,
    { sender: sender.toLowerCase() },
  );
  return {
    transfers: data.mine.map((t) => ({ ...t, amount: String(t.amount), expiresAt: String(t.expiresAt) })),
    // Escrow ids count up from 1, so the number of indexed deposits is the highest indexed id.
    latestIndexedId: BigInt(data.stats[0]?.links ?? 0),
  };
}

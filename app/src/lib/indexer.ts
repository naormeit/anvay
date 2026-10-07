/**
 * Client for Anvay's Envio indexer (see /indexer). It indexes ClaimLinkEscrow and InrRateFeed events on Monad and
 * serves them over GraphQL. Everything that uses it has an on-chain fallback, so the app works without it.
 */

export const indexerUrl = process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL || "";

export type Activity = { id: string; amount: string; status: "pending" | "claimed" | "cancelled"; at: number };

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
};

export type StatsResponse = IndexedStats & {
  rate: { inrPerUsd: number; source: string; updatedAt: string } | null;
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

type StatsRow = {
  links: number;
  collected: number;
  cancelled: number;
  volume: string;
  collectedVolume: string;
  senders: number;
  recipients: number;
};

export async function indexerStats(): Promise<IndexedStats> {
  const data = await gql<{
    Stats: StatsRow[];
    Transfer: { id: string; amount: string; status: Activity["status"]; createdAt: number; settledAt: number | null }[];
  }>(`
    query AnvayStats {
      Stats(where: { id: { _eq: "global" } }) { links collected cancelled volume collectedVolume senders recipients }
      Transfer(order_by: { createdAt: desc }, limit: 10) { id amount status createdAt settledAt }
    }
  `);
  const s = data.Stats[0];
  return {
    source: "envio",
    links: s?.links ?? 0,
    collected: s?.collected ?? 0,
    cancelled: s?.cancelled ?? 0,
    pending: (s?.links ?? 0) - (s?.collected ?? 0) - (s?.cancelled ?? 0),
    volume: String(s?.volume ?? "0"),
    collectedVolume: String(s?.collectedVolume ?? "0"),
    senders: s?.senders ?? 0,
    recipients: s?.recipients ?? 0,
    recent: data.Transfer.map((t) => ({
      id: t.id,
      amount: String(t.amount),
      status: t.status,
      at: t.settledAt ?? t.createdAt,
    })),
  };
}

/** Every transfer an address has sent, newest first. Used to rebuild a passkey account's links. */
export async function indexerTransfersBySender(sender: string): Promise<IndexedTransfer[]> {
  const data = await gql<{ Transfer: IndexedTransfer[] }>(
    `query BySender($sender: String!) {
      Transfer(where: { sender: { _eq: $sender } }, order_by: { createdAt: desc }) {
        id sender claimKey amount expiresAt status createdAt
      }
    }`,
    { sender: sender.toLowerCase() },
  );
  return data.Transfer.map((t) => ({ ...t, amount: String(t.amount), expiresAt: String(t.expiresAt) }));
}

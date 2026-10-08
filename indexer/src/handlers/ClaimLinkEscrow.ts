/*
 * Anvay escrow handlers: keep each payment link's current state plus per-account, per-escrow and global totals.
 * Several escrow deployments are indexed, and each numbers its transfers from 1, so a Transfer's id is
 * "<escrow>-<transferId>". Addresses are stored lowercase so the app can query them without caring about checksums.
 */
import { indexer } from "envio";
import type { Account, Stats } from "envio";

const STATS_ID = "global";

const emptyStats = (id: string): Stats => ({
  id,
  links: 0,
  collected: 0,
  cancelled: 0,
  volume: 0n,
  collectedVolume: 0n,
  senders: 0,
  recipients: 0,
  lastActivity: 0,
});

const emptyAccount = (id: string): Account => ({
  id,
  linksSent: 0,
  amountSent: 0n,
  linksCollected: 0,
  amountCollected: 0n,
});

const transferKey = (escrow: string, id: bigint) => `${escrow.toLowerCase()}-${id}`;

/** Apply the same change to the global totals and to this escrow's totals. */
async function updateStats(
  context: { Stats: { get: (id: string) => Promise<Stats | undefined>; set: (s: Stats) => void } },
  escrow: string,
  change: (s: Stats) => Partial<Stats>,
) {
  for (const id of [STATS_ID, escrow.toLowerCase()]) {
    const stats = (await context.Stats.get(id)) ?? emptyStats(id);
    context.Stats.set({ ...stats, ...change(stats) });
  }
}

indexer.onEvent({ contract: "ClaimLinkEscrow", event: "Deposited" }, async ({ event, context }) => {
  const sender = event.params.sender.toLowerCase();
  const amount = event.params.amount;
  const at = event.block.timestamp;

  context.Transfer.set({
    id: transferKey(event.srcAddress, event.params.id),
    escrow: event.srcAddress.toLowerCase(),
    transferId: event.params.id,
    sender,
    claimKey: event.params.claimKey.toLowerCase(),
    amount,
    expiresAt: event.params.expiresAt,
    status: "pending",
    createdAt: at,
    createdTx: event.transaction.hash,
    recipient: undefined,
    relayer: undefined,
    settledAt: undefined,
    settledTx: undefined,
  });

  const account = (await context.Account.get(sender)) ?? emptyAccount(sender);
  context.Account.set({ ...account, linksSent: account.linksSent + 1, amountSent: account.amountSent + amount });

  // `senders` and `recipients` count first-time accounts across all escrows; the app reads only `links` from the
  // per-escrow rows.
  await updateStats(context, event.srcAddress, (stats) => ({
    links: stats.links + 1,
    volume: stats.volume + amount,
    senders: stats.senders + (account.linksSent === 0 ? 1 : 0),
    lastActivity: at,
  }));
});

indexer.onEvent({ contract: "ClaimLinkEscrow", event: "Claimed" }, async ({ event, context }) => {
  const recipient = event.params.recipient.toLowerCase();
  const amount = event.params.amount;
  const at = event.block.timestamp;

  const transfer = await context.Transfer.get(transferKey(event.srcAddress, event.params.id));
  if (transfer) {
    context.Transfer.set({
      ...transfer,
      status: "claimed",
      recipient,
      relayer: event.params.relayer.toLowerCase(),
      settledAt: at,
      settledTx: event.transaction.hash,
    });
  }

  const account = (await context.Account.get(recipient)) ?? emptyAccount(recipient);
  context.Account.set({
    ...account,
    linksCollected: account.linksCollected + 1,
    amountCollected: account.amountCollected + amount,
  });

  await updateStats(context, event.srcAddress, (stats) => ({
    collected: stats.collected + 1,
    collectedVolume: stats.collectedVolume + amount,
    recipients: stats.recipients + (account.linksCollected === 0 ? 1 : 0),
    lastActivity: at,
  }));
});

indexer.onEvent({ contract: "ClaimLinkEscrow", event: "Cancelled" }, async ({ event, context }) => {
  const at = event.block.timestamp;

  const transfer = await context.Transfer.get(transferKey(event.srcAddress, event.params.id));
  if (transfer) {
    context.Transfer.set({ ...transfer, status: "cancelled", settledAt: at, settledTx: event.transaction.hash });
  }

  await updateStats(context, event.srcAddress, (stats) => ({ cancelled: stats.cancelled + 1, lastActivity: at }));
});

/*
 * Anvay escrow handlers: keep each payment link's current state plus per-account and global totals.
 * Addresses are stored lowercase so the app can query them without caring about checksums.
 */
import { indexer } from "envio";
import type { Account, Stats } from "envio";

const STATS_ID = "global";

const emptyStats = (): Stats => ({
  id: STATS_ID,
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

indexer.onEvent({ contract: "ClaimLinkEscrow", event: "Deposited" }, async ({ event, context }) => {
  const sender = event.params.sender.toLowerCase();
  const amount = event.params.amount;
  const at = event.block.timestamp;

  context.Transfer.set({
    id: event.params.id.toString(),
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

  const stats = (await context.Stats.get(STATS_ID)) ?? emptyStats();
  context.Stats.set({
    ...stats,
    links: stats.links + 1,
    volume: stats.volume + amount,
    senders: stats.senders + (account.linksSent === 0 ? 1 : 0),
    lastActivity: at,
  });
});

indexer.onEvent({ contract: "ClaimLinkEscrow", event: "Claimed" }, async ({ event, context }) => {
  const recipient = event.params.recipient.toLowerCase();
  const amount = event.params.amount;
  const at = event.block.timestamp;

  const transfer = await context.Transfer.get(event.params.id.toString());
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

  const stats = (await context.Stats.get(STATS_ID)) ?? emptyStats();
  context.Stats.set({
    ...stats,
    collected: stats.collected + 1,
    collectedVolume: stats.collectedVolume + amount,
    recipients: stats.recipients + (account.linksCollected === 0 ? 1 : 0),
    lastActivity: at,
  });
});

indexer.onEvent({ contract: "ClaimLinkEscrow", event: "Cancelled" }, async ({ event, context }) => {
  const at = event.block.timestamp;

  const transfer = await context.Transfer.get(event.params.id.toString());
  if (transfer) {
    context.Transfer.set({ ...transfer, status: "cancelled", settledAt: at, settledTx: event.transaction.hash });
  }

  const stats = (await context.Stats.get(STATS_ID)) ?? emptyStats();
  context.Stats.set({ ...stats, cancelled: stats.cancelled + 1, lastActivity: at });
});

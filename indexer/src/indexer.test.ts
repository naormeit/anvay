import { describe, it } from "vitest";
import { createTestIndexer, TestHelpers } from "envio";

const SENDER = TestHelpers.Addresses.mockAddresses[0]!;
const RECIPIENT = TestHelpers.Addresses.mockAddresses[1]!;
const RELAYER = TestHelpers.Addresses.mockAddresses[2]!;
const LINK_KEY = TestHelpers.Addresses.mockAddresses[3]!;

const deposited = (id: bigint, amount: bigint) => ({
  contract: "ClaimLinkEscrow" as const,
  event: "Deposited" as const,
  params: { id, sender: SENDER, claimKey: LINK_KEY, amount, expiresAt: 1_900_000_000n },
});
const claimed = (id: bigint, amount: bigint) => ({
  contract: "ClaimLinkEscrow" as const,
  event: "Claimed" as const,
  params: { id, recipient: RECIPIENT, relayer: RELAYER, amount },
});
const cancelled = (id: bigint, amount: bigint) => ({
  contract: "ClaimLinkEscrow" as const,
  event: "Cancelled" as const,
  params: { id, sender: SENDER, amount },
});

describe("Anvay escrow indexing", () => {
  it("tracks a link from deposit to claim, and another to cancel", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            deposited(1n, 25_000_000n),
            claimed(1n, 25_000_000n),
            deposited(2n, 10_000_000n),
            cancelled(2n, 10_000_000n),
            deposited(3n, 5_000_000n),
          ],
        },
      },
    });

    const first = await indexer.Transfer.getOrThrow("1");
    t.expect(first.status).toBe("claimed");
    t.expect(first.sender).toBe(SENDER.toLowerCase());
    t.expect(first.claimKey).toBe(LINK_KEY.toLowerCase());
    t.expect(first.recipient).toBe(RECIPIENT.toLowerCase());
    t.expect(first.relayer).toBe(RELAYER.toLowerCase());
    t.expect(first.amount).toBe(25_000_000n);

    t.expect((await indexer.Transfer.getOrThrow("2")).status).toBe("cancelled");
    t.expect((await indexer.Transfer.getOrThrow("3")).status).toBe("pending");

    const stats = await indexer.Stats.getOrThrow("global");
    t.expect(stats.links).toBe(3);
    t.expect(stats.collected).toBe(1);
    t.expect(stats.cancelled).toBe(1);
    t.expect(stats.volume).toBe(40_000_000n);
    t.expect(stats.collectedVolume).toBe(25_000_000n);
    t.expect(stats.senders).toBe(1); // the same sender made all three links
    t.expect(stats.recipients).toBe(1);

    const sender = await indexer.Account.getOrThrow(SENDER.toLowerCase());
    t.expect(sender.linksSent).toBe(3);
    t.expect(sender.amountSent).toBe(40_000_000n);
    const recipient = await indexer.Account.getOrThrow(RECIPIENT.toLowerCase());
    t.expect(recipient.linksCollected).toBe(1);
    t.expect(recipient.amountCollected).toBe(25_000_000n);
  });

  it("records Chainlink rate updates", async (t) => {
    const indexer = createTestIndexer();
    const result = await indexer.process({
      chains: {
        10143: {
          simulate: [
            { contract: "InrRateFeed" as const, event: "RateUpdated" as const, params: { inrPerUsdE6: 96_420_000n, observedAt: 1_791_347_400n } },
          ],
        },
      },
    });
    t.expect(result.changes.length).toBeGreaterThan(0);
    const updates = await indexer.RateUpdate.getAll();
    t.expect(updates.length).toBe(1);
    t.expect(updates[0]!.inrPerUsdE6).toBe(96_420_000n);
  });
});

describe("Real Monad testnet data", () => {
  it("indexes the first real deposit from HyperSync", async (t) => {
    const indexer = createTestIndexer();
    const result = await indexer.process({ chains: { 10143: {} } });
    t.expect(result.changes.length).toBeGreaterThan(0);
    const first = await indexer.Transfer.getOrThrow("1");
    t.expect(first.amount).toBe(25_000_000n); // Anvay's first real link: $25
  });
});

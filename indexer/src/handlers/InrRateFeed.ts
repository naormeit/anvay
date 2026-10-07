/*
 * Record every USD/INR rate the Chainlink CRE workflow writes to InrRateFeed.
 */
import { indexer } from "envio";

indexer.onEvent({ contract: "InrRateFeed", event: "RateUpdated" }, async ({ event, context }) => {
  context.RateUpdate.set({
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    inrPerUsdE6: event.params.inrPerUsdE6,
    observedAt: event.params.observedAt,
    blockTime: event.block.timestamp,
    tx: event.transaction.hash,
  });
});

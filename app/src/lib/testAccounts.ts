/**
 * Sender addresses created by automated end-to-end tests (app/scripts/passkey-flow.mjs) against the live testnet
 * contracts. They are real on-chain transfers, so they stay in the indexer and on the explorer, but they are left out
 * of the public /stats numbers so those reflect real usage only. Add an address here after running the e2e test
 * against the deployed contracts. Lowercase.
 */
export const TEST_SENDERS: readonly string[] = [
  "0x120617145506a996d271ce032b4ca3c60ed7a776", // passkey e2e, 7 Oct 2026 (transfer #3)
  "0xc050df0ccc4b6a8467b046bd5ce277e60887813a", // passkey e2e, 7 Oct 2026 (transfer #4)
  "0x16afac0e8758e4637c31ff94c3a6685134b09a8f", // passkey e2e with indexer, 7 Oct 2026 (transfer #5)
  "0x04df27948cb1adc000adb953eba870874471b4ef", // passkey e2e after the redesign, 7 Oct 2026 (transfer #7)
  "0xd7585d2ca8739a9495d4a1d612b493e2dc7b339c", // passkey e2e for the faucet fix, 7 Oct 2026 (transfer #8)
];

export const isTestSender = (address: string) => TEST_SENDERS.includes(address.toLowerCase());

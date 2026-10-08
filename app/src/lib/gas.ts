import "server-only";
import { parseEther, type Address } from "viem";
import { publicClient } from "./config";
import { relayerClient } from "./relayer";

const GAS_TOP_UP = parseEther("0.08");
export const MIN_GAS_BALANCE = parseEther("0.04");
const RESERVE_LAG_BLOCKS = BigInt(4);
const FRESH_FUNDS_DELAY_MS = 1500;

async function waitForBlock(target: bigint) {
  while ((await publicClient.getBlockNumber({ cacheTime: 0 })) < target) {
    await new Promise((r) => setTimeout(r, 300));
  }
}

/**
 * Testnet: send `address` enough MON for a few transactions if it has less than MIN_GAS_BALANCE. Call inside
 * `withRelayerLock`. `afterBlock` is the block of the relayer's previous transaction, when known.
 *
 * The relayer holds less than Monad's reserve balance, so a MON transfer from it only succeeds as an "emptying"
 * transaction: one sent when the relayer has had no transaction in the previous 3 blocks. A too-early transfer is
 * mined but reverts, so wait, check the receipt, and retry.
 */
export async function topUpGas(address: Address, afterBlock?: bigint) {
  if ((await publicClient.getBalance({ address })) >= MIN_GAS_BALANCE) return;
  const wallet = relayerClient();
  let lastBlock = afterBlock;
  for (let attempt = 0; ; attempt++) {
    if (lastBlock !== undefined) await waitForBlock(lastBlock + RESERVE_LAG_BLOCKS);
    const hash = await wallet.sendTransaction({ to: address, value: GAS_TOP_UP });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "success") break;
    if (attempt >= 2) throw new Error(`gas top-up reverted: ${hash}`);
    lastBlock = receipt.blockNumber;
  }
  // Monad checks gas against state from 3 blocks back, so freshly received MON is usable ~1.2s later.
  await new Promise((r) => setTimeout(r, FRESH_FUNDS_DELAY_MS));
}

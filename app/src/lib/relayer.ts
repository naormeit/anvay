import "server-only";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, rpcUrl } from "./config";

/** Server wallet that pays gas for claims (and, on testnet, runs the test-dollar faucet). */
export function relayerClient() {
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("RELAYER_PRIVATE_KEY is not set");
  return createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(rpcUrl) });
}

let queue: Promise<unknown> = Promise.resolve();

/** Run relayer sends one at a time so two requests never pick the same nonce. */
export function withRelayerLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

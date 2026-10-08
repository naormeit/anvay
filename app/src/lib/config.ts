import { createPublicClient, http, type Address } from "viem";
import { monad, monadTestnet } from "viem/chains";

export const isMainnet = process.env.NEXT_PUBLIC_NETWORK === "mainnet";
export const chain = isMainnet ? monad : monadTestnet;

/**
 * Testnet contracts. Since 8 Oct 2026 the escrow holds Agora's official testnet AUSD, so the app can cash out through
 * Agora's Instant Settlement pool. Mainnet addresses come from the environment.
 */
const TESTNET = {
  escrow: "0xD4581b315B7fB8A1C446d3dEfE7D3112Ddb52138",
  ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
} as const;

export const ESCROW_ADDRESS = (isMainnet ? process.env.NEXT_PUBLIC_ESCROW_ADDRESS : TESTNET.escrow) as Address;
export const AUSD_ADDRESS = (isMainnet ? process.env.NEXT_PUBLIC_AUSD_ADDRESS : TESTNET.ausd) as Address;
export const AUSD_DECIMALS = 6;

/** How long a claim link stays claimable. The sender can cancel at any time. */
export const LINK_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export const explorerUrl = isMainnet ? "https://monadvision.com" : "https://testnet.monadvision.com";
export const explorerTx = (hash: string) => `${explorerUrl}/tx/${hash}`;
export const explorerAddress = (address: string) => `${explorerUrl}/address/${address}`;

/** Optional RPC override (e.g. a Quicknode endpoint, or a local fork for testing). Defaults to the public Monad RPC. */
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || undefined;

export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

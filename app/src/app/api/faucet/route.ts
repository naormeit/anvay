import { isAddress, parseUnits, type Address } from "viem";
import { AUSD_ADDRESS, AUSD_DECIMALS, isMainnet, publicClient } from "@/lib/config";
import { AGORA_TESTNET_FAUCET, agoraFaucetAbi, ausdAbi } from "@/lib/contracts";
import { topUpGas } from "@/lib/gas";
import { relayerClient, withRelayerLock } from "@/lib/relayer";

const TEST_DOLLARS = parseUnits("100", AUSD_DECIMALS);
// Refill the relayer's AUSD stock from Agora's faucet (10,000 per request) when it falls below this.
const REFILL_BELOW = parseUnits("1000", AUSD_DECIMALS);
const COOLDOWN_MS = 10 * 60 * 1000;

const lastDrip = new Map<string, number>();

/**
 * Testnet only: give a new user 100 test dollars (Agora's testnet AUSD, from the relayer's stock) and enough MON to
 * pay for sending.
 */
export async function POST(request: Request) {
  if (isMainnet) return Response.json({ error: "Not available." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const address = (body as { address?: string } | null)?.address;
  if (!address || !isAddress(address)) {
    return Response.json({ error: "Invalid address." }, { status: 400 });
  }

  const key = address.toLowerCase();
  const last = lastDrip.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) {
    return Response.json({ error: "You already got test dollars. Try again in a few minutes." }, { status: 429 });
  }
  lastDrip.set(key, Date.now());

  try {
    await withRelayerLock(async () => {
      const wallet = relayerClient();
      const relayer = wallet.account.address;
      let stock = await publicClient.readContract({
        address: AUSD_ADDRESS,
        abi: ausdAbi,
        functionName: "balanceOf",
        args: [relayer],
      });
      if (stock < REFILL_BELOW) {
        // Agora's faucet allows one request every few minutes across all callers, so this can fail; carry on with
        // the stock we have if it does.
        try {
          const refill = await wallet.writeContract({
            address: AGORA_TESTNET_FAUCET,
            abi: agoraFaucetAbi,
            functionName: "requestFunds",
            args: [relayer],
          });
          await publicClient.waitForTransactionReceipt({ hash: refill });
          stock = await publicClient.readContract({
            address: AUSD_ADDRESS,
            abi: ausdAbi,
            functionName: "balanceOf",
            args: [relayer],
          });
        } catch (err) {
          console.warn("AUSD refill from Agora's faucet failed", err);
        }
      }
      if (stock < TEST_DOLLARS) throw new Error("test dollar stock is empty");

      const send = await wallet.writeContract({
        address: AUSD_ADDRESS,
        abi: ausdAbi,
        functionName: "transfer",
        args: [address as Address, TEST_DOLLARS],
      });
      const sent = await publicClient.waitForTransactionReceipt({ hash: send });
      if (sent.status !== "success") throw new Error(`test dollar transfer reverted: ${send}`);

      await topUpGas(address as Address, sent.blockNumber);
    });
    return Response.json({ ok: true });
  } catch (err) {
    lastDrip.delete(key);
    console.error("faucet failed", err);
    return Response.json({ error: "Could not send test dollars right now." }, { status: 502 });
  }
}

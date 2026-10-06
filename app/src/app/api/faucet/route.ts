import { isAddress, parseEther, parseUnits, type Address } from "viem";
import { AUSD_ADDRESS, AUSD_DECIMALS, isMainnet, publicClient } from "@/lib/config";
import { ausdAbi } from "@/lib/contracts";
import { relayerClient, withRelayerLock } from "@/lib/relayer";

const TEST_DOLLARS = parseUnits("100", AUSD_DECIMALS);
const GAS_TOP_UP = parseEther("0.1");
const MIN_GAS_BALANCE = parseEther("0.05");
const COOLDOWN_MS = 10 * 60 * 1000;

const lastDrip = new Map<string, number>();

/** Testnet only: give a new user 100 test dollars and enough MON to pay for sending. */
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
      const mint = await wallet.writeContract({
        address: AUSD_ADDRESS,
        abi: ausdAbi,
        functionName: "mint",
        args: [address as Address, TEST_DOLLARS],
      });
      await publicClient.waitForTransactionReceipt({ hash: mint });

      const gas = await publicClient.getBalance({ address: address as Address });
      if (gas < MIN_GAS_BALANCE) {
        const topUp = await wallet.sendTransaction({ to: address as Address, value: GAS_TOP_UP });
        await publicClient.waitForTransactionReceipt({ hash: topUp });
      }
    });
    return Response.json({ ok: true });
  } catch (err) {
    lastDrip.delete(key);
    console.error("faucet failed", err);
    return Response.json({ error: "Could not send test dollars right now." }, { status: 502 });
  }
}

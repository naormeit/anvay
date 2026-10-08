import { isAddress, parseUnits, type Address } from "viem";
import { AUSD_ADDRESS, AUSD_DECIMALS, isMainnet, publicClient } from "@/lib/config";
import { ausdAbi } from "@/lib/contracts";
import { topUpGas } from "@/lib/gas";
import { withRelayerLock } from "@/lib/relayer";

const MIN_DOLLARS = parseUnits("1", AUSD_DECIMALS);
const COOLDOWN_MS = 10 * 60 * 1000;
const lastTopUp = new Map<string, number>();

/**
 * Testnet only: a recipient who collected dollars (the relayer paid that gas) has no MON for cashing out. Give them
 * a little, but only if they hold at least $1 of AUSD, at most once every 10 minutes.
 */
export async function POST(request: Request) {
  if (isMainnet) return Response.json({ error: "Not available." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const address = (body as { address?: string } | null)?.address;
  if (!address || !isAddress(address)) return Response.json({ error: "Invalid address." }, { status: 400 });

  const key = address.toLowerCase();
  const last = lastTopUp.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) return Response.json({ ok: true });

  const dollars = await publicClient.readContract({
    address: AUSD_ADDRESS,
    abi: ausdAbi,
    functionName: "balanceOf",
    args: [address as Address],
  });
  if (dollars < MIN_DOLLARS) return Response.json({ error: "Nothing to cash out." }, { status: 400 });

  lastTopUp.set(key, Date.now());
  try {
    await withRelayerLock(() => topUpGas(address as Address));
    return Response.json({ ok: true });
  } catch (err) {
    lastTopUp.delete(key);
    console.error("gas top-up failed", err);
    return Response.json({ error: "Could not prepare your account right now. Try again in a minute." }, { status: 502 });
  }
}

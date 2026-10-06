import { isAddress, isAddressEqual, isHex, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { claimTypedData } from "@/lib/claimLink";
import { ESCROW_ADDRESS, publicClient } from "@/lib/config";
import { escrowAbi, toTransfer, TransferStatus } from "@/lib/contracts";
import { relayerClient, withRelayerLock } from "@/lib/relayer";

const inFlight = new Set<string>();

/**
 * Submit a claim on the recipient's behalf so they never need gas.
 * The signature already names the recipient, so the relayer cannot change where the money goes.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { id, recipient, signature } = (body ?? {}) as { id?: string; recipient?: string; signature?: string };

  if (!id || !/^\d+$/.test(id) || !recipient || !isAddress(recipient) || !signature || !isHex(signature)) {
    return Response.json({ error: "Invalid claim request." }, { status: 400 });
  }
  const transferId = BigInt(id);

  const transfer = toTransfer(
    await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "transfers",
      args: [transferId],
    }),
  );
  if (transfer.status !== TransferStatus.Pending) {
    return Response.json({ error: "This link has already been used or was cancelled." }, { status: 409 });
  }
  if (BigInt(Math.floor(Date.now() / 1000)) > transfer.expiresAt) {
    return Response.json({ error: "This link has expired." }, { status: 410 });
  }

  // Check the signature here first so invalid requests never cost the relayer gas.
  const signer = await recoverTypedDataAddress({
    ...claimTypedData(transferId, recipient as Address),
    signature: signature as Hex,
  });
  if (!isAddressEqual(signer, transfer.claimKey)) {
    return Response.json({ error: "This link is not valid." }, { status: 401 });
  }

  if (inFlight.has(id)) {
    return Response.json({ error: "This claim is already being processed." }, { status: 409 });
  }
  inFlight.add(id);
  try {
    const hash = await withRelayerLock(async () => {
      const wallet = relayerClient();
      const { request: tx } = await publicClient.simulateContract({
        account: wallet.account,
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "claim",
        args: [transferId, recipient as Address, signature as Hex],
      });
      const sent = await wallet.writeContract(tx);
      await publicClient.waitForTransactionReceipt({ hash: sent });
      return sent;
    });
    return Response.json({ hash, amount: transfer.amount.toString() });
  } catch (err) {
    console.error("claim failed", err);
    return Response.json({ error: "The claim could not be completed. Please try again." }, { status: 502 });
  } finally {
    inFlight.delete(id);
  }
}

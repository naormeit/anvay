"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, erc20Abi, formatUnits, isAddressEqual, type Address } from "viem";
import { AUSD_ADDRESS, explorerAddress, explorerTx, isMainnet, publicClient } from "@/lib/config";
import { ausdAbi } from "@/lib/contracts";
import { formatUsd, parseUsd } from "@/lib/format";
import { instantSettlement, pairAbi, whitelisterAbi } from "@/lib/instantSettlement";
import { useSendTx } from "@/lib/useSendTx";
import { BoltIcon } from "./icons";
import { Button, Card, CardTitle, Notice } from "./ui";

type PairInfo = { outToken: Address; outDecimals: number; outBalance: bigint; approved: boolean };

async function readPair(owner: Address): Promise<PairInfo> {
  const { pair } = instantSettlement;
  const [token0, token1, dec0, dec1, approved] = await Promise.all([
    publicClient.readContract({ address: pair, abi: pairAbi, functionName: "token0" }),
    publicClient.readContract({ address: pair, abi: pairAbi, functionName: "token1" }),
    publicClient.readContract({ address: pair, abi: pairAbi, functionName: "token0Decimals" }),
    publicClient.readContract({ address: pair, abi: pairAbi, functionName: "token1Decimals" }),
    publicClient.readContract({ address: pair, abi: pairAbi, functionName: "hasRole", args: ["APPROVED_SWAPPER", owner] }),
  ]);
  const ausdIs0 = isAddressEqual(token0, AUSD_ADDRESS);
  const outToken = ausdIs0 ? token1 : token0;
  const outBalance = await publicClient.readContract({
    address: outToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
  return { outToken, outDecimals: ausdIs0 ? dec1 : dec0, outBalance, approved };
}

/**
 * Cash out: swap AUSD 1:1 for another stablecoin through Agora's Instant Settlement pool, in the user's own wallet.
 * On mainnet that's USDC (accepted by most exchanges and off-ramps in India); on testnet it's Agora's test token CTK.
 * Paying out rupees to a bank account needs a licensed partner and is shown as the next step, not faked.
 */
export function CashOutCard({
  address,
  balance,
  onChange,
}: {
  address: Address;
  balance: bigint | null;
  onChange: () => void;
}) {
  const { submit, confirm } = useSendTx();
  const [info, setInfo] = useState<PairInfo | null>(null);
  const [version, setVersion] = useState(0);
  const [input, setInput] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: bigint; hash: string } | null>(null);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    readPair(address)
      .then((i) => !cancelled && setInfo(i))
      .catch(() => !cancelled && setInfo(null));
    return () => {
      cancelled = true;
    };
  }, [address, version]);

  const { outSymbol, pair, whitelister } = instantSettlement;
  const outDollars = info ? Number(formatUnits(info.outBalance, info.outDecimals)) : 0;
  if (!info || ((balance ?? BigInt(0)) === BigInt(0) && outDollars === 0 && !done)) return null;

  async function cashOut() {
    if (!info || balance === null) return;
    const units = input.trim() ? parseUsd(input) : balance;
    if (!units) return setError("Enter an amount, like 25 or 25.50.");
    if (units > balance) return setError("You don't have that many dollars.");
    setError(null);
    setDone(null);
    try {
      if (!isMainnet) {
        // Recipients usually hold no MON (the relayer paid for collecting); get a little for these transactions.
        setStep("Preparing…");
        const res = await fetch("/api/gas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not prepare your account.");
      }
      if (!info.approved) {
        if (!whitelister) throw new Error("Cashing out on mainnet needs a one-time Agora verification.");
        setStep("Enabling cash-out (one time)…");
        await confirm(
          await submit(whitelister, encodeFunctionData({ abi: whitelisterAbi, functionName: "setApprovedSwapper", args: [address] })),
        );
      }
      const allowance = await publicClient.readContract({
        address: AUSD_ADDRESS,
        abi: ausdAbi,
        functionName: "allowance",
        args: [address, pair],
      });
      if (allowance < units) {
        setStep("Approving…");
        await confirm(await submit(AUSD_ADDRESS, encodeFunctionData({ abi: ausdAbi, functionName: "approve", args: [pair, units] })));
      }
      setStep("Cashing out…");
      const path = [AUSD_ADDRESS, info.outToken];
      const [, quoted] = await publicClient.readContract({
        address: pair,
        abi: pairAbi,
        functionName: "getAmountsOut",
        args: [units, path],
      });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const hash = await submit(
        pair,
        encodeFunctionData({
          abi: pairAbi,
          functionName: "swapExactTokensForTokens",
          // Fixed-price pool: accept at most 0.1% less than the quote.
          args: [units, (quoted * BigInt(999)) / BigInt(1000), path, address, deadline],
        }),
      );
      await confirm(hash);
      setDone({ amount: units, hash });
      setInput("");
      refresh();
      onChange();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error && err.message.length < 140 ? err.message : "Cash-out failed. Please try again.");
    } finally {
      setStep(null);
    }
  }

  return (
    <Card tint="amber" className="flex flex-col gap-3">
      <CardTitle icon={<BoltIcon className="h-4 w-4" />}>Cash out</CardTitle>
      <p className="text-sm text-muted">
        Swap your dollars 1:1 for {isMainnet ? "USDC" : "a USDC stand-in"} through Agora&apos;s Instant Settlement, at a
        fixed price with no slippage. USDC is accepted by most exchanges and cash-out services in India.
      </p>

      {balance !== null && balance > BigInt(0) && (
        <div className="flex gap-2">
          <label className="flex h-11 flex-1 items-center gap-1 rounded-xl border border-border bg-card px-3">
            <span className="text-muted">$</span>
            <input
              inputMode="decimal"
              aria-label="Amount to cash out"
              placeholder={formatUsd(balance).replace("$", "")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-transparent outline-none"
            />
          </label>
          <Button onClick={cashOut} disabled={step !== null}>
            {step ?? (input.trim() ? "Cash out" : "Cash out all")}
          </Button>
        </div>
      )}

      {error && <Notice tone="danger">{error}</Notice>}
      {done && (
        <Notice tone="success">
          Cashed out {formatUsd(done.amount)}.{" "}
          <a className="underline" href={explorerTx(done.hash)} target="_blank" rel="noopener noreferrer">
            View on explorer
          </a>
        </Notice>
      )}

      {outDollars > 0 && (
        <p className="text-sm">
          Cashed out:{" "}
          <span className="font-semibold tabular-nums">
            {outDollars.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </span>{" "}
          <a className="text-xs text-muted underline" href={explorerAddress(info.outToken)} target="_blank" rel="noopener noreferrer">
            {outSymbol}
          </a>
        </p>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border px-3 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium">To your bank account (UPI)</span>
          <span className="text-xs text-muted">Rupees to any Indian bank, through a licensed partner</span>
        </div>
        <span className="shrink-0 rounded-full bg-muted/15 px-2 py-0.5 text-[11px] font-medium text-muted">Next</span>
      </div>
    </Card>
  );
}

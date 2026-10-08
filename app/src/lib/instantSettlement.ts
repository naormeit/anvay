import { parseAbi, type Address } from "viem";
import { isMainnet } from "./config";

/**
 * Agora Instant Settlement: fixed-price swaps between AUSD and other stablecoins, with no slippage
 * (docs.agora.finance/instant-settlement). Anvay uses it to cash a recipient's AUSD out into a widely accepted
 * stablecoin. On Monad mainnet the pair is AUSD/USDC and swapping needs Agora KYC. On testnet the pair is AUSD/CTK
 * (Agora's test stand-in for USDC), and any wallet can whitelist itself.
 */
export const instantSettlement = isMainnet
  ? {
      pair: "0xf33286E3222D1c829dACeac48c0Ec651F6452470" as Address, // AUSD/USDC
      outSymbol: "USDC",
      whitelister: null, // swapping needs Agora KYC on mainnet
    }
  : {
      pair: "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae" as Address, // CTK/AUSD
      outSymbol: "CTK",
      whitelister: "0x7c10F56d6f04a51376393a1C3670e966863F6BD5" as Address,
    };

export const pairAbi = parseAbi([
  "function hasRole(string role, address account) view returns (bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function token0Decimals() view returns (uint8)",
  "function token1Decimals() view returns (uint8)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
]);

export const whitelisterAbi = parseAbi(["function setApprovedSwapper(address swapper)"]);

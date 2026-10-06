import { parseAbi } from "viem";

export const escrowAbi = parseAbi([
  "function deposit(uint96 amount, address claimKey, uint64 expiresAt) returns (uint256 id)",
  "function claim(uint256 id, address recipient, bytes signature)",
  "function cancel(uint256 id)",
  "function transferCount() view returns (uint256)",
  "function transfers(uint256 id) view returns (address sender, uint64 expiresAt, uint8 status, address claimKey, uint96 amount)",
  "event Deposited(uint256 indexed id, address indexed sender, address indexed claimKey, uint96 amount, uint64 expiresAt)",
  "error ZeroAmount()",
  "error ZeroAddress()",
  "error ExpiryInPast()",
  "error NotPending()",
  "error Expired()",
  "error InvalidSignature()",
  "error NotSender()",
]);

export const ausdAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);

/** Mirrors ClaimLinkEscrow.Status. */
export const TransferStatus = { None: 0, Pending: 1, Claimed: 2, Cancelled: 3 } as const;

export type OnchainTransfer = {
  sender: `0x${string}`;
  expiresAt: bigint;
  status: number;
  claimKey: `0x${string}`;
  amount: bigint;
};

export function toTransfer([sender, expiresAt, status, claimKey, amount]: readonly [
  `0x${string}`,
  bigint,
  number,
  `0x${string}`,
  bigint,
]): OnchainTransfer {
  return { sender, expiresAt, status, claimKey, amount };
}

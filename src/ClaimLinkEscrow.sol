// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClaimLinkEscrow
/// @notice Holds a stablecoin transfer until the recipient claims it with a one-time link key.
/// @dev The sender's app generates a throwaway keypair and puts the private key in the claim
///      link. Only its address (`claimKey`) is stored here. To claim, the recipient's app signs
///      "pay transfer `id` to `recipient`" with that key. Because the signature names the
///      recipient, anyone can submit the claim (so a relayer can pay gas), but nobody who copies
///      the transaction can redirect the funds.
contract ClaimLinkEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Pending,
        Claimed,
        Cancelled
    }

    struct Transfer {
        address sender;
        uint64 expiresAt;
        Status status;
        address claimKey;
        uint96 amount;
    }

    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(uint256 transferId,address recipient)");

    IERC20 public immutable token;

    uint256 public transferCount;
    mapping(uint256 id => Transfer) public transfers;

    event Deposited(
        uint256 indexed id, address indexed sender, address indexed claimKey, uint96 amount, uint64 expiresAt
    );
    event Claimed(uint256 indexed id, address indexed recipient, address relayer, uint96 amount);
    event Cancelled(uint256 indexed id, address indexed sender, uint96 amount);

    error ZeroAmount();
    error ZeroAddress();
    error ExpiryInPast();
    error NotPending();
    error Expired();
    error InvalidSignature();
    error NotSender();

    constructor(IERC20 token_) EIP712("ClaimLinkEscrow", "1") {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
    }

    /// @notice Lock `amount` tokens that can be claimed by whoever holds the private key of `claimKey`.
    /// @dev The caller must approve this contract for `amount` first.
    function deposit(uint96 amount, address claimKey, uint64 expiresAt) external nonReentrant returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (claimKey == address(0)) revert ZeroAddress();
        // Expiry is measured in days; a validator nudging the timestamp by seconds does not matter.
        // forge-lint: disable-next-line(block-timestamp)
        if (expiresAt <= block.timestamp) revert ExpiryInPast();

        id = ++transferCount;
        transfers[id] = Transfer({
            sender: msg.sender, expiresAt: expiresAt, status: Status.Pending, claimKey: claimKey, amount: amount
        });

        emit Deposited(id, msg.sender, claimKey, amount, expiresAt);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Pay transfer `id` to `recipient`, authorised by a signature from the transfer's claim key.
    /// @dev Callable by anyone, so a relayer can submit it for a recipient who holds no gas.
    function claim(uint256 id, address recipient, bytes calldata signature) external nonReentrant {
        Transfer storage t = transfers[id];
        if (t.status != Status.Pending) revert NotPending();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > t.expiresAt) revert Expired();
        if (recipient == address(0)) revert ZeroAddress();

        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(claimDigest(id, recipient), signature);
        if (err != ECDSA.RecoverError.NoError || signer != t.claimKey) revert InvalidSignature();

        t.status = Status.Claimed;
        uint96 amount = t.amount;

        // The only call before this is the ecrecover precompile, which cannot re-enter.
        // forge-lint: disable-next-line(reentrancy-events)
        emit Claimed(id, recipient, msg.sender, amount);
        token.safeTransfer(recipient, amount);
    }

    /// @notice Return an unclaimed transfer to its sender. Allowed at any time before it is claimed.
    function cancel(uint256 id) external nonReentrant {
        Transfer storage t = transfers[id];
        if (t.status != Status.Pending) revert NotPending();
        if (msg.sender != t.sender) revert NotSender();

        t.status = Status.Cancelled;
        uint96 amount = t.amount;

        emit Cancelled(id, t.sender, amount);
        token.safeTransfer(t.sender, amount);
    }

    /// @notice The EIP-712 digest the claim key must sign to pay transfer `id` to `recipient`.
    function claimDigest(uint256 id, address recipient) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, id, recipient)));
    }
}

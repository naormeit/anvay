// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ClaimLinkEscrow} from "../src/ClaimLinkEscrow.sol";
import {MockAUSD} from "../src/MockAUSD.sol";

contract ClaimLinkEscrowTest is Test {
    event Deposited(
        uint256 indexed id, address indexed sender, address indexed claimKey, uint96 amount, uint64 expiresAt
    );
    event Claimed(uint256 indexed id, address indexed recipient, address relayer, uint96 amount);
    event Cancelled(uint256 indexed id, address indexed sender, uint96 amount);

    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    MockAUSD internal token;
    ClaimLinkEscrow internal escrow;

    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");
    address internal relayer = makeAddr("relayer");
    address internal attacker = makeAddr("attacker");

    uint256 internal claimPk = 0xA11CE;
    address internal claimKey;

    uint96 internal constant AMOUNT = 50e6; // 50 AUSD
    uint64 internal expiresAt;

    function setUp() public {
        token = new MockAUSD();
        escrow = new ClaimLinkEscrow(IERC20(address(token)));
        claimKey = vm.addr(claimPk);
        expiresAt = uint64(block.timestamp + 7 days);

        token.mint(sender, 1_000e6);
        vm.prank(sender);
        token.approve(address(escrow), type(uint256).max);
    }

    function _deposit(uint96 amount) internal returns (uint256) {
        vm.prank(sender);
        return escrow.deposit(amount, claimKey, expiresAt);
    }

    function _sign(ClaimLinkEscrow target, uint256 pk, uint256 id, address to) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, target.claimDigest(id, to));
        return abi.encodePacked(r, s, v);
    }

    function _status(uint256 id) internal view returns (ClaimLinkEscrow.Status status) {
        (,, status,,) = escrow.transfers(id);
    }

    // ---------------------------------------------------------------- deposit

    function test_Deposit_StoresTransferAndPullsTokens() public {
        vm.expectEmit(address(escrow));
        emit Deposited(1, sender, claimKey, AMOUNT, expiresAt);
        uint256 id = _deposit(AMOUNT);

        (address s, uint64 exp, ClaimLinkEscrow.Status status, address key, uint96 amount) = escrow.transfers(id);
        assertEq(id, 1);
        assertEq(s, sender);
        assertEq(exp, expiresAt);
        assertEq(uint8(status), uint8(ClaimLinkEscrow.Status.Pending));
        assertEq(key, claimKey);
        assertEq(amount, AMOUNT);
        assertEq(token.balanceOf(address(escrow)), AMOUNT);
        assertEq(token.balanceOf(sender), 1_000e6 - AMOUNT);
    }

    function test_Deposit_IdsIncrement() public {
        assertEq(_deposit(AMOUNT), 1);
        assertEq(_deposit(AMOUNT), 2);
        assertEq(escrow.transferCount(), 2);
    }

    function test_Deposit_RevertsOnZeroAmount() public {
        vm.prank(sender);
        vm.expectRevert(ClaimLinkEscrow.ZeroAmount.selector);
        escrow.deposit(0, claimKey, expiresAt);
    }

    function test_Deposit_RevertsOnZeroClaimKey() public {
        vm.prank(sender);
        vm.expectRevert(ClaimLinkEscrow.ZeroAddress.selector);
        escrow.deposit(AMOUNT, address(0), expiresAt);
    }

    function test_Deposit_RevertsOnExpiryNotInFuture() public {
        vm.prank(sender);
        vm.expectRevert(ClaimLinkEscrow.ExpiryInPast.selector);
        escrow.deposit(AMOUNT, claimKey, uint64(block.timestamp));
    }

    function test_Deposit_RevertsWithoutApproval() public {
        address poor = makeAddr("poor");
        token.mint(poor, AMOUNT);
        vm.prank(poor);
        vm.expectRevert();
        escrow.deposit(AMOUNT, claimKey, expiresAt);
    }

    function test_Constructor_RevertsOnZeroToken() public {
        vm.expectRevert(ClaimLinkEscrow.ZeroAddress.selector);
        new ClaimLinkEscrow(IERC20(address(0)));
    }

    // ------------------------------------------------------------------ claim

    function test_Claim_RelayerSubmitsAndRecipientIsPaid() public {
        uint256 id = _deposit(AMOUNT);
        bytes memory sig = _sign(escrow, claimPk, id, recipient);

        vm.expectEmit(address(escrow));
        emit Claimed(id, recipient, relayer, AMOUNT);
        vm.prank(relayer);
        escrow.claim(id, recipient, sig);

        assertEq(token.balanceOf(recipient), AMOUNT);
        assertEq(token.balanceOf(relayer), 0);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(uint8(_status(id)), uint8(ClaimLinkEscrow.Status.Claimed));
    }

    function test_Claim_WorksAtExactExpiry() public {
        uint256 id = _deposit(AMOUNT);
        vm.warp(expiresAt);
        escrow.claim(id, recipient, _sign(escrow, claimPk, id, recipient));
        assertEq(token.balanceOf(recipient), AMOUNT);
    }

    function test_Claim_RevertsAfterExpiry() public {
        uint256 id = _deposit(AMOUNT);
        bytes memory sig = _sign(escrow, claimPk, id, recipient);
        vm.warp(uint256(expiresAt) + 1);
        vm.expectRevert(ClaimLinkEscrow.Expired.selector);
        escrow.claim(id, recipient, sig);
    }

    function test_Claim_RevertsWhenSignedByWrongKey() public {
        uint256 id = _deposit(AMOUNT);
        bytes memory sig = _sign(escrow, 0xB0B, id, recipient);
        vm.expectRevert(ClaimLinkEscrow.InvalidSignature.selector);
        escrow.claim(id, recipient, sig);
    }

    /// Someone who copies a pending claim transaction cannot swap in their own address.
    function test_Claim_FrontRunnerCannotRedirectFunds() public {
        uint256 id = _deposit(AMOUNT);
        bytes memory sig = _sign(escrow, claimPk, id, recipient);

        vm.prank(attacker);
        vm.expectRevert(ClaimLinkEscrow.InvalidSignature.selector);
        escrow.claim(id, attacker, sig);

        escrow.claim(id, recipient, sig);
        assertEq(token.balanceOf(recipient), AMOUNT);
        assertEq(token.balanceOf(attacker), 0);
    }

    /// A signature for one transfer cannot claim another transfer that uses the same claim key.
    function test_Claim_SignatureNotReusableAcrossTransfers() public {
        uint256 first = _deposit(AMOUNT);
        uint256 second = _deposit(AMOUNT);
        bytes memory sigForFirst = _sign(escrow, claimPk, first, recipient);

        vm.expectRevert(ClaimLinkEscrow.InvalidSignature.selector);
        escrow.claim(second, recipient, sigForFirst);
    }

    /// A signature made for one escrow deployment is rejected by another (EIP-712 domain separation).
    function test_Claim_SignatureNotReusableAcrossEscrows() public {
        ClaimLinkEscrow other = new ClaimLinkEscrow(IERC20(address(token)));
        vm.prank(sender);
        token.approve(address(other), type(uint256).max);
        vm.prank(sender);
        uint256 id = other.deposit(AMOUNT, claimKey, expiresAt);

        bytes memory sigForWrongEscrow = _sign(escrow, claimPk, id, recipient);
        vm.expectRevert(ClaimLinkEscrow.InvalidSignature.selector);
        other.claim(id, recipient, sigForWrongEscrow);
    }

    function test_Claim_RevertsOnSecondClaim() public {
        uint256 id = _deposit(AMOUNT);
        bytes memory sig = _sign(escrow, claimPk, id, recipient);
        escrow.claim(id, recipient, sig);

        vm.expectRevert(ClaimLinkEscrow.NotPending.selector);
        escrow.claim(id, recipient, sig);
    }

    function test_Claim_RevertsOnMalformedSignature() public {
        uint256 id = _deposit(AMOUNT);
        vm.expectRevert(ClaimLinkEscrow.InvalidSignature.selector);
        escrow.claim(id, recipient, hex"deadbeef");
    }

    /// The "other half" of a valid signature (high s) is rejected, so signatures are not malleable.
    function test_Claim_RevertsOnMalleatedSignature() public {
        uint256 id = _deposit(AMOUNT);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(claimPk, escrow.claimDigest(id, recipient));
        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;

        vm.expectRevert(ClaimLinkEscrow.InvalidSignature.selector);
        escrow.claim(id, recipient, abi.encodePacked(r, highS, flippedV));
    }

    function test_Claim_RevertsOnZeroRecipient() public {
        uint256 id = _deposit(AMOUNT);
        bytes memory sig = _sign(escrow, claimPk, id, address(0));
        vm.expectRevert(ClaimLinkEscrow.ZeroAddress.selector);
        escrow.claim(id, address(0), sig);
    }

    function test_Claim_RevertsOnUnknownId() public {
        bytes memory sig = _sign(escrow, claimPk, 42, recipient);
        vm.expectRevert(ClaimLinkEscrow.NotPending.selector);
        escrow.claim(42, recipient, sig);
    }

    // ----------------------------------------------------------------- cancel

    function test_Cancel_RefundsSender() public {
        uint256 id = _deposit(AMOUNT);

        vm.expectEmit(address(escrow));
        emit Cancelled(id, sender, AMOUNT);
        vm.prank(sender);
        escrow.cancel(id);

        assertEq(token.balanceOf(sender), 1_000e6);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(uint8(_status(id)), uint8(ClaimLinkEscrow.Status.Cancelled));
    }

    function test_Cancel_WorksAfterExpiry() public {
        uint256 id = _deposit(AMOUNT);
        vm.warp(uint256(expiresAt) + 30 days);
        vm.prank(sender);
        escrow.cancel(id);
        assertEq(token.balanceOf(sender), 1_000e6);
    }

    function test_Cancel_RevertsForNonSender() public {
        uint256 id = _deposit(AMOUNT);
        vm.prank(attacker);
        vm.expectRevert(ClaimLinkEscrow.NotSender.selector);
        escrow.cancel(id);
    }

    function test_Cancel_RevertsAfterClaim() public {
        uint256 id = _deposit(AMOUNT);
        escrow.claim(id, recipient, _sign(escrow, claimPk, id, recipient));

        vm.prank(sender);
        vm.expectRevert(ClaimLinkEscrow.NotPending.selector);
        escrow.cancel(id);
    }

    function test_Claim_RevertsAfterCancel() public {
        uint256 id = _deposit(AMOUNT);
        bytes memory sig = _sign(escrow, claimPk, id, recipient);
        vm.prank(sender);
        escrow.cancel(id);

        vm.expectRevert(ClaimLinkEscrow.NotPending.selector);
        escrow.claim(id, recipient, sig);
    }

    // ------------------------------------------------------------------- fuzz

    function testFuzz_DepositThenClaim(uint96 amount, uint256 keySeed, address to) public {
        amount = uint96(bound(amount, 1, 1_000e6));
        uint256 pk = bound(keySeed, 1, SECP256K1_N - 1);
        vm.assume(to != address(0) && to != address(escrow) && to != sender);

        vm.prank(sender);
        uint256 id = escrow.deposit(amount, vm.addr(pk), expiresAt);
        escrow.claim(id, to, _sign(escrow, pk, id, to));

        assertEq(token.balanceOf(to), amount);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    /// The escrow always holds exactly the sum of pending transfers.
    function testFuzz_BalanceMatchesPendingTransfers(uint8 count, uint256 actions) public {
        count = uint8(bound(count, 1, 12));
        uint256 pending;
        for (uint256 i = 1; i <= count; i++) {
            uint96 amount = uint96(bound(uint256(keccak256(abi.encode(actions, i))), 1, 50e6));
            uint256 id = _deposit(amount);
            uint256 action = (actions >> (i * 2)) % 3;
            if (action == 0) {
                escrow.claim(id, recipient, _sign(escrow, claimPk, id, recipient));
            } else if (action == 1) {
                vm.prank(sender);
                escrow.cancel(id);
            } else {
                pending += amount;
            }
        }
        assertEq(token.balanceOf(address(escrow)), pending);
    }
}

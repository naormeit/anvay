// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {InrRateFeed, IReceiver} from "../src/InrRateFeed.sol";

contract InrRateFeedTest is Test {
    event RateUpdated(uint256 inrPerUsdE6, uint64 observedAt);

    InrRateFeed internal feed;
    address internal forwarder = makeAddr("forwarder");
    address internal attacker = makeAddr("attacker");

    function setUp() public {
        feed = new InrRateFeed(forwarder);
    }

    function _report(uint256 rate, uint64 observed) internal pure returns (bytes memory) {
        return abi.encode(rate, observed);
    }

    function test_ForwarderReportUpdatesRate() public {
        vm.warp(1_800_000_000);
        vm.expectEmit(address(feed));
        emit RateUpdated(96_380408, 1_799_999_990);
        vm.prank(forwarder);
        feed.onReport("", _report(96_380408, 1_799_999_990));

        (uint256 rate, uint64 observed, uint64 updated) = feed.latest();
        assertEq(rate, 96_380408);
        assertEq(observed, 1_799_999_990);
        assertEq(updated, 1_800_000_000);
    }

    function test_RejectsReportsNotFromForwarder() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(InrRateFeed.InvalidSender.selector, attacker));
        feed.onReport("", _report(96e6, 1));
    }

    function test_RejectsImplausibleRates() public {
        vm.startPrank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(InrRateFeed.RateOutOfRange.selector, 9_999999));
        feed.onReport("", _report(9_999999, 1));
        vm.expectRevert(abi.encodeWithSelector(InrRateFeed.RateOutOfRange.selector, 1000_000001));
        feed.onReport("", _report(1000_000001, 1));
        vm.stopPrank();
    }

    function test_RejectsStaleOrReplayedReports() public {
        vm.startPrank(forwarder);
        feed.onReport("", _report(96e6, 100));
        vm.expectRevert(abi.encodeWithSelector(InrRateFeed.StaleReport.selector, 100, 100));
        feed.onReport("", _report(97e6, 100));
        vm.expectRevert(abi.encodeWithSelector(InrRateFeed.StaleReport.selector, 99, 100));
        feed.onReport("", _report(97e6, 99));
        feed.onReport("", _report(97e6, 101));
        vm.stopPrank();
        (uint256 rate,,) = feed.latest();
        assertEq(rate, 97e6);
    }

    function test_OwnerCanSwitchForwarder() public {
        address production = makeAddr("production");
        feed.setForwarder(production);
        assertEq(feed.forwarder(), production);

        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(InrRateFeed.InvalidSender.selector, forwarder));
        feed.onReport("", _report(96e6, 1));
    }

    function test_OnlyOwnerSwitchesForwarder() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        feed.setForwarder(attacker);
    }

    function test_RejectsZeroForwarder() public {
        vm.expectRevert(InrRateFeed.ZeroAddress.selector);
        new InrRateFeed(address(0));
        vm.expectRevert(InrRateFeed.ZeroAddress.selector);
        feed.setForwarder(address(0));
    }

    function test_SupportsReceiverInterface() public view {
        assertTrue(feed.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(feed.supportsInterface(type(IERC165).interfaceId));
        assertFalse(feed.supportsInterface(0xdeadbeef));
    }

    function testFuzz_AcceptsAnyPlausibleRate(uint256 rate, uint64 observed) public {
        rate = bound(rate, feed.MIN_RATE_E6(), feed.MAX_RATE_E6());
        observed = uint64(bound(observed, 1, type(uint64).max));
        vm.prank(forwarder);
        feed.onReport("", _report(rate, observed));
        assertEq(feed.inrPerUsdE6(), rate);
    }
}

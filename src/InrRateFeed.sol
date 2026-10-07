// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice Chainlink CRE consumer interface: the Keystone forwarder delivers workflow reports through `onReport`.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title InrRateFeed
/// @notice USD->INR rate written by a Chainlink CRE workflow that takes the median of several public FX sources.
/// @dev Only the configured Chainlink forwarder may deliver reports. Out-of-order and implausible reports are rejected.
///      Report encoding: abi.encode(uint256 inrPerUsdE6, uint64 observedAt).
contract InrRateFeed is IReceiver, Ownable {
    /// @notice Rates outside this band are rejected as implausible (in INR per USD, 6 decimals).
    uint256 public constant MIN_RATE_E6 = 10e6;
    uint256 public constant MAX_RATE_E6 = 1000e6;

    address public forwarder;
    uint256 public inrPerUsdE6;
    uint64 public observedAt;
    uint64 public updatedAt;

    event RateUpdated(uint256 inrPerUsdE6, uint64 observedAt);
    event ForwarderUpdated(address indexed previous, address indexed next);

    error InvalidSender(address sender);
    error ZeroAddress();
    error RateOutOfRange(uint256 inrPerUsdE6);
    error StaleReport(uint64 observedAt, uint64 latestObservedAt);

    constructor(address forwarder_) Ownable(msg.sender) {
        if (forwarder_ == address(0)) revert ZeroAddress();
        forwarder = forwarder_;
        emit ForwarderUpdated(address(0), forwarder_);
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert InvalidSender(msg.sender);
        (uint256 rate, uint64 observed) = abi.decode(report, (uint256, uint64));
        if (rate < MIN_RATE_E6 || rate > MAX_RATE_E6) revert RateOutOfRange(rate);
        if (observed <= observedAt) revert StaleReport(observed, observedAt);

        inrPerUsdE6 = rate;
        observedAt = observed;
        // uint64 seconds lasts ~5.8e11 years.
        // forge-lint: disable-next-line(unsafe-typecast)
        updatedAt = uint64(block.timestamp);
        emit RateUpdated(rate, observed);
    }

    /// @notice Latest rate and when the workflow observed it.
    function latest() external view returns (uint256 rateE6, uint64 observed, uint64 updated) {
        return (inrPerUsdE6, observedAt, updatedAt);
    }

    /// @notice Switch forwarders, e.g. from the simulation forwarder to the production one.
    function setForwarder(address forwarder_) external onlyOwner {
        if (forwarder_ == address(0)) revert ZeroAddress();
        emit ForwarderUpdated(forwarder, forwarder_);
        forwarder = forwarder_;
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

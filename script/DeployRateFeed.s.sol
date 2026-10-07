// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {InrRateFeed} from "../src/InrRateFeed.sol";

/// @notice Deploys InrRateFeed wired to the Chainlink CRE forwarder for this chain.
/// @dev Set CRE_FORWARDER=production to use the production KeystoneForwarder; the default is the simulation forwarder
///      that `cre workflow simulate --broadcast` writes through.
contract DeployRateFeed is Script {
    // https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts
    address internal constant MONAD_TESTNET_SIM = 0xB9F79d863261869B234c481D1f9A7af84AeAd192;
    address internal constant MONAD_TESTNET_PROD = 0xF8344CFd5c43616a4366C34E3EEE75af79a74482;
    address internal constant MONAD_MAINNET_SIM = 0x9eF6468C5f37b976E57d52054c693269479A784d;
    address internal constant MONAD_MAINNET_PROD = 0x76c9cf548b4179F8901cda1f8623568b58215E62;

    function run() external returns (InrRateFeed feed) {
        bool production = keccak256(bytes(vm.envOr("CRE_FORWARDER", string("simulation")))) == keccak256("production");
        address forwarder;
        if (block.chainid == 143) forwarder = production ? MONAD_MAINNET_PROD : MONAD_MAINNET_SIM;
        else if (block.chainid == 10143) forwarder = production ? MONAD_TESTNET_PROD : MONAD_TESTNET_SIM;
        else revert("unsupported chain");

        vm.startBroadcast();
        feed = new InrRateFeed(forwarder);
        vm.stopBroadcast();

        console.log("InrRateFeed:", address(feed));
        console.log("Forwarder:", forwarder, production ? "(production)" : "(simulation)");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ClaimLinkEscrow} from "../src/ClaimLinkEscrow.sol";
import {MockAUSD} from "../src/MockAUSD.sol";

/// @notice Deploys the escrow. On Monad mainnet it uses real AUSD; anywhere else it deploys MockAUSD first.
contract DeployEscrow is Script {
    uint256 internal constant MONAD_MAINNET = 143;
    address internal constant MAINNET_AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;

    function run() external returns (ClaimLinkEscrow escrow, address token) {
        vm.startBroadcast();
        if (block.chainid == MONAD_MAINNET) {
            token = MAINNET_AUSD;
        } else {
            token = address(new MockAUSD());
        }
        escrow = new ClaimLinkEscrow(IERC20(token));
        vm.stopBroadcast();

        console.log("Chain ID:", block.chainid);
        console.log("AUSD token:", token);
        console.log("ClaimLinkEscrow:", address(escrow));
    }
}

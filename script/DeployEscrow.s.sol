// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ClaimLinkEscrow} from "../src/ClaimLinkEscrow.sol";
import {MockAUSD} from "../src/MockAUSD.sol";

/// @notice Deploys the escrow. On Monad mainnet and testnet it uses Agora's AUSD; on a local chain it deploys MockAUSD.
contract DeployEscrow is Script {
    uint256 internal constant MONAD_MAINNET = 143;
    uint256 internal constant MONAD_TESTNET = 10143;
    address internal constant MAINNET_AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
    /// Agora's official AUSD on Monad testnet (docs.agora.finance/developer/contract-deployments).
    address internal constant TESTNET_AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;

    function run() external returns (ClaimLinkEscrow escrow, address token) {
        vm.startBroadcast();
        if (block.chainid == MONAD_MAINNET) {
            token = MAINNET_AUSD;
        } else if (block.chainid == MONAD_TESTNET) {
            token = TESTNET_AUSD;
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

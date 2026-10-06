// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockAUSD
/// @notice Testnet stand-in for Agora's AUSD, which only exists on Monad mainnet.
/// @dev Anyone can mint. Never deploy this to mainnet.
contract MockAUSD is ERC20 {
    constructor() ERC20("Mock Agora USD", "AUSD") {}

    /// @dev Matches real AUSD, which uses 6 decimals.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

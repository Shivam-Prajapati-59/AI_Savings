// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/// @notice Minimal interface every strategy must implement for vault compatibility.
/// @dev All amounts are denominated in the same token units as the Vault's `asset`.
interface IStrategy {
    /// @notice Called by the vault after the vault has transferred `amount` of asset to the strategy.
    /// @dev push pattern: the Vault pushes tokens first, then calls invest.
    function invest(uint256 amount) external;

    /// @notice Request strategy to return `amount` of asset back to the vault.
    /// @dev Strategy should transfer `amount` of the asset token back to the vault.
    function freeFunds(uint256 amount) external;

    /// @notice Report total assets under management, denominated in vault asset units.
    function totalAssets() external view returns (uint256);
}

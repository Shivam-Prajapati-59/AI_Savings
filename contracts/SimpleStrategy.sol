// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/// @notice Simple placeholder strategy that holds the vault asset and returns it on request.
/// @dev Uses push pattern: vault transfers tokens to this contract, then calls invest(amount).
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./IStrategy.sol";

contract SimpleStrategy is IStrategy, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    address public vault;

    event VaultChanged(address indexed oldVault, address indexed newVault);
    event Invested(address indexed vault, uint256 amount);
    event Freed(address indexed vault, uint256 amount);

    modifier onlyVault() {
        require(msg.sender == vault, "SimpleStrategy: only vault");
        _;
    }

    /// @param _asset Token this strategy will manage (must match vault asset)
    /// @param _vault Vault address
    /// @param _owner Owner (will be forwarded to Ownable constructor)
    constructor(IERC20 _asset, address _vault, address _owner) Ownable(_owner) {
        require(address(_asset) != address(0), "SimpleStrategy: asset zero");
        require(_vault != address(0), "SimpleStrategy: vault zero");
        asset = _asset;
        vault = _vault;
    }

    /// @notice Called by vault after the vault has transferred `amount` of tokens to this contract.
    /// @dev Implementation here may deposit into external protocols. For the simple MVP, we just keep the tokens.
    function invest(uint256 amount) external override onlyVault {
        require(amount > 0, "SimpleStrategy: zero amount");
        // Optionally do further actions (e.g., deposit to Aave) in future.
        emit Invested(msg.sender, amount);
    }

    /// @notice Return funds back to the vault.
    function freeFunds(uint256 amount) external override onlyVault {
        require(amount > 0, "SimpleStrategy: zero amount");
        asset.safeTransfer(vault, amount);
        emit Freed(msg.sender, amount);
    }

    /// @notice Report total assets (balance of this contract)
    function totalAssets() external view override returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /// @notice Change vault address (owner only)
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "SimpleStrategy: vault zero");
        emit VaultChanged(vault, _vault);
        vault = _vault;
    }

    /// @notice Sweep tokens other than the managed asset (owner only)
    function sweep(address token, address to) external onlyOwner {
        require(token != address(asset), "SimpleStrategy: cannot sweep asset");
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
    }
}

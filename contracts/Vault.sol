// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/// @title  Vault (ERC-4626) — corrected overrides, push-pattern
/// @notice Vault accepts deposits of `asset`, mints ERC-4626 shares, and delegates funds to a single strategy.
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./IStrategy.sol";

contract Vault is ERC4626, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    event StrategyUpdated(address indexed oldStrategy, address indexed newStrategy);
    event ManagerUpdated(address indexed oldManager, address indexed newManager);
    event StrategyInvest(address indexed caller, uint256 amount);
    event StrategyFreed(address indexed caller, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    IStrategy public strategy;
    address public manager;

    modifier onlyManagerOrOwner() {
        require(msg.sender == manager || msg.sender == owner(), "Vault: not manager/owner");
        _;
    }

    constructor(IERC20Metadata asset_)
        ERC20("Vault Ocean Token", "vOCT")
        ERC4626(asset_)
        Ownable(msg.sender)
    {}

    // --------------------------
    // Admin / roles
    // --------------------------
    function setManager(address _manager) external onlyOwner {
        address old = manager;
        manager = _manager;
        emit ManagerUpdated(old, _manager);
    }

    /// Must be paused to safely switch strategy
    function setStrategy(address _strategy) external onlyOwner whenPaused {
        address old = address(strategy);
        strategy = IStrategy(_strategy);
        emit StrategyUpdated(old, _strategy);
    }

    // --------------------------
    // totalAssets includes strategy assets
    // --------------------------
    function totalAssets() public view virtual override returns (uint256) {
        uint256 vaultBal = IERC20(asset()).balanceOf(address(this));
        uint256 stratBal = address(strategy) == address(0) ? 0 : strategy.totalAssets();
        return vaultBal + stratBal;
    }

    // --------------------------
    // Pause-aware deposit/mint overrides
    // --------------------------
    function deposit(uint256 assets, address receiver)
        public
        virtual
        override
        whenNotPaused
        returns (uint256)
    {
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        virtual
        override
        whenNotPaused
        returns (uint256)
    {
        return super.mint(shares, receiver);
    }

    // --------------------------
    // Withdraw / Redeem overrides — perform liquidity check BEFORE calling super
    // (We cannot rely on overriding internal hooks across OZ versions.)
    // --------------------------

    /// @notice Withdraw `assets` to `receiver`, burning shares from `owner_`
    /// @dev Ensure vault has enough liquid asset; if not, ask strategy to return funds.
    function withdraw(uint256 assets, address receiver, address owner_)
        public
        virtual
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        // If vault lacks liquidity, request strategy to free funds first.
        uint256 bal = IERC20(asset()).balanceOf(address(this));
        if (bal < assets) {
            uint256 need = assets - bal;
            require(address(strategy) != address(0), "Vault: no strategy");
            strategy.freeFunds(need);
        }

        // Now call base withdraw which will burn shares and transfer assets to receiver.
        return super.withdraw(assets, receiver, owner_);
    }

    /// @notice Redeem `shares` into assets for `receiver`, burning from `owner_`
    /// @dev Convert shares -> required assets, ensure liquidity, then call super.redeem.
    function redeem(uint256 shares, address receiver, address owner_)
        public
        virtual
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        // Compute asset amount that corresponds to `shares`.
        uint256 assetsRequired = convertToAssets(shares);

        // If vault lacks liquidity, ask strategy to free funds equal to the shortfall.
        uint256 bal = IERC20(asset()).balanceOf(address(this));
        if (bal < assetsRequired) {
            uint256 need = assetsRequired - bal;
            require(address(strategy) != address(0), "Vault: no strategy");
            strategy.freeFunds(need);
        }

        // Proceed with standard ERC4626 redeem logic.
        return super.redeem(shares, receiver, owner_);
    }

    // --------------------------
    // Manager functions (push-pattern)
    // --------------------------
    function manualInvest(uint256 amount) external nonReentrant onlyManagerOrOwner whenNotPaused {
        require(amount > 0, "Vault: zero amount");
        require(address(strategy) != address(0), "Vault: no strategy");

        IERC20 token = IERC20(asset());

        // push tokens to strategy (vault -> strategy)
        token.safeTransfer(address(strategy), amount);

        // notify strategy to finalize invest (e.g., deposit to lending DEX)
        strategy.invest(amount);

        emit StrategyInvest(msg.sender, amount);
    }

    function manualFree(uint256 amount) external nonReentrant onlyManagerOrOwner whenNotPaused {
        require(amount > 0, "Vault: zero amount");
        require(address(strategy) != address(0), "Vault: no strategy");

        strategy.freeFunds(amount);

        emit StrategyFreed(msg.sender, amount);
    }

    // --------------------------
    // User helpers
    // --------------------------
    function depositAll() external nonReentrant whenNotPaused {
        uint256 bal = IERC20(asset()).balanceOf(msg.sender);
        require(bal > 0, "Vault: nothing to deposit");
        deposit(bal, msg.sender);
    }

    function withdrawAll() external nonReentrant whenNotPaused {
        uint256 sh = balanceOf(msg.sender);
        require(sh > 0, "Vault: nothing to withdraw");
        redeem(sh, msg.sender, msg.sender);
    }

    // --------------------------
    // Pause & emergency
    // --------------------------
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdrawAll() external onlyOwner nonReentrant {
        if (address(strategy) != address(0)) {
            uint256 stratTotal = strategy.totalAssets();
            if (stratTotal > 0) {
                strategy.freeFunds(stratTotal);
            }
        }

        uint256 vaultBal = IERC20(asset()).balanceOf(address(this));
        if (vaultBal > 0) {
            IERC20(asset()).safeTransfer(owner(), vaultBal);
            emit EmergencyWithdraw(owner(), vaultBal);
        }
    }
}

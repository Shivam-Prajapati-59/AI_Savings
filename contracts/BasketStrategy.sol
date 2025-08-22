// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IStrategy.sol";

interface IRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
   
    function getAmountsOut(uint amountIn, address[] calldata path)
        external view returns (uint[] memory amounts);
}

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

/// @title AI Basket Strategy
/// @notice Strategy that allocates funds across multiple tokens based on AI recommendations
contract AIBasketStrategy is IStrategy, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
   
    struct TokenAllocation {
        address token;
        uint256 percentage; // basis points (10000 = 100%)
    }
   
    IERC20 public immutable asset; // The vault's base asset (e.g., USDT)
    address public immutable weth; // WETH address for multi-hop swaps
    address public vault;
    IRouter public router;
   
    TokenAllocation[] public allocations;
    mapping(address => bool) public allowedTokens;
    mapping(address => AggregatorV3Interface) public priceFeeds;
   
    uint256 public constant MAX_BPS = 10000; // 100%
    uint256 public constant MAX_SLIPPAGE = 500; // 5%
    uint256 public constant MAX_ALLOCATIONS = 10; // Maximum number of tokens in portfolio
   
    event VaultChanged(address indexed oldVault, address indexed newVault);
    event RouterChanged(address indexed oldRouter, address indexed newRouter);
    event AllocationUpdated(address indexed token, uint256 percentage);
    event AllocationRemoved(address indexed token);
    event TokenAllowed(address indexed token);
    event TokenDisallowed(address indexed token);
    event PriceFeedSet(address indexed token, address indexed feed);
    event AIRebalance(uint256 totalValue, uint256 allocationsCount);
    event EmergencyExit(address indexed token, uint256 amount);
    modifier onlyVault() {
        require(msg.sender == vault, "AIBasketStrategy: only vault");
        _;
    }
    modifier onlyVaultOrOwner() {
        require(msg.sender == vault || msg.sender == owner(), "AIBasketStrategy: only vault or owner");
        _;
    }
    constructor(
        IERC20 _asset,
        address _vault,
        address _router,
        address _weth,
        address _owner
    ) Ownable(_owner) {
        require(address(_asset) != address(0), "AIBasketStrategy: asset zero");
        require(_vault != address(0), "AIBasketStrategy: vault zero");
        require(_router != address(0), "AIBasketStrategy: router zero");
        require(_weth != address(0), "AIBasketStrategy: weth zero");
       
        asset = _asset;
        vault = _vault;
        router = IRouter(_router);
        weth = _weth;
       
        // Allow the base asset by default
        allowedTokens[address(_asset)] = true;
    }
    // =================================
    // IStrategy Implementation
    // =================================
    /// @notice Called by vault after transferring funds to this contract
    function invest(uint256 amount) external override onlyVault nonReentrant {
        require(amount > 0, "AIBasketStrategy: zero amount");
       
        // If we have allocations, rebalance the portfolio including the new funds
        if (allocations.length > 0) {
            _rebalancePortfolio();
        }
        // Otherwise, just keep the funds in the base asset until AI provides allocations
       
        emit Invested(msg.sender, amount);
    }
    /// @notice Return funds to vault by liquidating positions if needed
    function freeFunds(uint256 amount) external override onlyVault nonReentrant {
        require(amount > 0, "AIBasketStrategy: zero amount");
       
        uint256 assetBalance = asset.balanceOf(address(this));
       
        // If we don't have enough liquid assets, liquidate some positions
        if (assetBalance < amount) {
            _liquidateForWithdrawal(amount - assetBalance);
        }
       
        // Transfer the requested amount back to vault
        uint256 finalBalance = asset.balanceOf(address(this));
        uint256 toTransfer = amount > finalBalance ? finalBalance : amount;
       
        if (toTransfer > 0) {
            asset.safeTransfer(vault, toTransfer);
        }
       
        emit Freed(msg.sender, toTransfer);
    }
    /// @notice Get total assets under management in terms of base asset
    function totalAssets() external view override returns (uint256) {
        uint256 totalValue = asset.balanceOf(address(this));
       
        // Add value of all other token positions
        for (uint256 i = 0; i < allocations.length; i++) {
            address token = allocations[i].token;
            if (token != address(asset)) {
                uint256 tokenBalance = IERC20(token).balanceOf(address(this));
                if (tokenBalance > 0) {
                    totalValue += _getTokenValueInAsset(token, tokenBalance);
                }
            }
        }
       
        return totalValue;
    }
    // =================================
    // AI Allocation Management (Owner/Backend)
    // =================================
    /// @notice Set new allocations from AI recommendations
    /// @dev This would be called by your backend after getting Gemini AI response
    function setAllocations(TokenAllocation[] memory newAllocations) external onlyOwner {
        require(newAllocations.length <= MAX_ALLOCATIONS, "AIBasketStrategy: too many allocations");
       
        // Clear existing allocations
        delete allocations;
       
        uint256 totalPercentage = 0;
       
        // Set new allocations
        for (uint256 i = 0; i < newAllocations.length; i++) {
            require(newAllocations[i].token != address(0), "AIBasketStrategy: zero token");
            require(allowedTokens[newAllocations[i].token], "AIBasketStrategy: token not allowed");
            require(newAllocations[i].percentage > 0, "AIBasketStrategy: zero percentage");
            require(address(priceFeeds[newAllocations[i].token]) != address(0), "AIBasketStrategy: no price feed");
           
            allocations.push(newAllocations[i]);
            totalPercentage += newAllocations[i].percentage;
           
            emit AllocationUpdated(newAllocations[i].token, newAllocations[i].percentage);
        }
       
        require(totalPercentage <= MAX_BPS, "AIBasketStrategy: total percentage exceeds 100%");
       
        // Trigger rebalance if we have funds
        if (asset.balanceOf(address(this)) > 0) {
            _rebalancePortfolio();
        }
       
        emit AIRebalance(this.totalAssets(), allocations.length);
    }
    /// @notice Allow a token to be used in allocations
    function allowToken(address token) external onlyOwner {
        require(token != address(0), "AIBasketStrategy: zero token");
        allowedTokens[token] = true;
        emit TokenAllowed(token);
    }
    /// @notice Disallow a token from being used in allocations
    function disallowToken(address token) external onlyOwner {
        require(token != address(asset), "AIBasketStrategy: cannot disallow base asset");
        allowedTokens[token] = false;
        emit TokenDisallowed(token);
    }
    /// @notice Set Chainlink price feed for a token
    function setPriceFeed(address token, address feed) external onlyOwner {
        require(token != address(0), "AIBasketStrategy: zero token");
        require(feed != address(0), "AIBasketStrategy: zero feed");
        priceFeeds[token] = AggregatorV3Interface(feed);
        emit PriceFeedSet(token, feed);
    }
    // =================================
    // Internal Functions
    // =================================
    function _rebalancePortfolio() internal {
        if (allocations.length == 0) return;
       
        uint256 totalValue = this.totalAssets();
        if (totalValue == 0) return;
       
        // For each allocation, calculate target amount and rebalance
        for (uint256 i = 0; i < allocations.length; i++) {
            address token = allocations[i].token;
            uint256 targetValue = (totalValue * allocations[i].percentage) / MAX_BPS;
            uint256 currentValue;
           
            if (token == address(asset)) {
                currentValue = asset.balanceOf(address(this));
            } else {
                uint256 tokenBalance = IERC20(token).balanceOf(address(this));
                currentValue = tokenBalance > 0 ? _getTokenValueInAsset(token, tokenBalance) : 0;
            }
           
            // Rebalance if difference is significant (more than 1% of total value)
            uint256 threshold = totalValue / 100; // 1% threshold
           
            if (currentValue + threshold < targetValue) {
                // Need to buy more - amountToBuy is in asset units
                uint256 amountToBuy = targetValue - currentValue;
                // Convert to input amount (asset) for swap, but since buying token with asset, and amountToBuy is the value in asset to spend
                _swapToken(address(asset), token, amountToBuy);
            } else if (currentValue > targetValue + threshold) {
                // Need to sell some
                uint256 amountToSell = currentValue - targetValue;
                if (token != address(asset)) {
                    uint256 tokenAmountToSell = _convertAssetValueToTokenAmount(token, amountToSell);
                    uint256 actualBalance = IERC20(token).balanceOf(address(this));
                    if (tokenAmountToSell > actualBalance) {
                        tokenAmountToSell = actualBalance;
                    }
                    _swapToken(token, address(asset), tokenAmountToSell);
                }
            }
        }
    }
    function _liquidateForWithdrawal(uint256 neededAmount) internal {
        if (allocations.length == 0) return;
       
        uint256 totalValue = this.totalAssets();
        if (totalValue == 0) return;
       
        // Liquidate proportionally across all non-base-asset holdings
        for (uint256 i = 0; i < allocations.length; i++) {
            address token = allocations[i].token;
            if (token == address(asset)) continue;
           
            uint256 tokenBalance = IERC20(token).balanceOf(address(this));
            if (tokenBalance == 0) continue;
           
            uint256 tokenValue = _getTokenValueInAsset(token, tokenBalance);
            uint256 liquidateValue = (tokenValue * neededAmount) / totalValue;
           
            if (liquidateValue > 0) {
                uint256 liquidateAmount = _convertAssetValueToTokenAmount(token, liquidateValue);
                if (liquidateAmount > tokenBalance) liquidateAmount = tokenBalance;
               
                _swapToken(token, address(asset), liquidateAmount);
            }
        }
    }
    function _buildPath(address from, address to) internal view returns (address[] memory) {
        if (from == to) {
            address[] memory path = new address[](1);
            path[0] = from;
            return path;
        }
        if (from == weth || to == weth) {
            address[] memory path = new address[](2);
            path[0] = from;
            path[1] = to;
            return path;
        } else {
            address[] memory path = new address[](3);
            path[0] = from;
            path[1] = weth;
            path[2] = to;
            return path;
        }
    }
    function _swapToken(address fromToken, address toToken, uint256 amount) internal {
        if (fromToken == toToken || amount == 0) return;
       
        address[] memory path = _buildPath(fromToken, toToken);
       
        // Get expected output amount using Uniswap router for slippage
        uint256[] memory amountsOut;
        try router.getAmountsOut(amount, path) returns (uint256[] memory amounts) {
            amountsOut = amounts;
        } catch {
            // If we can't get price, skip this swap
            return;
        }
       
        uint256 amountOutMin = (amountsOut[amountsOut.length - 1] * (MAX_BPS - MAX_SLIPPAGE)) / MAX_BPS;
       
        // Approve router to spend tokens
        IERC20(fromToken).forceApprove(address(router), amount);
       
        // Execute swap on Uniswap
        try router.swapExactTokensForTokens(
            amount,
            amountOutMin,
            path,
            address(this),
            block.timestamp + 300
        ) {} catch {
            // If swap fails, reset approval
            IERC20(fromToken).forceApprove(address(router), 0);
        }
    }
    function _getTokenValueInAsset(address token, uint256 tokenAmount) internal view returns (uint256) {
        if (token == address(asset)) return tokenAmount;
        if (tokenAmount == 0) return 0;
       
        AggregatorV3Interface tokenFeed = priceFeeds[token];
        AggregatorV3Interface assetFeed = priceFeeds[address(asset)];
        require(address(tokenFeed) != address(0), "AIBasketStrategy: no token feed");
        require(address(assetFeed) != address(0), "AIBasketStrategy: no asset feed");
       
        (, int256 tokenPrice,,,) = tokenFeed.latestRoundData();
        (, int256 assetPrice,,,) = assetFeed.latestRoundData();
        require(tokenPrice > 0 && assetPrice > 0, "AIBasketStrategy: invalid price");
       
        uint256 tokenDec = IERC20Metadata(token).decimals();
        uint256 assetDec = IERC20Metadata(address(asset)).decimals();
        uint8 feedDecToken = tokenFeed.decimals();
        uint8 feedDecAsset = assetFeed.decimals();
        require(feedDecToken == feedDecAsset, "AIBasketStrategy: feed decimals mismatch");
       
        int256 exp = int256(assetDec) - int256(tokenDec);
        uint256 uTokenPrice = uint256(tokenPrice);
        uint256 uAssetPrice = uint256(assetPrice);
       
        if (exp >= 0) {
            return (tokenAmount * uTokenPrice * (10 ** uint256(exp))) / uAssetPrice;
        } else {
            return (tokenAmount * uTokenPrice) / (uAssetPrice * (10 ** uint256(-exp)));
        }
    }
    function _convertAssetValueToTokenAmount(address token, uint256 assetAmount) internal view returns (uint256) {
        if (token == address(asset)) return assetAmount;
        if (assetAmount == 0) return 0;
       
        AggregatorV3Interface tokenFeed = priceFeeds[token];
        AggregatorV3Interface assetFeed = priceFeeds[address(asset)];
        require(address(tokenFeed) != address(0), "AIBasketStrategy: no token feed");
        require(address(assetFeed) != address(0), "AIBasketStrategy: no asset feed");
       
        (, int256 tokenPrice,,,) = tokenFeed.latestRoundData();
        (, int256 assetPrice,,,) = assetFeed.latestRoundData();
        require(tokenPrice > 0 && assetPrice > 0, "AIBasketStrategy: invalid price");
       
        uint256 tokenDec = IERC20Metadata(token).decimals();
        uint256 assetDec = IERC20Metadata(address(asset)).decimals();
        uint8 feedDecToken = tokenFeed.decimals();
        uint8 feedDecAsset = assetFeed.decimals();
        require(feedDecToken == feedDecAsset, "AIBasketStrategy: feed decimals mismatch");
       
        int256 exp = int256(tokenDec) - int256(assetDec);
        uint256 uTokenPrice = uint256(tokenPrice);
        uint256 uAssetPrice = uint256(assetPrice);
       
        if (exp >= 0) {
            return (assetAmount * uAssetPrice * (10 ** uint256(exp))) / uTokenPrice;
        } else {
            return (assetAmount * uAssetPrice) / (uTokenPrice * (10 ** uint256(-exp)));
        }
    }
    // =================================
    // Admin Functions
    // =================================
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "AIBasketStrategy: vault zero");
        emit VaultChanged(vault, _vault);
        vault = _vault;
    }
    function setRouter(address _router) external onlyOwner {
        require(_router != address(0), "AIBasketStrategy: router zero");
        emit RouterChanged(address(router), _router);
        router = IRouter(_router);
    }
    /// @notice Emergency function to exit all positions and return to base asset
    function emergencyExitAllPositions() external onlyOwner nonReentrant {
        for (uint256 i = 0; i < allocations.length; i++) {
            address token = allocations[i].token;
            if (token == address(asset)) continue;
           
            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                _swapToken(token, address(asset), balance);
                emit EmergencyExit(token, balance);
            }
        }
       
        // Clear allocations
        delete allocations;
    }
    /// @notice Emergency withdraw of any token to owner
    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(owner(), balance);
            emit EmergencyExit(token, balance);
        }
    }
    // =================================
    // View Functions
    // =================================
    function getAllocations() external view returns (TokenAllocation[] memory) {
        return allocations;
    }
    function getAllocationsCount() external view returns (uint256) {
        return allocations.length;
    }
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
    function isTokenAllowed(address token) external view returns (bool) {
        return allowedTokens[token];
    }
    // Events for compatibility
    event Invested(address indexed vault, uint256 amount);
    event Freed(address indexed vault, uint256 amount);
}
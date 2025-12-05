// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * SOVRHybridRouter_v2.sol
 * - Adds swapUSDCForSOVR (public) using Uniswap V3 SwapRouter exactInputSingle
 * - Exposes TWAP consult helper (returns sqrtPriceX96) via TWAPHelper library/contract
 * - Provides addLiquidity user flow with safety checks and reentrancy protection
 * - Emits clear events for monitoring
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IUniswap.sol";
import "./TWAPHelper.sol";

// Minimal interface for Peg pool used in addLiquidity
interface ISOVRPrivatePoolV2 {
    function seedPegLiquidity(
        uint256 sovrAmount,
        uint256 usdcAmount,
        int24 tickLower,
        int24 tickUpper,
        address recipient
    ) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    
    function SOVR() external view returns (address);
    function USDC() external view returns (address);
    function pool() external view returns (address);
}

contract SOVRHybridRouter_v2 is Ownable, ReentrancyGuard {
    ISwapRouter public immutable uniswapRouter;
    TWAPHelper public immutable twapHelper;

    address public immutable SOVR;
    address public immutable USDC;
    ISOVRPrivatePoolV2 public pegPool;

    uint24 public constant FEE = 500; // 0.05%

    event LiquidityAdded(address indexed user, uint256 sovrAmount, uint256 usdcAmount, uint256 tokenId);
    event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event PegPoolUpdated(address indexed oldPool, address indexed newPool);

    constructor(
        address _uniswapRouter,
        address _twapHelper,
        address _sovr,
        address _usdc,
        address _pegPool
    ) {
        require(_uniswapRouter != address(0), "bad router");
        require(_twapHelper != address(0), "bad twap helper");
        require(_sovr != address(0) && _usdc != address(0), "bad tokens");
        uniswapRouter = ISwapRouter(_uniswapRouter);
        twapHelper = TWAPHelper(_twapHelper);
        SOVR = _sovr;
        USDC = _usdc;
        pegPool = ISOVRPrivatePoolV2(_pegPool);
    }

    // Admin: update peg pool address
    function setPegPool(address _pegPool) external onlyOwner {
        address old = address(pegPool);
        pegPool = ISOVRPrivatePoolV2(_pegPool);
        emit PegPoolUpdated(old, _pegPool);
    }

    /**
     * @notice User-facing addLiquidity
     * Pulls tokens from user, approves exact amounts to peg, calls seedPegLiquidity.
     */
    function addLiquidity(uint256 sovrAmount, uint256 usdcAmount) external nonReentrant returns (uint256 tokenId) {
        require(sovrAmount > 0 && usdcAmount > 0, "zero amounts");
        address caller = msg.sender;

        // Pull tokens from user
        require(IERC20(SOVR).transferFrom(caller, address(this), sovrAmount), "sovr transferFrom failed");
        require(IERC20(USDC).transferFrom(caller, address(this), usdcAmount), "usdc transferFrom failed");

        // Approve exact amounts to peg
        IERC20(SOVR).approve(address(pegPool), sovrAmount);
        IERC20(USDC).approve(address(pegPool), usdcAmount);

        // Call peg to seed liquidity; peg mints NFT to recipient
        (tokenId, , , ) = pegPool.seedPegLiquidity(sovrAmount, usdcAmount, 0, 0, caller);

        emit LiquidityAdded(caller, sovrAmount, usdcAmount, tokenId);
    }

    /**
     * @notice Swap SOVR -> USDC (exactInputSingle)
     */
    function swapSOVRForUSDC(
        uint256 amountIn,
        uint256 minAmountOut,
        uint160 sqrtPriceLimitX96
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "zero amount");

        // pull SOVR from user
        require(IERC20(SOVR).transferFrom(msg.sender, address(this), amountIn), "sovr transferFrom failed");
        // approve router
        IERC20(SOVR).approve(address(uniswapRouter), amountIn);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: SOVR,
            tokenOut: USDC,
            fee: FEE,
            recipient: msg.sender,
            deadline: block.timestamp + 300,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        amountOut = uniswapRouter.exactInputSingle(params);
        emit SwapExecuted(msg.sender, SOVR, USDC, amountIn, amountOut);
    }

    /**
     * @notice Swap USDC -> SOVR (exactInputSingle) - NOW IMPLEMENTED
     */
    function swapUSDCForSOVR(
        uint256 amountIn,
        uint256 minAmountOut,
        uint160 sqrtPriceLimitX96
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "zero amount");

        // pull USDC from user
        require(IERC20(USDC).transferFrom(msg.sender, address(this), amountIn), "usdc transferFrom failed");
        // approve router
        IERC20(USDC).approve(address(uniswapRouter), amountIn);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: USDC,
            tokenOut: SOVR,
            fee: FEE,
            recipient: msg.sender,
            deadline: block.timestamp + 300,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        amountOut = uniswapRouter.exactInputSingle(params);
        emit SwapExecuted(msg.sender, USDC, SOVR, amountIn, amountOut);
    }

    /**
     * Returns a conservative TWAP-based sqrtPriceX96 for the SOVR/USDC pool.
     */
    function quoteSqrtPriceX96(uint32 twapPeriod) external view returns (uint160 sqrtPriceX96) {
        address pool = pegPool.pool();
        sqrtPriceX96 = twapHelper.consultTwap(pool, twapPeriod);
    }
}

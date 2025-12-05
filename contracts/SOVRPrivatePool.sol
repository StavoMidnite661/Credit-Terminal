// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  SOVRPrivatePool.sol (Final Golden)

  - Dynamic sqrtPriceX96 computation fully aware of token ordering and decimals.
  - Uses integer math: sqrt( adjusted * 2^192 / denom ) -> Babylonian / FullMath approach
  - Creates Uniswap V3 pool (if missing) and safely initialize() only when slot0 == 0.
  - seedPegLiquidity() mints an NFT position via NonfungiblePositionManager (full-range default).
  - swapExactSOVRForUSDC() helper using `ISwapRouter` (Uniswap V3 periphery) for a direct single-hop swap path.
  - Approvals and checks.
  - Owner-only operations (migrate ownership to multisig after deploy).
*/

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Uniswap interfaces (local to avoid OZ version conflicts)
import "./interfaces/IUniswap.sol";

/// @dev FullMath.mulDiv & Babylonian.sqrt implementations (Uniswap-style)
library FullMath {
    /// @notice Calculates floor(a * b / denominator) with full precision. Reverts if result overflows a uint256 or denominator == 0
    function mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            // 512-bit multiply [prod1 prod0] = a * b
            uint256 prod0; // Least significant 256 bits
            uint256 prod1; // Most significant 256 bits
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }
            // Handle non-overflow cases, 256 by 256 division
            if (prod1 == 0) {
                require(denominator > 0);
                assembly {
                    result := div(prod0, denominator)
                }
                return result;
            }
            require(denominator > prod1, "FullMath: overflow");
            // Make division exact by subtracting remainder from [prod1 prod0]
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, denominator)
            }
            assembly {
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }
            // Factor powers of two out of denominator and compute largest power of two divisor of denominator (always >= 1)
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
            }
            assembly {
                prod0 := div(prod0, twos)
            }
            assembly {
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;
            // Invert denominator mod 2^256
            uint256 inv = (3 * denominator) ^ 2;
            inv *= 2 - denominator * inv; // inverse mod 2^8
            inv *= 2 - denominator * inv; // inverse mod 2^16
            inv *= 2 - denominator * inv; // inverse mod 2^32
            inv *= 2 - denominator * inv; // inverse mod 2^64
            inv *= 2 - denominator * inv; // inverse mod 2^128
            inv *= 2 - denominator * inv; // inverse mod 2^256
            result = prod0 * inv;
            return result;
        }
    }
}

library Babylonian {
    /// @dev Integer square root of x, rounded down.
    function sqrt(uint256 x) internal pure returns (uint256 r) {
        if (x == 0) return 0;
        uint256 xx = x;
        uint256 r1 = 1;
        if (xx >= 0x100000000000000000000000000000000) { xx >>= 128; r1 <<= 64; }
        if (xx >= 0x10000000000000000) { xx >>= 64; r1 <<= 32; }
        if (xx >= 0x100000000) { xx >>= 32; r1 <<= 16; }
        if (xx >= 0x10000) { xx >>= 16; r1 <<= 8; }
        if (xx >= 0x100) { xx >>= 8; r1 <<= 4; }
        if (xx >= 0x10) { xx >>= 4; r1 <<= 2; }
        if (xx >= 0x8) { r1 <<= 1; }
        // Newton iterations
        r = r1;
        for (uint i = 0; i < 7; i++) {
            r = (r + x / r) >> 1;
        }
        uint256 r2 = x / r;
        if (r2 < r) r = r2;
    }
}

contract SOVRPrivatePool is Ownable {
    using FullMath for uint256;

    address public immutable SOVR;
    address public immutable USDC;
    address public immutable factory;
    INonfungiblePositionManager public immutable positionManager;
    ISwapRouter public immutable swapRouter;
    address public pool; // Uniswap v3 pool address
    uint24 public immutable poolFee;

    // constants
    uint256 private constant TWO_POW_192 = 2 ** 192;

    event PoolCreated(address pool);
    event PegInitialized(address pool, uint160 sqrtPriceX96);
    event PegSeeded(uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    event SwapExecuted(address sender, uint256 amountIn, uint256 amountOut);

    constructor(
        address _sovr,
        address _usdc,
        address _factory,
        address _positionManager,
        address _swapRouter,
        uint24 _fee // e.g., 500
    ) {
        require(_sovr != address(0) && _usdc != address(0), "zero token");
        SOVR = _sovr;
        USDC = _usdc;
        factory = _factory;
        positionManager = INonfungiblePositionManager(_positionManager);
        swapRouter = ISwapRouter(_swapRouter);
        poolFee = _fee;

        // create/get pool
        address p = IUniswapV3Factory(factory).getPool(SOVR, USDC, poolFee);
        if (p == address(0)) {
            p = IUniswapV3Factory(factory).createPool(SOVR, USDC, poolFee);
            emit PoolCreated(p);
        }
        pool = p;
    }

    // ---------- Price initialization ----------

    /**
     * @notice Compute sqrtPriceX96 from a human price expressed as fraction (numerator/denominator)
     * @param token0 address token0 for the pool (must match Uniswap token ordering)
     * @param token1 address token1 for the pool
     * @param humanNumerator numerator of human price (token1 per token0). e.g., for 0.01 -> 1
     * @param humanDenominator denominator of human price (token1 per token0). e.g., for 0.01 -> 100
     * @return sqrtPriceX96 uint160 to pass into IUniswapV3Pool.initialize()
     *
     * Math derivation:
     *  sqrtPriceX96 = sqrt( humanNumerator / humanDenominator * 10^(dec0 - dec1) ) * 2^96
     *  Let adjusted = humanNumerator * 10^(dec0-dec1) / humanDenominator
     *  sqrtPriceX96 = sqrt(adjusted) * 2^96
     *  => compute value = adjusted * 2^192 = humanNumerator * 10^(dec0-dec1) * 2^192 / humanDenominator
     *  sqrtPriceX96 = sqrt(value)
     */
    function computeSqrtPriceX96(
        address token0,
        address token1,
        uint256 humanNumerator,
        uint256 humanDenominator
    ) public view returns (uint160) {
        require(humanDenominator != 0, "denom zero");
        // decimals
        uint8 dec0 = IERC20Metadata(token0).decimals();
        uint8 dec1 = IERC20Metadata(token1).decimals();

        // adjust for decimals: compute pow10 = 10^(dec0-dec1) in numerator or denominator
        uint256 adjustedNum = humanNumerator;
        uint256 adjustedDen = humanDenominator;
        if (dec0 >= dec1) {
            uint256 diff = uint256(dec0 - dec1);
            // multiply numerator by 10^diff (safe because decimals diff <= 255)
            adjustedNum = adjustedNum * (10 ** diff);
        } else {
            uint256 diff = uint256(dec1 - dec0);
            adjustedDen = adjustedDen * (10 ** diff);
        }

        // value = adjustedNum * 2^192 / adjustedDen
        uint256 value = FullMath.mulDiv(adjustedNum, TWO_POW_192, adjustedDen);
        // sqrt of value gives sqrtPriceX96
        uint256 sqrtVal = Babylonian.sqrt(value);
        require(sqrtVal <= type(uint160).max, "sqrt overflow");
        return uint160(sqrtVal);
    }

    /**
     * @notice Initialize pool with computed sqrtPriceX96 if not already initialized
     * @param humanNumerator human price numerator (token1 per token0)
     * @param humanDenominator human price denominator (token1 per token0)
     * The function will determine token ordering (token0/token1) and compute accordingly.
     */
    function initializePeg(uint256 humanNumerator, uint256 humanDenominator) external onlyOwner {
        IUniswapV3Pool p = IUniswapV3Pool(pool);
        (uint160 sqrtPriceX96Current,,,,,,) = p.slot0();
        require(sqrtPriceX96Current == 0, "already initialized");

        // get Uniswap canonical ordering
        address token0 = SOVR < USDC ? SOVR : USDC;
        address token1 = SOVR < USDC ? USDC : SOVR;

        uint160 sqrtPrice = computeSqrtPriceX96(token0, token1, humanNumerator, humanDenominator);
        p.initialize(sqrtPrice);
        emit PegInitialized(pool, sqrtPrice);
    }

    // ---------- Liquidity seeding ----------

    /**
     * @notice Seed peg liquidity (mint Uniswap V3 NFT position). Use full-range by default (MIN/MAX ticks)
     * @param sovrAmount raw SOVR (wei)
     * @param usdcAmount raw USDC (6-decimals)
     * @param tickLower int24 lower tick (use 0 to default full-range)
     * @param tickUpper int24 upper tick (use 0 to default full-range)
     * @param recipient address to receive the NFT position
     */
    function seedPegLiquidity(
        uint256 sovrAmount,
        uint256 usdcAmount,
        int24 tickLower,
        int24 tickUpper,
        address recipient
    ) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        require(pool != address(0), "pool missing");
        require(sovrAmount > 0 && usdcAmount > 0, "zero amounts");
        require(recipient != address(0), "zero recipient");

        // Transfer tokens into this contract (caller must approve prior)
        require(IERC20(SOVR).transferFrom(msg.sender, address(this), sovrAmount), "sovr transferFrom failed");
        require(IERC20(USDC).transferFrom(msg.sender, address(this), usdcAmount), "usdc transferFrom failed");

        // Approve position manager
        IERC20(SOVR).approve(address(positionManager), sovrAmount);
        IERC20(USDC).approve(address(positionManager), usdcAmount);

        // Determine token0/token1 and desired amounts mapped to token0/token1
        address token0 = SOVR < USDC ? SOVR : USDC;
        address token1 = SOVR < USDC ? USDC : SOVR;
        uint256 amount0Desired = token0 == SOVR ? sovrAmount : usdcAmount;
        uint256 amount1Desired = token0 == SOVR ? usdcAmount : sovrAmount;

        // default full-range tick bounds if zero passed
        int24 tl = tickLower == 0 ? int24(-887272) : tickLower;
        int24 tu = tickUpper == 0 ? int24(887272) : tickUpper;

        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: poolFee,
            tickLower: tl,
            tickUpper: tu,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: 0, // production: set slippage guards
            amount1Min: 0,
            recipient: recipient,
            deadline: block.timestamp + 3600
        });

        (tokenId, liquidity, amount0, amount1) = positionManager.mint(params);
        emit PegSeeded(tokenId, liquidity, amount0, amount1);
    }

    // ---------- Swap helper (single-hop SOVR -> USDC) ----------
    // NOTE: This helper uses Uniswap V3 SwapRouter exactInputSingle. Ensure swapRouter address is set to periphery SwapRouter on network.
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /**
     * @notice Swap exact SOVR for USDC using Uniswap V3 SwapRouter exactInputSingle.
     * @param amountIn SOVR raw amount (wei)
     * @param amountOutMin minimum USDC out (6-decimals)
     * @param recipient recipient of USDC
     * @param sqrtPriceLimitX96 optional price limit (0 to ignore)
     */
    function swapExactSOVRForUSDC(
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient,
        uint160 sqrtPriceLimitX96
    ) external onlyOwner returns (uint256 amountOut) {
        require(amountIn > 0, "zero amountIn");
        // move SOVR to pool contract by transferFrom (owner must approve router or this contract)
        // we assume owner has already transferred SOVR into this contract for swap scenario or approved swapRouter.
        // For safety, transferFrom owner into this contract and approve router.
        require(IERC20(SOVR).transferFrom(msg.sender, address(this), amountIn), "sovr transferFrom failed");
        IERC20(SOVR).approve(address(swapRouter), amountIn);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: SOVR,
            tokenOut: USDC,
            fee: poolFee,
            recipient: recipient,
            deadline: block.timestamp + 300,
            amountIn: amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });
        amountOut = swapRouter.exactInputSingle(params);
        emit SwapExecuted(msg.sender, amountIn, amountOut);
    }

    // ---------- Utility: read pool slot0 ----------
    function poolSqrtPriceX96() external view returns (uint160) {
        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();
        return sqrtPriceX96;
    }

    // ---------- Emergency & admin ----------

    function setPool(address _pool) external onlyOwner { pool = _pool; }

    // note: migrate ownership of this contract to multisig & timelock in production
}

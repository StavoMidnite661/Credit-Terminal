// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISOVRPrivatePool {
    function seedPegLiquidity(uint256 sovrAmount, uint256 usdcAmount, int24 tickLower, int24 tickUpper, address recipient) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function initializePeg(uint160 sqrtPriceX96) external;
    function getPool() external view returns (address);
    function swapExactSOVRForUSDC(uint256 amountIn, uint256 amountOutMin, address recipient, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut);
    function SOVR() external view returns (address);
    function USDC() external view returns (address);
}

interface ILiquidityController {
    function reposition(uint256 tokenId, int24 tickLower, int24 tickUpper) external;
    function bondingMint(address to, uint256 sovrReward, uint256 sfiatReward) external;
}

interface IReserveManager {
    function depositUSDC(uint256 amount) external;
    function mintSF(address to, uint256 amount) external;
    function collateralizationBps() external view returns (uint256);
}

/**
 * @title SOVRHybridRouter
 * @notice Minimal router that chooses between PEG and PROGRAMMABLE routes.
 *         For the demo this contains simplified logic — expand with real TWAPs, oracle checks and slippage logic.
 */
contract SOVRHybridRouter is Ownable, ReentrancyGuard {
    ISOVRPrivatePool public peg;
    ILiquidityController public programmable;
    IReserveManager public reserve;

    enum Route { PEG, PROGRAMMABLE }

    event Quote(address indexed tokenIn, uint256 amountIn, Route route, uint256 amountOut);
    event ExecSwap(address indexed caller, address tokenIn, uint256 amountIn, Route route, uint256 amountOut);
    event LiquidityAdded(
        address indexed user,
        uint256 sovrAmount,
        uint256 usdcAmount,
        uint256 liquidityNFT
    );

    constructor(address _peg, address _programmable, address _reserve) {
        peg = ISOVRPrivatePool(_peg);
        programmable = ILiquidityController(_programmable);
        reserve = IReserveManager(_reserve);
    }

    /// @notice Simplified on-chain quote. Replace with TWAP / oracle read in production.
    function quote(address /*tokenIn*/, uint256 amountIn, Route route) public view returns (uint256 amountOut) {
        if (route == Route.PEG) {
            // Canonical peg: 100 SOVR == 1 USDC. amountOut is USDC units if amountIn is SOVR units.
            // NOTE: decimals must be handled externally — this is a ratio-only return for demo.
            return amountIn / 100;
        } else {
            // Programmable pool may vary; for demo, return same ratio
            return amountIn / 100;
        }
    }

    /**
     * @notice Execute a swap/route chosen by governance/operator. This is intentionally permissioned (onlyOwner)
     *         so the Router acts as a controlled router for peg operations.
     */
    function execSwap(address tokenIn, uint256 amountIn, uint256 /*amountOutMin*/, Route route) external onlyOwner returns (uint256 amountOut) {
        if (route == Route.PEG) {
            // For demo purposes we treat seedPegLiquidity as the deposit/swap operation.
            // In production this would call pool/swapRouter directly and handle approvals, slippage, TWAP checks.
            uint256 usdcAmount = amountIn / 100; // naive ratio
            peg.seedPegLiquidity(amountIn, usdcAmount, 0, 0, address(this));
            amountOut = usdcAmount;
        } else {
            // Programmable route: for demo, call bondingMint as a way to credit reward flow
            programmable.bondingMint(msg.sender, amountIn, 0);
            amountOut = amountIn / 100;
        }
        emit ExecSwap(msg.sender, tokenIn, amountIn, route, amountOut);
    }

    /**
     * @notice User-facing liquidity provision.
     *         Transfers tokens from user, approves Peg, and mints position.
     */
    function addLiquidity(
        uint256 amountSOVR,
        uint256 amountUSDC
    )
        external
        nonReentrant
        returns (uint256 positionId)
    {
        require(amountSOVR > 0, "Zero SOVR");
        require(amountUSDC > 0, "Zero USDC");

        address sovr = peg.SOVR();
        address usdc = peg.USDC();

        // Pull tokens from user
        IERC20(sovr).transferFrom(msg.sender, address(this), amountSOVR);
        IERC20(usdc).transferFrom(msg.sender, address(this), amountUSDC);

        // Approve peg pool
        IERC20(sovr).approve(address(peg), amountSOVR);
        IERC20(usdc).approve(address(peg), amountUSDC);

        // Call the peg to mint a Uniswap V3 position
        (positionId, , , ) = peg.seedPegLiquidity(amountSOVR, amountUSDC, 0, 0, msg.sender);
        
        emit LiquidityAdded(msg.sender, amountSOVR, amountUSDC, positionId);
    }

    // Public Swap Functions matching Frontend ABI
    function swapSOVRForUSDC(uint256 sovrIn, uint256 minUsdcOut) external returns (uint256 amountOut) {
        address sovr = peg.SOVR();
        
        // 1. Transfer SOVR from User to Router
        require(IERC20(sovr).transferFrom(msg.sender, address(this), sovrIn), "Router: transferFrom failed");
        
        // 2. Approve Peg (PrivatePool) to spend Router's SOVR
        IERC20(sovr).approve(address(peg), sovrIn);
        
        // 3. Call Peg's swap helper
        return peg.swapExactSOVRForUSDC(sovrIn, minUsdcOut, msg.sender, 0);
    }

    function swapUSDCForSOVR(uint256 usdcIn, uint256 minSovrOut) external returns (uint256 amountOut) {
        // Similar logic for USDC -> SOVR
        // But PrivatePool only has swapExactSOVRForUSDC in the helper I saw.
        // It doesn't seem to have the reverse helper in the snippet I read.
        // I'll just revert or return 0 for now as the user flow requested SOVR -> USDC primarily.
        revert("USDC -> SOVR not implemented in demo");
    }

    // Admin: update module addresses
    function setPeg(address _peg) external onlyOwner { peg = ISOVRPrivatePool(_peg); }
    function setProgrammable(address _prog) external onlyOwner { programmable = ILiquidityController(_prog); }
    function setReserve(address _reserve) external onlyOwner { reserve = IReserveManager(_reserve); }
}

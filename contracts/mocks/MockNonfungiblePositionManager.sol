// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IUniswap.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockNonfungiblePositionManager is INonfungiblePositionManager {
    uint256 public nextTokenId = 1;

    function mint(MintParams calldata params) external payable override returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        // Transfer tokens from sender to this contract to simulate deposit
        if (params.amount0Desired > 0) {
            IERC20(params.token0).transferFrom(msg.sender, address(this), params.amount0Desired);
        }
        if (params.amount1Desired > 0) {
            IERC20(params.token1).transferFrom(msg.sender, address(this), params.amount1Desired);
        }

        tokenId = nextTokenId++;
        liquidity = uint128(params.amount0Desired); // Simplified liquidity calculation
        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;
        
        return (tokenId, liquidity, amount0, amount1);
    }
}

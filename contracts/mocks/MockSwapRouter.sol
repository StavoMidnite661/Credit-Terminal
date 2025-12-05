// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockSwapRouter {
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

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        // Transfer tokenIn from sender to this contract
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        
        // Calculate amountOut (1:1 ratio adjusted for decimals)
        // SOVR (18 dec) -> USDC (6 dec)
        // amountOut = amountIn / 1e12
        if (params.amountIn > 0) {
             amountOut = params.amountIn / 1e12;
        }
        
        if (amountOut < params.amountOutMinimum) {
            revert("Too little received");
        }

        // Transfer tokenOut to recipient
        IERC20(params.tokenOut).transfer(params.recipient, amountOut);
        
        return amountOut;
    }
}

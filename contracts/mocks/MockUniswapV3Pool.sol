// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IUniswap.sol";

contract MockUniswapV3Pool is IUniswapV3Pool {
    struct Slot0 {
        uint160 sqrtPriceX96;
        int24 tick;
        uint16 observationIndex;
        uint16 observationCardinality;
        uint16 observationCardinalityNext;
        uint8 feeProtocol;
        bool unlocked;
    }

    Slot0 public override slot0;

    function initialize(uint160 sqrtPriceX96) external override {
        slot0.sqrtPriceX96 = sqrtPriceX96;
        slot0.unlocked = true;
    }
}

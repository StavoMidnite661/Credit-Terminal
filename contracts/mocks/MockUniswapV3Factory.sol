// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockUniswapV3Pool.sol";

contract MockUniswapV3Factory {
    mapping(address => mapping(address => mapping(uint24 => address))) public getPool;

    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool) {
        MockUniswapV3Pool newPool = new MockUniswapV3Pool();
        pool = address(newPool);
        getPool[tokenA][tokenB][fee] = pool;
        getPool[tokenB][tokenA][fee] = pool;
    }
}

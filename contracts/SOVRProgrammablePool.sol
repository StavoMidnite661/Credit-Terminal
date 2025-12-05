// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IUniswap.sol";

contract SOVRProgrammablePool is AccessControl {
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    INonfungiblePositionManager public positionManager;
    address public sovr;
    address public usdc;
    uint24 public fee;

    // mapping tokenId => owner (who minted the NFT)
    mapping(uint256 => address) public tokenOwner;

    event Repositioned(uint256 tokenId, int24 lower, int24 upper);
    event PositionMinted(uint256 tokenId, address owner, uint128 liquidity, uint256 amount0, uint256 amount1);
    event BondingIssued(address to, uint256 sovrAmount, uint256 sfiatReward);

    constructor(address _positionManager, address _sovr, address _usdc, uint24 _fee) {
        positionManager = INonfungiblePositionManager(_positionManager);
        sovr = _sovr;
        usdc = _usdc;
        fee = _fee;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // Mint a position on-chain (owner must have approved tokens to this contract)
    function mintPosition(
        address token0,
        address token1,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0Desired,
        uint256 amount1Desired
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        IERC20(token0).transferFrom(msg.sender, address(this), amount0Desired);
        IERC20(token1).transferFrom(msg.sender, address(this), amount1Desired);

        IERC20(token0).approve(address(positionManager), amount0Desired);
        IERC20(token1).approve(address(positionManager), amount1Desired);

        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: 0,
            amount1Min: 0,
            recipient: msg.sender,
            deadline: block.timestamp + 3600
        });

        (tokenId, liquidity, amount0, amount1) = positionManager.mint(params);
        tokenOwner[tokenId] = msg.sender;
        emit PositionMinted(tokenId, msg.sender, liquidity, amount0, amount1);
    }

    // Off-chain guardians signal a reposition; keeper does the heavy work by calling withdraw + mint paths
    // Here we only emit event to record intention (safety: on-chain withdraw/mint can be executed by keeper with multisig)
    function requestReposition(uint256 tokenId, int24 newLower, int24 newUpper) external onlyRole(GUARDIAN_ROLE) {
        emit Repositioned(tokenId, newLower, newUpper);
    }

    // bondingMint - admin-only for now
    function bondingMint(address to, uint256 sovrReward, uint256 sfiatReward) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit BondingIssued(to, sovrReward, sfiatReward);
    }
}

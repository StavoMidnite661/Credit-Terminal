// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IsFiat {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function totalSupply() external view returns (uint256);
}

contract ReserveManager is Ownable {
    IERC20 public immutable USDC;
    IsFiat public sfiat;
    uint256 public constant TARGET_CR_BPS = 12000; // 120%

    event MintSF(address to, uint256 amount);
    event BurnSF(address from, uint256 amount);

    constructor(address _usdc, address _sfiat) {
        USDC = IERC20(_usdc);
        sfiat = IsFiat(_sfiat);
    }

    function collateralValue() public view returns (uint256) {
        return USDC.balanceOf(address(this));
    }

    function sfiatSupply() public view returns (uint256) {
        return sfiat.totalSupply();
    }

    function collateralizationBps() public view returns (uint256) {
        uint256 sup = sfiatSupply();
        if (sup == 0) return type(uint256).max;
        return (collateralValue() * 10000) / sup;
    }

    function mintSF(address to, uint256 amount) external onlyOwner {
        uint256 sup = sfiatSupply();
        uint256 coll = collateralValue();
        uint256 newSup = sup + amount;
        require(newSup == 0 || (coll * 10000) / newSup >= TARGET_CR_BPS, "CR under target");
        sfiat.mint(to, amount);
        emit MintSF(to, amount);
    }

    function burnSF(address from, uint256 amount) external onlyOwner {
        sfiat.burn(from, amount);
        emit BurnSF(from, amount);
    }

    function depositUSDC(uint256 amount) external onlyOwner {
        require(USDC.transferFrom(msg.sender, address(this), amount), "transfer failed");
    }

    function withdrawUSDC(address to, uint256 amount) external onlyOwner {
        require(USDC.transfer(to, amount), "withdraw failed");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./SOVRPrivatePool.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract TestComputeHelper {
    using FullMath for uint256;

    function computeSqrtPriceX96_forTest(
        address token0,
        address token1,
        uint256 humanNumerator,
        uint256 humanDenominator
    ) external view returns (uint160) {
        uint8 dec0 = IERC20Metadata(token0).decimals();
        uint8 dec1 = IERC20Metadata(token1).decimals();

        uint256 adjustedNum = humanNumerator;
        uint256 adjustedDen = humanDenominator;

        if (dec0 >= dec1) {
            uint256 diff = uint256(dec0 - dec1);
            adjustedNum = adjustedNum * (10 ** diff);
        } else {
            uint256 diff = uint256(dec1 - dec0);
            adjustedDen = adjustedDen * (10 ** diff);
        }

        uint256 TWO_POW_192 = 2 ** 192;
        uint256 value = FullMath.mulDiv(adjustedNum, TWO_POW_192, adjustedDen);
        uint256 sqrtVal = Babylonian.sqrt(value);
        require(sqrtVal <= type(uint160).max, "sqrt overflow");
        return uint160(sqrtVal);
    }
}

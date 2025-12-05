const bn = require("bignumber.js");

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

function encodePriceSqrt(reserve1, reserve0) {
  return new bn(reserve1.toString())
    .div(reserve0.toString())
    .sqrt()
    .multipliedBy(new bn(2).pow(96))
    .integerValue(3)
    .toString();
}

function sqrtPriceX96ForHumanPrice(price, token0Decimals, token1Decimals) {
  // price is token1/token0
  // e.g. 1 ETH = 2000 USDC. price = 2000.
  // Custom logic: scale by 10^(token0Decimals - token1Decimals) to match SOVRPrivatePool.sol
  const scalar = new bn(10).pow(token0Decimals - token1Decimals);
  const val = new bn(price).multipliedBy(scalar);
  return new bn(val)
    .sqrt()
    .multipliedBy(new bn(2).pow(96))
    .integerValue(3)
    .toString();
}

module.exports = {
  encodePriceSqrt,
  sqrtPriceX96ForHumanPrice,
};

const { expect } = require('chai');
const { sqrtPriceX96ForHumanPrice } = require('../scripts/utils/sqrtPriceX96');
describe('Peg math sanity', function () {
  it('computes sqrtPriceX96 for 100 SOVR = 1 USDC', async function () {
    const sqrt = sqrtPriceX96ForHumanPrice('0.01', 18, 6);
    const expected = '7922816251426433759354395033600000';
    expect(sqrt).to.equal(expected);
  });
});

const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Verifying deployment with account:", deployer.address);

  // Load addresses from the deployment output (or hardcoded for now based on previous steps)
  // Ideally we'd read this from a file, but for this script I'll use the known addresses 
  // from the last successful deployment to be sure.
  const SOVR_ADDR = '0xA4899D35897033b927acFCf422bc745916139776';
  const USDC_ADDR = '0xf953b3A269d80e3eB0F2947630Da976B896A8C5b';
  const ROUTER_ADDR = '0xF8e31cb472bc70500f08Cd84917E5A1912Ec8397';
  const POOL_ADDR = '0xCace1b78160AE76398F486c8a18044da0d66d86D';

  const sovr = await ethers.getContractAt("TestERC20Decimals", SOVR_ADDR);
  const usdc = await ethers.getContractAt("TestERC20Decimals", USDC_ADDR);
  const router = await ethers.getContractAt("SOVRHybridRouter", ROUTER_ADDR);
  const pool = await ethers.getContractAt("SOVRPrivatePool", POOL_ADDR);

  // 1. Check Balances
  const sovrBal = await sovr.balanceOf(deployer.address);
  const usdcBal = await usdc.balanceOf(deployer.address);
  console.log(`Initial Balances: ${ethers.utils.formatUnits(sovrBal, 18)} SOVR, ${ethers.utils.formatUnits(usdcBal, 6)} USDC`);

  if (sovrBal.eq(0)) {
      console.log("Minting SOVR to deployer...");
      await (await sovr.mint(deployer.address, ethers.utils.parseUnits("1000", 18))).wait();
  }

  // 2. Check Liquidity/Peg
  const sqrtPrice = await pool.poolSqrtPriceX96();
  console.log("Pool initialized with sqrtPriceX96:", sqrtPrice.toString());
  if (sqrtPrice.eq(0)) throw new Error("Pool not initialized!");

  // 3. Execute Swap (SOVR -> USDC)
  const amountIn = ethers.utils.parseUnits("10", 18); // Swap 10 SOVR
  console.log(`\nAttempting to swap 10 SOVR for USDC...`);

  // Approve Router
  await (await sovr.approve(router.address, amountIn)).wait();
  console.log("Approved Router.");

  // Swap
  // function swapSOVRForUSDC(uint256 sovrIn, uint256 minUsdcOut)
  const tx = await router.swapSOVRForUSDC(amountIn, 0);
  const receipt = await tx.wait();
  console.log("Swap Transaction confirmed:", receipt.transactionHash);

  // 4. Verify New Balances
  const newSovrBal = await sovr.balanceOf(deployer.address);
  const newUsdcBal = await usdc.balanceOf(deployer.address);
  console.log(`Final Balances: ${ethers.utils.formatUnits(newSovrBal, 18)} SOVR, ${ethers.utils.formatUnits(newUsdcBal, 6)} USDC`);

  const sovrDiff = sovrBal.sub(newSovrBal);
  const usdcDiff = newUsdcBal.sub(usdcBal);

  console.log(`\nChange: -${ethers.utils.formatUnits(sovrDiff, 18)} SOVR, +${ethers.utils.formatUnits(usdcDiff, 6)} USDC`);

  if (usdcDiff.gt(0)) {
      console.log("SUCCESS: Swap executed and USDC received.");
  } else {
      console.error("FAILURE: No USDC received.");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

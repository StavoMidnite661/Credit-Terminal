const { ethers } = require("hardhat");

async function main() {
  const args = process.argv.slice(2);
  const targetAddress = process.env.TARGET_ADDRESS || args[0];

  if (!targetAddress) {
    console.error("Please provide an address to fund.");
    console.error("Usage: npx hardhat run scripts/faucet.js --network localhost -- <ADDRESS>");
    process.exit(1);
  }

  console.log(`Funding address: ${targetAddress}`);

  // Addresses from deployment
  const SOVR_ADDR = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
  const USDC_ADDR = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";

  const [deployer] = await ethers.getSigners();
  
  const sovr = await ethers.getContractAt("TestERC20Decimals", SOVR_ADDR);
  const usdc = await ethers.getContractAt("TestERC20Decimals", USDC_ADDR);

  const amountSOVR = ethers.utils.parseUnits("10000", 18); // 10,000 SOVR
  const amountUSDC = ethers.utils.parseUnits("10000", 6);  // 10,000 USDC

  // Transfer from deployer
  console.log("Sending 10,000 SOVR...");
  await (await sovr.connect(deployer).transfer(targetAddress, amountSOVR)).wait();

  console.log("Sending 10,000 USDC...");
  await (await usdc.connect(deployer).transfer(targetAddress, amountUSDC)).wait();

  // Also send some ETH for gas
  console.log("Sending 10 ETH for gas...");
  await deployer.sendTransaction({
    to: targetAddress,
    value: ethers.utils.parseEther("10.0")
  });

  console.log("Funding complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

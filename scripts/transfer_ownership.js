const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Transferring ownership with account:", deployer.address);

  // Addresses from environment or hardcoded (will be updated after deployment)
  const POOL_ADDR = process.env.POOL_ADDR;
  const ROUTER_ADDR = process.env.ROUTER_ADDR;

  if (!POOL_ADDR || !ROUTER_ADDR) {
      throw new Error("Set POOL_ADDR and ROUTER_ADDR in env");
  }

  const pool = await ethers.getContractAt("SOVRPrivatePool", POOL_ADDR);
  
  console.log(`Transferring ownership of Pool ${POOL_ADDR} to Router ${ROUTER_ADDR}...`);
  
  const tx = await pool.transferOwnership(ROUTER_ADDR);
  await tx.wait();
  
  console.log("Ownership transferred.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

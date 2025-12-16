/**
 * Verify all SOVR contracts on BaseScan
 * 
 * Prerequisites:
 * 1. Get BaseScan API key from https://basescan.org/myapikey
 * 2. Add to .env: BASESCAN_API_KEY=your_key
 * 
 * Usage: npx hardhat run scripts/verify_basescan.js --network base
 */

const hre = require("hardhat");

// Contract addresses from deployment (V2 - December 5, 2025)
const CONTRACTS = {
  TWAPHelper: {
    address: "0xf60090f7b6006593ca818aa71f9bffc7460ccb0c",
    constructorArgs: []
  },
  SOVRHybridRouter_v2: {
    address: "0x200dbb33ff5ff1a75d9d7f49b88e8361349eda4d",
    constructorArgs: [
      "0x2626664c2603336E57B271c5C0b26F421741e481", // Uniswap Router
      "0xf60090f7b6006593ca818aa71f9bffc7460ccb0c", // TWAPHelper
      "0x65e75d0fc656a2e81ef17e9a2a8da58d82390422", // SOVR
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      "0x18d4a13a0116b360efddb72aa626721cfa2a8228"  // PrivatePool
    ]
  },
  PrivatePool: {
    address: "0x18d4a13a0116b360efddb72aa626721cfa2a8228",
    constructorArgs: [] // Need to check actual constructor args
  },
  AttestorOracle: {
    address: "0xaca71bc598139d9167414ae666f7cd9377b871f7",
    constructorArgs: []
  }
};

async function verifyContract(name, address, constructorArgs) {
  console.log(`\nVerifying ${name} at ${address}...`);
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArgs,
    });
    console.log(`✓ ${name} verified successfully!`);
    return true;
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log(`✓ ${name} is already verified`);
      return true;
    }
    console.error(`✗ ${name} verification failed:`, error.message);
    return false;
  }
}

async function main() {
  console.log("===========================================");
  console.log("  SOVR Contract Verification - BaseScan");
  console.log("===========================================");
  console.log(`Network: ${hre.network.name}`);
  console.log(`Chain ID: ${hre.network.config.chainId}`);

  if (!process.env.BASESCAN_API_KEY) {
    console.error("\n❌ ERROR: BASESCAN_API_KEY not found in .env");
    console.error("Get your API key from: https://basescan.org/myapikey");
    process.exit(1);
  }

  let successCount = 0;
  let failCount = 0;

  for (const [name, config] of Object.entries(CONTRACTS)) {
    const success = await verifyContract(name, config.address, config.constructorArgs);
    if (success) successCount++;
    else failCount++;
  }

  console.log("\n===========================================");
  console.log(`  Results: ${successCount} verified, ${failCount} failed`);
  console.log("===========================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

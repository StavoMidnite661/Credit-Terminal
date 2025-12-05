const { ethers } = require('hardhat');
require('dotenv').config();

async function main() {
  console.log('🚀 Step 1: Deploying sFIAT...');

  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const gasOverrides = {
      maxFeePerGas: ethers.utils.parseUnits('0.1', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('0.01', 'gwei'),
  };

  const SFiat = await ethers.getContractFactory('sFIAT');
  const sfiat = await SFiat.deploy('SOVR Fiat', 'sFIAT', gasOverrides);
  
  console.log('Tx sent:', sfiat.deployTransaction.hash);
  await sfiat.deployed();
  
  console.log('✅ sFIAT deployed at:', sfiat.address);
  console.log('SAVE THIS ADDRESS FOR STEP 2!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const { ethers, network } = require('hardhat');
require('dotenv').config();

async function main() {
  console.log('🚀 Starting EssentialFulfillmentAnchor Deployment...');

  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);

  // Gas Overrides for Base (Cheap!)
  const gasOverrides = {
      maxFeePerGas: ethers.utils.parseUnits('0.1', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('0.01', 'gwei'),
  };

  const Anchor = await ethers.getContractFactory('EssentialFulfillmentAnchor');
  const anchor = await Anchor.deploy(gasOverrides);
  await anchor.deployed();

  console.log('✅ EssentialFulfillmentAnchor deployed at:', anchor.address);

  console.log('\n--------------------------------------------------');
  console.log('DEPLOYMENT COMPLETE (Anchor)');
  console.log(`Anchor: '${anchor.address}',`);
  console.log('--------------------------------------------------');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

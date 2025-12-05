const { ethers, network } = require('hardhat');
require('dotenv').config();
const { sqrtPriceX96ForHumanPrice } = require('./utils/sqrtPriceX96');

async function main() {
  console.log('🚀 Starting Base Deployment (Optimized Gas)...');

  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);

  // Gas Overrides for Base (Cheap!)
  // Base fee is around 0.0012 gwei. We'll use 0.01 gwei max to be safe but cheap.
  const gasOverrides = {
      maxFeePerGas: ethers.utils.parseUnits('0.1', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('0.01', 'gwei'),
  };

  // Base Mainnet Constants
  const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const BASE_UNISWAP_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
  const BASE_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
  
  // User Token
  const SOVR_TOKEN = process.env.SOVR_TOKEN;
  if (!SOVR_TOKEN) {
      throw new Error("Missing SOVR_TOKEN in .env");
  }

  console.log('Using SOVR Token:', SOVR_TOKEN);
  console.log('Using Base USDC:', BASE_USDC);

  // 1. Deploy sFIAT
  const SFiat = await ethers.getContractFactory('sFIAT');
  const sfiat = await SFiat.deploy('SOVR Fiat', 'sFIAT', gasOverrides);
  await sfiat.deployed();
  console.log('✅ sFIAT deployed at:', sfiat.address);

  // 2. Deploy ReserveManager
  const Reserve = await ethers.getContractFactory('ReserveManager');
  const reserve = await Reserve.deploy(BASE_USDC, sfiat.address, gasOverrides);
  await reserve.deployed();
  console.log('✅ ReserveManager deployed at:', reserve.address);

  // Grant roles
  const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));
  const BURNER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BURNER_ROLE'));
  await sfiat.grantRole(MINTER_ROLE, reserve.address, gasOverrides);
  await sfiat.grantRole(BURNER_ROLE, reserve.address, gasOverrides);
  console.log('   Roles granted to ReserveManager');

  // 3. Deploy SOVRPrivatePool (Peg)
  const Peg = await ethers.getContractFactory('SOVRPrivatePool');
  const peg = await Peg.deploy(SOVR_TOKEN, BASE_USDC, BASE_UNISWAP_FACTORY, BASE_POSITION_MANAGER, ethers.constants.AddressZero, 500, gasOverrides);
  await peg.deployed();
  console.log('✅ SOVRPrivatePool (Peg) deployed at:', peg.address);

  // Initialize Peg
  try {
      // 1:100 ratio
      await peg.initializePeg(1, 100, gasOverrides);
      console.log('   Peg initialized (1:100)');
  } catch (e) {
      console.log('   Peg initialization warning:', e.message);
  }

  // 4. Deploy SOVRProgrammablePool (Liquidity)
  const Liquidity = await ethers.getContractFactory('SOVRProgrammablePool');
  const liquidity = await Liquidity.deploy(BASE_POSITION_MANAGER, SOVR_TOKEN, BASE_USDC, 500, gasOverrides);
  await liquidity.deployed();
  console.log('✅ SOVRProgrammablePool (Liquidity) deployed at:', liquidity.address);

  // 5. Deploy SOVRHybridRouter
  const Router = await ethers.getContractFactory('SOVRHybridRouter');
  const router = await Router.deploy(peg.address, liquidity.address, reserve.address, gasOverrides);
  await router.deployed();
  console.log('✅ SOVRHybridRouter deployed at:', router.address);

  // 6. Deploy AttestorOracle
  const Att = await ethers.getContractFactory('AttestorOracle');
  const att = await Att.deploy(gasOverrides);
  await att.deployed();
  console.log('✅ AttestorOracle deployed at:', att.address);

  console.log('\n--------------------------------------------------');
  console.log('DEPLOYMENT COMPLETE. SAVE THESE ADDRESSES:');
  console.log(`SOVRToken: '${SOVR_TOKEN}',`);
  console.log(`USDC: '${BASE_USDC}',`);
  console.log(`sFIAT: '${sfiat.address}',`);
  console.log(`ReserveManager: '${reserve.address}',`);
  console.log(`SOVRPrivatePool: '${peg.address}',`);
  console.log(`SOVRProgrammablePool: '${liquidity.address}',`);
  console.log(`SOVRHybridRouter: '${router.address}',`);
  console.log(`AttestorOracle: '${att.address}',`);
  console.log('--------------------------------------------------');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

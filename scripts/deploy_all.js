const { ethers } = require('hardhat');
require('dotenv').config();
const { sqrtPriceX96ForHumanPrice } = require('./utils/sqrtPriceX96');
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);
  const SOVR = process.env.SOVR_TOKEN;
  const USDC = process.env.USDC;
  let POSITION_MANAGER = process.env.POSITION_MANAGER;
  let UNISWAP_FACTORY = process.env.UNISWAP_FACTORY;
  const SFiat = await ethers.getContractFactory('sFIAT');
  const sfiat = await SFiat.deploy('SOVR Fiat', 'sFIAT');
  await sfiat.deployed();
  console.log('sFIAT deployed at', sfiat.address);
  const Reserve = await ethers.getContractFactory('ReserveManager');
  const reserve = await Reserve.deploy(USDC, sfiat.address);
  await reserve.deployed();
  console.log('ReserveManager at', reserve.address);
  const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));
  const BURNER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BURNER_ROLE'));
  await sfiat.grantRole(MINTER_ROLE, reserve.address);
  await sfiat.grantRole(BURNER_ROLE, reserve.address);
  let sovrAddress = SOVR;
  let usdcAddress = USDC;

  if (network.name === 'localhost') {
    console.log('Deploying mock tokens for localhost...');
    const Token = await ethers.getContractFactory('TestERC20Decimals');
    const sovr = await Token.deploy('SOVR Token', 'SOVR', 18);
    await sovr.deployed();
    sovrAddress = sovr.address;
    console.log('Mock SOVR deployed at:', sovrAddress);

    const usdc = await Token.deploy('USDC Token', 'USDC', 6);
    await usdc.deployed();
    usdcAddress = usdc.address;
    console.log('Mock USDC deployed at:', usdcAddress);

    // Deploy Mock Uniswap V3 Factory
    const MockFactory = await ethers.getContractFactory('MockUniswapV3Factory');
    const mockFactory = await MockFactory.deploy();
    await mockFactory.deployed();
    UNISWAP_FACTORY = mockFactory.address;
    console.log('Mock Uniswap Factory deployed at:', UNISWAP_FACTORY);

    // Deploy Mock Position Manager
    const MockPM = await ethers.getContractFactory('MockNonfungiblePositionManager');
    const mockPM = await MockPM.deploy();
    await mockPM.deployed();
    POSITION_MANAGER = mockPM.address;
    console.log('Mock Position Manager deployed at:', POSITION_MANAGER);
  }

  const Peg = await ethers.getContractFactory('SOVRPrivatePool');
  // constructor(sovr, usdc, factory, positionManager, swapRouter, fee)
  const peg = await Peg.deploy(sovrAddress, usdcAddress, UNISWAP_FACTORY, POSITION_MANAGER, ethers.constants.AddressZero, 500);
  await peg.deployed();
  console.log('SOVRPrivatePool (Peg) at', peg.address);
  
  const sqrtPrice = sqrtPriceX96ForHumanPrice('0.01', 18, 6);
  console.log('sqrtPriceX96 (100:1) =', sqrtPrice);
  
  // SOVRPrivatePool.initializePeg takes (numerator, denominator)
  await peg.initializePeg(1, 100);
  console.log('Peg initialized');

  // Seed liquidity if on localhost
  if (network.name === 'localhost') {
    console.log('Seeding Peg Pool...');
    const [deployer] = await ethers.getSigners();
    const sovr = await ethers.getContractAt('TestERC20Decimals', sovrAddress);
    const usdc = await ethers.getContractAt('TestERC20Decimals', usdcAddress);
    
    // Mint tokens to deployer (ALREADY DONE IN CONSTRUCTOR)
    // await sovr.mint(deployer.address, ethers.utils.parseUnits('1000000', 18));
    // await usdc.mint(deployer.address, ethers.utils.parseUnits('1000000', 6));
    
    // Approve Peg
    await sovr.approve(peg.address, ethers.constants.MaxUint256);
    await usdc.approve(peg.address, ethers.constants.MaxUint256);
    
    // Seed: 500,000 SOVR + 5,000 USDC (matches 100:1 ratio)
    // seedPegLiquidity(sovrAmount, usdcAmount, tickLower, tickUpper)
    // Use 0,0 for full range (contract handles defaults)
    try {
      await peg.seedPegLiquidity(
        ethers.utils.parseUnits('500000', 18),
        ethers.utils.parseUnits('5000', 6),
        0,
        0
      );
      console.log('Peg Pool seeded with liquidity');
    } catch (error) {
      console.error('Seeding failed:', error.message);
    }
  }

  const Liquidity = await ethers.getContractFactory('SOVRProgrammablePool');
  const liquidity = await Liquidity.deploy(POSITION_MANAGER, sovrAddress, usdcAddress, 500);
  await liquidity.deployed();
  console.log('SOVRProgrammablePool (Liquidity) at', liquidity.address);
  
  const Router = await ethers.getContractFactory('SOVRHybridRouter');
  const router = await Router.deploy(peg.address, liquidity.address, reserve.address);
  await router.deployed();
  console.log('SOVRHybridRouter at', router.address);
  
  const Att = await ethers.getContractFactory('AttestorOracle');
  const att = await Att.deploy();
  await att.deployed();
  console.log('AttestorOracle at', att.address);
  
  console.log('Deploy complete.');
  console.log('--------------------------------------------------');
  console.log('UPDATE frontend/src/lib/contracts/addresses.ts WITH:');
  console.log(`SOVRToken: '${sovrAddress}' as \`0x\${string}\`,`);
  console.log(`USDC: '${usdcAddress}' as \`0x\${string}\`,`);
  console.log(`sFIAT: '${sfiat.address}' as \`0x\${string}\`,`);
  console.log(`ReserveManager: '${reserve.address}' as \`0x\${string}\`,`);
  console.log(`SOVRPrivatePool: '${peg.address}' as \`0x\${string}\`,`);
  console.log(`SOVRProgrammablePool: '${liquidity.address}' as \`0x\${string}\`,`);
  console.log(`SOVRHybridRouter: '${router.address}' as \`0x\${string}\`,`);
  console.log(`AttestorOracleEIP712: '${att.address}' as \`0x\${string}\`,`);
  console.log('--------------------------------------------------');
}
main().catch((err) => { console.error(err); process.exit(1); });

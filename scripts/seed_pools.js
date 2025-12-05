const { ethers } = require('hardhat');
require('dotenv').config();
async function main() {
  const [deployer] = await ethers.getSigners();
  const Peg = await ethers.getContractFactory('SOVRPrivatePool');
  const pegAddr = process.env.PEG_CONTROLLER || '';
  if (!pegAddr) {
    console.log('Set PEG_CONTROLLER in .env or export before running seed.');
    return;
  }
  const peg = Peg.attach(pegAddr);
  
  const sovrAddr = await peg.SOVR();
  const usdcAddr = await peg.USDC();
  const sovr = await ethers.getContractAt("IERC20", sovrAddr);
  const usdc = await ethers.getContractAt("IERC20", usdcAddr);

  const sovrSeed = ethers.utils.parseUnits('500000', 18); // 500,000 SOVR
  const usdcSeed = ethers.utils.parseUnits('5000', 6); // 5,000 USDC

  console.log('Approving tokens...');
  await (await sovr.approve(peg.address, sovrSeed)).wait();
  await (await usdc.approve(peg.address, usdcSeed)).wait();

  console.log('Initializing Peg (1:1)...');
  try {
      await (await peg.initializePeg(1, 1)).wait();
      console.log('Peg Initialized.');
  } catch (e) {
      console.log('Peg already initialized or failed:', e.message);
  }

  console.log('Seeding Peg Pool...');
  const tx = await peg.seedPegLiquidity(sovrSeed, usdcSeed, 0, 0);
  const receipt = await tx.wait();
  console.log('Peg seeded, tx:', receipt.transactionHash);
}
main().catch((err) => { console.error(err); process.exit(1); });

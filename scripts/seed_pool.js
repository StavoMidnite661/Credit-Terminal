/**
 * Seed initial liquidity to the SOVR PrivatePool
 * 
 * Usage: node scripts/seed_pool.js --sovr 10000 --usdc 100
 * 
 * This script:
 * 1. Approves SOVR for PrivatePool
 * 2. Approves USDC for PrivatePool  
 * 3. Calls seedPegLiquidity() to create the initial credit reserve
 */

const { ethers } = require('ethers');
require('dotenv').config();

// Config
const RPC_URL = process.env.BASE_RPC || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// Addresses
const SOVR = '0x65e75d0fc656a2e81ef17e9a2a8da58d82390422';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PRIVATE_POOL = '0x18d4a13a0116b360efddb72aa626721cfa2a8228';

// ABIs
const ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

const PRIVATE_POOL_ABI = [
    'function seedPegLiquidity(uint256 sovrAmount, uint256 usdcAmount, int24 tickLower, int24 tickUpper, address recipient) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
    'function pool() view returns (address)',
    'function initializePeg(uint256 humanNumerator, uint256 humanDenominator)'
];

async function main() {
    // Parse args
    const args = process.argv.slice(2);
    let sovrAmount = '10000'; // Default 10,000 SOVR
    let usdcAmount = '100';   // Default 100 USDC
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--sovr' && args[i + 1]) sovrAmount = args[i + 1];
        if (args[i] === '--usdc' && args[i + 1]) usdcAmount = args[i + 1];
    }

    console.log('========================================');
    console.log('  SOVR Pool Seeding Script');
    console.log('========================================');
    console.log(`SOVR Amount: ${sovrAmount}`);
    console.log(`USDC Amount: ${usdcAmount}`);
    console.log('');

    if (!PRIVATE_KEY) {
        console.error('❌ Missing DEPLOYER_PRIVATE_KEY in .env');
        process.exit(1);
    }

    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    console.log(`Network: Base Mainnet (8453)`);
    console.log('');

    // Contracts
    const sovr = new ethers.Contract(SOVR, ERC20_ABI, wallet);
    const usdc = new ethers.Contract(USDC, ERC20_ABI, wallet);
    const privatePool = new ethers.Contract(PRIVATE_POOL, PRIVATE_POOL_ABI, wallet);

    // Get decimals
    const sovrDecimals = await sovr.decimals();
    const usdcDecimals = await usdc.decimals();
    
    const sovrWei = ethers.utils.parseUnits(sovrAmount, sovrDecimals);
    const usdcWei = ethers.utils.parseUnits(usdcAmount, usdcDecimals);

    // Check balances
    const sovrBalance = await sovr.balanceOf(wallet.address);
    const usdcBalance = await usdc.balanceOf(wallet.address);
    
    console.log(`Your SOVR Balance: ${ethers.utils.formatUnits(sovrBalance, sovrDecimals)}`);
    console.log(`Your USDC Balance: ${ethers.utils.formatUnits(usdcBalance, usdcDecimals)}`);
    console.log('');

    if (sovrBalance.lt(sovrWei)) {
        console.error(`❌ Insufficient SOVR. Need ${sovrAmount}, have ${ethers.utils.formatUnits(sovrBalance, sovrDecimals)}`);
        process.exit(1);
    }
    if (usdcBalance.lt(usdcWei)) {
        console.error(`❌ Insufficient USDC. Need ${usdcAmount}, have ${ethers.utils.formatUnits(usdcBalance, usdcDecimals)}`);
        process.exit(1);
    }

    // Gas settings for Base
    const gasOverrides = {
        maxFeePerGas: ethers.utils.parseUnits('0.1', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseUnits('0.01', 'gwei'),
    };

    // Step 1: Approve SOVR
    console.log('📝 Step 1: Approving SOVR...');
    const tx1 = await sovr.approve(PRIVATE_POOL, sovrWei, gasOverrides);
    await tx1.wait();
    console.log(`   ✅ SOVR approved: ${tx1.hash}`);

    // Step 2: Approve USDC
    console.log('📝 Step 2: Approving USDC...');
    const tx2 = await usdc.approve(PRIVATE_POOL, usdcWei, gasOverrides);
    await tx2.wait();
    console.log(`   ✅ USDC approved: ${tx2.hash}`);

    // Step 3: Seed liquidity
    console.log('📝 Step 3: Seeding liquidity...');
    const tx3 = await privatePool.seedPegLiquidity(
        sovrWei,
        usdcWei,
        0,  // tickLower (0 = full range)
        0,  // tickUpper (0 = full range)
        wallet.address, // recipient gets the NFT position
        { ...gasOverrides, gasLimit: 1000000 }
    );
    const receipt = await tx3.wait();
    console.log(`   ✅ Liquidity seeded: ${tx3.hash}`);

    // Parse events
    const pegSeededEvent = receipt.events?.find(e => e.event === 'PegSeeded');
    if (pegSeededEvent) {
        console.log('');
        console.log('🎉 Success! Pool seeded with:');
        console.log(`   Token ID: ${pegSeededEvent.args.tokenId}`);
        console.log(`   Liquidity: ${pegSeededEvent.args.liquidity}`);
        console.log(`   Amount0: ${pegSeededEvent.args.amount0}`);
        console.log(`   Amount1: ${pegSeededEvent.args.amount1}`);
    }

    console.log('');
    console.log('========================================');
    console.log('  Pool is now ready for swaps!');
    console.log('========================================');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

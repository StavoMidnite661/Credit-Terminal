const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("🔍 Debugging Revert...");
    
    const rpcUrl = process.env.BASE_RPC || 'https://mainnet.base.org';
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Load Artifact
    const artifactName = 'SOVRPrivatePool';
    const artifactPath = path.join(__dirname, `../artifacts/contracts/${artifactName}.sol/${artifactName}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
    
    // Args
    const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const BASE_UNISWAP_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
    const BASE_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
    const SOVR_TOKEN = process.env.SOVR_TOKEN;
    
    console.log("Args:", {
        SOVR: SOVR_TOKEN,
        USDC: BASE_USDC,
        Factory: BASE_UNISWAP_FACTORY,
        PM: BASE_POSITION_MANAGER,
        Router: ethers.constants.AddressZero,
        Fee: 500
    });

    // Check Code Existence
    const sovrCode = await provider.getCode(SOVR_TOKEN);
    console.log(`SOVR Code Size: ${sovrCode.length > 2 ? (sovrCode.length - 2) / 2 : 0} bytes`);
    
    const usdcCode = await provider.getCode(BASE_USDC);
    console.log(`USDC Code Size: ${usdcCode.length > 2 ? (usdcCode.length - 2) / 2 : 0} bytes`);

    const factoryCode = await provider.getCode(BASE_UNISWAP_FACTORY);
    console.log(`Factory Code Size: ${factoryCode.length > 2 ? (factoryCode.length - 2) / 2 : 0} bytes`);

    if (sovrCode === '0x') console.warn("⚠️  SOVR Token has NO CODE (EOA or wrong address)");
    if (usdcCode === '0x') console.warn("⚠️  USDC has NO CODE");
    if (factoryCode === '0x') console.warn("⚠️  Factory has NO CODE");

    const deployTx = factory.getDeployTransaction(
        SOVR_TOKEN, 
        BASE_USDC, 
        BASE_UNISWAP_FACTORY, 
        BASE_POSITION_MANAGER, 
        ethers.constants.AddressZero, 
        500
    );

    try {
        // Simulate deployment via eth_call
        const result = await provider.call({
            data: deployTx.data
        });
        console.log("✅ Simulation succeeded (Address returned):", result);
    } catch (e) {
        console.log("❌ Simulation REVERTED:");
        console.log(e);
        
        if (e.data) {
            // Try to decode revert reason
            try {
                const reason = ethers.utils.toUtf8String('0x' + e.data.substring(138));
                console.log("Decoded Reason:", reason);
            } catch (err) {
                console.log("Could not decode reason string.");
            }
        }
    }
}

main().catch(console.error);

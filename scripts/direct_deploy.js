const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("🚀 Direct Deployment (No Hardhat Runtime)...");
    
    const rpcUrl = process.env.BASE_RPC || 'https://mainnet.base.org';
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    
    if (!privateKey) throw new Error("Missing DEPLOYER_PRIVATE_KEY");

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log("Deployer:", wallet.address);
    const balance = await wallet.getBalance();
    console.log("Balance:", ethers.utils.formatEther(balance));

    // Load Artifact manually
    const artifactPath = path.join(__dirname, '../artifacts/contracts/sFIAT.sol/sFIAT.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    
    const gasOverrides = {
        maxFeePerGas: ethers.utils.parseUnits('0.1', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseUnits('0.01', 'gwei'),
    };

    console.log("Deploying sFIAT...");
    const contract = await factory.deploy('SOVR Fiat', 'sFIAT', gasOverrides);
    console.log("Tx Hash:", contract.deployTransaction.hash);
    
    console.log("Waiting for confirmation...");
    await contract.deployed();
    
    console.log("✅ sFIAT deployed at:", contract.address);
}

main().catch(console.error);

const { ethers } = require('hardhat');
require('dotenv').config();

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Checking nonce for:", deployer.address);
    
    const nonce = await deployer.getTransactionCount("latest");
    const pendingNonce = await deployer.getTransactionCount("pending");
    
    console.log("Latest Nonce (confirmed):", nonce);
    console.log("Pending Nonce (mempool):", pendingNonce);
    
    if (pendingNonce > nonce) {
        console.log(`⚠️ There are ${pendingNonce - nonce} pending transactions.`);
    } else {
        console.log("✅ No pending transactions.");
    }
}

main().catch(console.error);

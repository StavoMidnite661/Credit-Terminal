const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
    const rpcUrl = process.env.BASE_RPC || 'https://mainnet.base.org';
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    
    if (!privateKey) {
        console.error("❌ No DEPLOYER_PRIVATE_KEY found in .env");
        return;
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log("\n--- WALLET CHECK ---");
    console.log("Address in .env:", wallet.address);
    
    const balance = await wallet.getBalance();
    console.log("Balance:", ethers.utils.formatEther(balance), "ETH");
    
    if (balance.lt(ethers.utils.parseEther("0.001"))) {
        console.log("⚠️  This wallet is effectively EMPTY.");
    } else {
        console.log("✅  Wallet has funds!");
    }
    console.log("--------------------\n");
}

main().catch(console.error);

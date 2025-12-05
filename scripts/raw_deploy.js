const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

// Simple HTTP request to bypass complex provider logic
function rpcCall(method, params) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: method,
            params: params
        });

        const url = new URL(process.env.BASE_RPC || 'https://mainnet.base.org');
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => { responseData += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(responseData);
                    if (json.error) reject(json.error);
                    else resolve(json.result);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

async function main() {
    console.log("🚀 Raw Deployment (Bypassing Provider)...");
    
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) throw new Error("Missing DEPLOYER_PRIVATE_KEY");

    const wallet = new ethers.Wallet(privateKey);
    console.log("Deployer:", wallet.address);

    // 1. Get Nonce
    const nonceHex = await rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
    const nonce = parseInt(nonceHex, 16);
    console.log("Nonce:", nonce);

    // 2. Get Gas Price
    const gasPriceHex = await rpcCall('eth_gasPrice', []);
    const gasPrice = ethers.BigNumber.from(gasPriceHex);
    console.log("Gas Price:", ethers.utils.formatUnits(gasPrice, 'gwei'), "gwei");

    // 3. Prepare Transaction
    const artifactPath = path.join(__dirname, '../artifacts/contracts/sFIAT.sol/sFIAT.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
    const deployTx = factory.getDeployTransaction('SOVR Fiat', 'sFIAT');

    const tx = {
        to: null,
        data: deployTx.data,
        value: 0,
        gasLimit: ethers.utils.hexlify(1500000), // Lower limit to fit in balance
        gasPrice: ethers.utils.parseUnits('0.1', 'gwei').toHexString(),
        nonce: nonceHex,
        chainId: 8453 // Base Mainnet
    };

    // 4. Sign Transaction
    const signedTx = await wallet.signTransaction(tx);
    console.log("Transaction Signed.");

    // 5. Send Raw Transaction
    console.log("Sending Transaction...");
    const txHash = await rpcCall('eth_sendRawTransaction', [signedTx]);
    console.log("✅ Tx Sent! Hash:", txHash);
    console.log("Check status at: https://basescan.org/tx/" + txHash);
}

main().catch(console.error);

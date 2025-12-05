// scripts/deploy_router_v2.js
// Deploy TWAPHelper and SOVRHybridRouter_v2 to Base Mainnet
const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

// --- CONFIG ---
const RPC_URL = process.env.BASE_RPC || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const GAS_PRICE_GWEI = '0.1';
const GAS_LIMIT = 10000000;

// Base Mainnet addresses
const BASE_UNISWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481'; // SwapRouter on Base
const SOVR_TOKEN = process.env.SOVR_TOKEN;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const EXISTING_PEG_POOL = '0x18d4a13a0116b360efddb72aa626721cfa2a8228'; // From deployment

// --- HELPERS ---
function rpcCall(method, params) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params });
        const url = new URL(RPC_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
        };
        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => { responseData += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(responseData);
                    if (json.error) reject(json.error);
                    else resolve(json.result);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForReceipt(txHash) {
    console.log(`   Waiting for tx ${txHash.substring(0, 10)}...`);
    while (true) {
        const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
        if (receipt) {
            if (receipt.status === '0x1') return receipt;
            throw new Error(`Tx failed: ${txHash}`);
        }
        await sleep(2000);
    }
}

async function deploy(wallet, artifactName, args, nonce) {
    console.log(`\n📦 Deploying ${artifactName}...`);
    
    const artifactPath = path.join(__dirname, `../artifacts/contracts/${artifactName}.sol/${artifactName}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
    const deployTx = factory.getDeployTransaction(...args);

    const tx = {
        to: null,
        data: deployTx.data,
        value: 0,
        gasLimit: ethers.utils.hexlify(GAS_LIMIT),
        gasPrice: ethers.utils.parseUnits(GAS_PRICE_GWEI, 'gwei').toHexString(),
        nonce: ethers.utils.hexlify(nonce),
        chainId: 8453
    };

    const signedTx = await wallet.signTransaction(tx);
    const txHash = await rpcCall('eth_sendRawTransaction', [signedTx]);
    console.log(`   🚀 Sent! Hash: ${txHash}`);
    
    const receipt = await waitForReceipt(txHash);
    console.log(`   ✅ Deployed at: ${receipt.contractAddress}`);
    
    return receipt.contractAddress;
}

async function main() {
    if (!PRIVATE_KEY) throw new Error("Missing DEPLOYER_PRIVATE_KEY");
    if (!SOVR_TOKEN) throw new Error("Missing SOVR_TOKEN");
    
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    console.log(`Deployer: ${wallet.address}`);

    // Get starting nonce
    let nonceHex = await rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
    let nonce = parseInt(nonceHex, 16);
    console.log(`Starting Nonce: ${nonce}`);

    // 1. Deploy TWAPHelper
    const twapHelperAddr = await deploy(wallet, 'TWAPHelper', [], nonce++);
    
    // 2. Deploy SOVRHybridRouter_v2
    const routerV2Addr = await deploy(wallet, 'SOVRHybridRouter_v2', [
        BASE_UNISWAP_ROUTER,
        twapHelperAddr,
        SOVR_TOKEN,
        BASE_USDC,
        EXISTING_PEG_POOL
    ], nonce++);

    console.log('\n--- DEPLOYMENT SUMMARY ---');
    console.log(`TWAPHelper: ${twapHelperAddr}`);
    console.log(`SOVRHybridRouter_v2: ${routerV2Addr}`);
    console.log('--------------------------');

    // Save deployment info
    const deploymentInfo = {
        network: 'base',
        chainId: 8453,
        timestamp: new Date().toISOString(),
        contracts: {
            TWAPHelper: twapHelperAddr,
            SOVRHybridRouter_v2: routerV2Addr
        },
        references: {
            UniswapRouter: BASE_UNISWAP_ROUTER,
            SOVR: SOVR_TOKEN,
            USDC: BASE_USDC,
            PegPool: EXISTING_PEG_POOL
        }
    };

    const deploymentPath = path.join(__dirname, '..', 'deployment', 'router_v2_deployment.json');
    fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\nDeployment info saved to: ${deploymentPath}`);
}

main().catch(console.error);

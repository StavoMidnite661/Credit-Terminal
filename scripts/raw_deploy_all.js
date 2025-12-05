const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

// --- CONFIG ---
const RPC_URL = process.env.BASE_RPC || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const GAS_PRICE_GWEI = '0.1'; // Ultra cheap
const GAS_LIMIT = 10000000; // 10M gas safe limit

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
    
    // Load Artifact
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
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    console.log(`Deployer: ${wallet.address}`);

    // Get starting nonce
    let nonceHex = await rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
    let nonce = parseInt(nonceHex, 16);
    console.log(`Starting Nonce: ${nonce}`);

    // Addresses
    const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const BASE_UNISWAP_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
    const BASE_POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
    const SOVR_TOKEN = process.env.SOVR_TOKEN;

    if (!SOVR_TOKEN) throw new Error("Missing SOVR_TOKEN");

    // 1. sFIAT
    const sFiatAddr = await deploy(wallet, 'sFIAT', ['SOVR Fiat', 'sFIAT'], nonce++);
    
    // 2. ReserveManager
    const reserveAddr = await deploy(wallet, 'ReserveManager', [BASE_USDC, sFiatAddr], nonce++);
    
    // 3. Grant Roles (sFIAT -> ReserveManager)
    const MINTER_ROLE = ethers.utils.id("MINTER_ROLE");
    const BURNER_ROLE = ethers.utils.id("BURNER_ROLE");

    console.log("📦 Granting Roles...");
    
    const sFiatArtifactPath = path.join(__dirname, `../artifacts/contracts/sFIAT.sol/sFIAT.json`);
    const sFiatArtifact = JSON.parse(fs.readFileSync(sFiatArtifactPath, 'utf8'));
    const sFiatContract = new ethers.Contract(sFiatAddr, sFiatArtifact.abi);

    // Grant MINTER
    const grantMinterData = sFiatContract.interface.encodeFunctionData("grantRole", [MINTER_ROLE, reserveAddr]);
    const txMinter = {
        to: sFiatAddr,
        data: grantMinterData,
        value: 0,
        gasLimit: ethers.utils.hexlify(GAS_LIMIT),
        gasPrice: ethers.utils.parseUnits(GAS_PRICE_GWEI, 'gwei').toHexString(),
        nonce: ethers.utils.hexlify(nonce++),
        chainId: 8453
    };
    const signedMinter = await wallet.signTransaction(txMinter);
    const hashMinter = await rpcCall('eth_sendRawTransaction', [signedMinter]);
    console.log(`   Granted MINTER: ${hashMinter}`);
    await waitForReceipt(hashMinter);

    // Grant BURNER
    const grantBurnerData = sFiatContract.interface.encodeFunctionData("grantRole", [BURNER_ROLE, reserveAddr]);
    const txBurner = {
        to: sFiatAddr,
        data: grantBurnerData,
        value: 0,
        gasLimit: ethers.utils.hexlify(GAS_LIMIT),
        gasPrice: ethers.utils.parseUnits(GAS_PRICE_GWEI, 'gwei').toHexString(),
        nonce: ethers.utils.hexlify(nonce++),
        chainId: 8453
    };
    const signedBurner = await wallet.signTransaction(txBurner);
    const hashBurner = await rpcCall('eth_sendRawTransaction', [signedBurner]);
    console.log(`   Granted BURNER: ${hashBurner}`);
    await waitForReceipt(hashBurner);

    // 4. SOVRPrivatePool (Peg)
    const pegAddr = await deploy(wallet, 'SOVRPrivatePool', [SOVR_TOKEN, BASE_USDC, BASE_UNISWAP_FACTORY, BASE_POSITION_MANAGER, ethers.constants.AddressZero, 500], nonce++);
    
    // 5. SOVRProgrammablePool (Liquidity)
    const liquidityAddr = await deploy(wallet, 'SOVRProgrammablePool', [BASE_POSITION_MANAGER, SOVR_TOKEN, BASE_USDC, 500], nonce++);
    
    // 6. SOVRHybridRouter
    const routerAddr = await deploy(wallet, 'SOVRHybridRouter', [pegAddr, liquidityAddr, reserveAddr], nonce++);
    
    // 7. AttestorOracle
    const oracleAddr = await deploy(wallet, 'AttestorOracle', [], nonce++);

    console.log('\n--- DEPLOYMENT SUMMARY ---');
    console.log(`sFIAT: ${sFiatAddr}`);
    console.log(`ReserveManager: ${reserveAddr}`);
    console.log(`SOVRPrivatePool: ${pegAddr}`);
    console.log(`SOVRProgrammablePool: ${liquidityAddr}`);
    console.log(`SOVRHybridRouter: ${routerAddr}`);
    console.log(`AttestorOracle: ${oracleAddr}`);
    console.log('--------------------------');
}

main().catch(console.error);

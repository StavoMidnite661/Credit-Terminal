const { ethers } = require('ethers');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('🔍 AUDIT: Verifying Base Deployment\n');
    
    const provider = new ethers.providers.JsonRpcProvider(
        process.env.BASE_RPC || 'https://mainnet.base.org'
    );

    const contracts = {
        'sFIAT': '0x2c98e9c8ba005dc690d98e2e31a4811c094e0be3',
        'ReserveManager': '0xed3db8f97024a3be5f5ae22f27024e5e94fad64a',
        'SOVRPrivatePool': '0x18d4a13a0116b360efddb72aa626721cfa2a8228',
        'SOVRProgrammablePool': '0x4f9b7a45b5234ca1cc96980d2cb0f49768d26622',
        'SOVRHybridRouter': '0xcb410361687926949953f84df7bd04a8d1cfe616',
        'AttestorOracle': '0xaca71bc598139d9167414ae666f7cd9377b871f7'
    };

    console.log('═══════════════════════════════════════════════════════════');
    console.log('PART 1: CONTRACT EXISTENCE CHECK');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const [name, address] of Object.entries(contracts)) {
        const code = await provider.getCode(address);
        const codeSize = code === '0x' ? 0 : (code.length - 2) / 2;
        
        console.log(`${name}:`);
        console.log(`  Address: ${address}`);
        console.log(`  Code Size: ${codeSize} bytes`);
        console.log(`  Status: ${codeSize > 0 ? '✅ DEPLOYED' : '❌ NOT FOUND'}`);
        
        if (codeSize > 0) {
            // Load expected artifact
            const artifactPath = path.join(__dirname, `../artifacts/contracts/${name}.sol/${name}.json`);
            if (fs.existsSync(artifactPath)) {
                const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
                const expectedSize = (artifact.deployedBytecode.length - 2) / 2;
                
                console.log(`  Expected Size: ${expectedSize} bytes`);
                console.log(`  Size Match: ${codeSize === expectedSize ? '✅ EXACT' : '⚠️  MISMATCH'}`);
                
                // Check if bytecode matches (accounting for constructor args and metadata)
                const onChainCode = code.toLowerCase();
                const expectedCode = artifact.deployedBytecode.toLowerCase();
                
                // The deployed code should START with the expected bytecode
                // (it may have constructor args appended)
                const codeMatches = onChainCode.startsWith(expectedCode.substring(0, Math.min(1000, expectedCode.length)));
                console.log(`  Bytecode Match: ${codeMatches ? '✅ VERIFIED' : '❌ DIFFERENT CONTRACT'}`);
            }
        }
        console.log('');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('PART 2: ROLE VERIFICATION (sFIAT)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const sFiatArtifact = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../artifacts/contracts/sFIAT.sol/sFIAT.json'), 
        'utf8'
    ));
    const sFiat = new ethers.Contract(contracts.sFIAT, sFiatArtifact.abi, provider);
    
    const MINTER_ROLE = ethers.utils.id("MINTER_ROLE");
    const BURNER_ROLE = ethers.utils.id("BURNER_ROLE");
    
    const hasMinter = await sFiat.hasRole(MINTER_ROLE, contracts.ReserveManager);
    const hasBurner = await sFiat.hasRole(BURNER_ROLE, contracts.ReserveManager);
    
    console.log(`ReserveManager has MINTER_ROLE: ${hasMinter ? '✅ YES' : '❌ NO'}`);
    console.log(`ReserveManager has BURNER_ROLE: ${hasBurner ? '✅ YES' : '❌ NO'}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('PART 3: CONSTRUCTOR PARAMETERS VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Check ReserveManager constructor params
    const reserveArtifact = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../artifacts/contracts/ReserveManager.sol/ReserveManager.json'),
        'utf8'
    ));
    const reserve = new ethers.Contract(contracts.ReserveManager, reserveArtifact.abi, provider);
    
    const reserveUsdc = await reserve.USDC();
    const reserveSFiat = await reserve.sFIAT();
    
    console.log('ReserveManager:');
    console.log(`  USDC: ${reserveUsdc}`);
    console.log(`  Expected: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`);
    console.log(`  Match: ${reserveUsdc.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ? '✅' : '❌'}`);
    console.log(`  sFIAT: ${reserveSFiat}`);
    console.log(`  Expected: ${contracts.sFIAT}`);
    console.log(`  Match: ${reserveSFiat.toLowerCase() === contracts.sFIAT.toLowerCase() ? '✅' : '❌'}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('AUDIT COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

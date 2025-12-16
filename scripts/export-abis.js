/**
 * Export ABIs from Credit Terminal to Studio
 * 
 * This script copies the compiled contract ABIs to the Studio app
 * so it can interact with the Credit Terminal contracts.
 * 
 * Usage: node scripts/export-abis.js
 */

const fs = require('fs');
const path = require('path');

// Source: Hardhat artifacts
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts', 'contracts');

// Destination: Studio shared contracts
const STUDIO_CONTRACTS_DIR = path.join(__dirname, '..', '..', 'studio', 'src', 'contracts');

// Contracts to export (only the ones Studio needs)
const CONTRACTS_TO_EXPORT = [
  'AttestorOracleEIP712',
  'CreditEventRegistry',
  'SOVRHybridRouter_v2',
  'sFIAT',
  'ReserveManager',
];

// Deployed addresses on Base Mainnet (from README.md)
const DEPLOYED_ADDRESSES = {
  base: {
    chainId: 8453,
    contracts: {
      SOVRToken: '0x65e75d0fc656a2e81ef17e9a2a8da58d82390422',
      sFIAT: '0x2c98e9c8ba005dc690d98e2e31a4811c094e0be3',
      ReserveManager: '0xed3db8f97024a3be5f5ae22f27024e5e94fad64a',
      SOVRPrivatePool: '0x18d4a13a0116b360efddb72aa626721cfa2a8228',
      SOVRProgrammablePool: '0x4f9b7a45b5234ca1cc96980d2cb0f49768d26622',
      SOVRHybridRouter_v2: '0xf682bd9789c0a66f2cb82ecc13fc6b43d7b58830',
      AttestorOracleEIP712: '0xaca71bc598139d9167414ae666f7cd9377b871f7',
      TWAPHelper: '0xa3620e31fb37b7de32fadf5c476d93c080fe3ad4',
      CreditEventRegistry: '0x0000000000000000000000000000000000000000', // TODO: Deploy
    }
  },
  baseSepolia: {
    chainId: 84532,
    contracts: {
      // Testnet addresses (to be filled after deployment)
      SOVRToken: '',
      sFIAT: '',
      ReserveManager: '',
      SOVRPrivatePool: '',
      SOVRProgrammablePool: '',
      SOVRHybridRouter_v2: '',
      AttestorOracleEIP712: '',
      TWAPHelper: '',
      CreditEventRegistry: '',
    }
  },
  localhost: {
    chainId: 31337,
    contracts: {
      // Local development (filled by deploy script)
      SOVRToken: '',
      sFIAT: '',
      ReserveManager: '',
      SOVRPrivatePool: '',
      SOVRProgrammablePool: '',
      SOVRHybridRouter_v2: '',
      AttestorOracleEIP712: '',
      TWAPHelper: '',
      CreditEventRegistry: '',
    }
  }
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

function extractABI(artifactPath) {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return {
    abi: artifact.abi,
    contractName: artifact.contractName,
  };
}

function main() {
  console.log('='.repeat(60));
  console.log('SOVR Credit Terminal → Studio ABI Export');
  console.log('='.repeat(60));

  // Ensure destination directory exists
  ensureDir(STUDIO_CONTRACTS_DIR);

  // Export each contract ABI
  let exportedCount = 0;
  
  for (const contractName of CONTRACTS_TO_EXPORT) {
    const artifactPath = path.join(
      ARTIFACTS_DIR,
      `${contractName}.sol`,
      `${contractName}.json`
    );

    if (!fs.existsSync(artifactPath)) {
      console.log(`⚠️  Skipping ${contractName} (not compiled)`);
      continue;
    }

    const { abi } = extractABI(artifactPath);
    const destPath = path.join(STUDIO_CONTRACTS_DIR, `${contractName}.json`);
    
    fs.writeFileSync(destPath, JSON.stringify({ abi }, null, 2));
    console.log(`✅ Exported: ${contractName}`);
    exportedCount++;
  }

  // Write addresses.json
  const addressesPath = path.join(STUDIO_CONTRACTS_DIR, 'addresses.json');
  fs.writeFileSync(addressesPath, JSON.stringify(DEPLOYED_ADDRESSES, null, 2));
  console.log(`✅ Exported: addresses.json`);

  console.log('='.repeat(60));
  console.log(`Done! Exported ${exportedCount} ABIs to Studio.`);
  console.log(`Destination: ${STUDIO_CONTRACTS_DIR}`);
  console.log('='.repeat(60));
}

main();

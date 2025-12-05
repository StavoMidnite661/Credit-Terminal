// scheduler/index.js
require('dotenv').config();
const { ethers } = require('ethers');
const schedule = require('node-cron');
const axios = require('axios');
const { KMSSigner } = require('../src/kmsSigner'); // Adjusted path

const RPC = process.env.RPC || 'http://127.0.0.1:8545';
const provider = new ethers.providers.JsonRpcProvider(RPC);
const verifyingContract = process.env.ATTESTOR_CONTRACT;
const chainIdPromise = provider.getNetwork().then(n => n.chainId);

const kms = new KMSSigner({ keyId: process.env.AWS_KMS_KEY_ID, region: process.env.AWS_REGION });

async function buildAndSignAttestation(order) {
  const chainId = await chainIdPromise;
  // We need to build the domain separator and structHash manually here as per EIP-712
  // This duplicates logic from server.js/domain.js but that's fine for now.
  
  const domain = {
    name: process.env.DOMAIN_NAME || "SOVR Attestor",
    version: process.env.DOMAIN_VERSION || "1",
    chainId: chainId,
    verifyingContract: verifyingContract
  };
  
  const AttestationTypes = {
      Attestation: [
        { name: "orderId", type: "string" },
        { name: "amount", type: "uint256" },
        { name: "recipient", type: "string" },
        { name: "timestamp", type: "uint256" },
        { name: "nonce", type: "uint256" }
      ]
  };

  const domainSeparator = ethers.utils._TypedDataEncoder.hashDomain(domain);
  const structHash = ethers.utils._TypedDataEncoder.hashStruct("Attestation", AttestationTypes, order);

  const sig = await kms.signTypedDataDigest(domainSeparator, structHash); // returns {r,s,v}
  return { payload: order, sig };
}

// cron expression example: every minute -> '* * * * *'
// choose production cadence (e.g., '*/5 * * * *' every 5 minutes)
schedule.schedule('*/1 * * * *', async () => {
  try {
    console.log('Scheduler tick', new Date().toISOString());
    // fetch jobs from queue or DB — placeholder: single test order
    const order = {
      orderId: `order-${Date.now()}`,
      amount: ethers.utils.parseUnits('1', 6).toString(),
      recipient: 'alice@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      nonce: Math.floor(Math.random() * 1e9)
    };
    const { payload, sig } = await buildAndSignAttestation(order);
    // Option A: submit on-chain directly
    if ((process.env.SUBMIT_ONCHAIN || 'false') === 'true') {
      const wallet = new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY, provider);
      const attestor = new ethers.Contract(verifyingContract, ['function verifyAttestation(string,uint256,string,uint256,uint256,bytes) external returns (bytes32)'], wallet);
      const signatureBytes = ethers.utils.joinSignature({ r: sig.r, s: sig.s, v: sig.v });
      const tx = await attestor.verifyAttestation(payload.orderId, payload.amount, payload.recipient, payload.timestamp, payload.nonce, signatureBytes);
      console.log('Submitted attestation tx:', tx.hash);
    } else {
      // Option B: store in DB or forward to operator endpoint
      await axios.post(process.env.ATTESTATION_BACKEND || 'http://localhost:4000/attestations', { payload, sig });
      console.log('Posted attestation to backend');
    }
  } catch (err) {
    console.error('Scheduler error', err);
  }
});

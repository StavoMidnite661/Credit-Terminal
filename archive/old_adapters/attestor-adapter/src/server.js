require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { ethers } = require("ethers");
const { v4: uuidv4 } = require("uuid");
const { AttestationTypes } = require("./eip712/types");
const { buildDomain } = require("./eip712/domain");
const { KMSSigner } = require("./kmsSigner"); // Use KMS signer if configured

const PORT = process.env.PORT || 3001;
const RPC = process.env.RPC || "http://127.0.0.1:8545";
const SUBMIT_ONCHAIN = (process.env.SUBMIT_ONCHAIN || "false").toLowerCase() === "true";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const provider = new ethers.providers.JsonRpcProvider(RPC);
let wallet;
let kms;

if (process.env.AWS_KMS_KEY_ID) {
    console.log("Using AWS KMS Signer");
    kms = new KMSSigner({
        keyId: process.env.AWS_KMS_KEY_ID,
        region: process.env.AWS_REGION
    });
} else if (process.env.ATTESTOR_PRIVATE_KEY) {
    console.log("Using Local Private Key Signer");
    wallet = new ethers.Wallet(process.env.ATTESTOR_PRIVATE_KEY, provider);
} else {
  console.error("Missing ATTESTOR_PRIVATE_KEY or AWS_KMS_KEY_ID in .env — adapter cannot sign");
  process.exit(1);
}

let verifyingContract = process.env.ATTESTOR_CONTRACT;

const ATTESTOR_ABI = [
  "function verifyAttestation(string orderId,uint256 amount,string recipient,uint256 timestamp,uint256 nonce,bytes signature) external returns (bytes32)"
];

app.post("/createOrder", async (req, res) => {
  try {
    const { orderId, amount, recipient } = req.body;
    if (!orderId || !amount || !recipient) {
      return res.status(400).json({ ok: false, error: "orderId, amount, recipient required" });
    }

    // Build payload
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.floor(Math.random() * 1e9);
    const parsedAmount = ethers.BigNumber.from(amount.toString()); // expect raw units (e.g., 6 decimals)
    // If the user sends human decimal strings, you may want to parse with parseUnits(...)

    // domain
    const chainId = (await provider.getNetwork()).chainId;
    const domain = buildDomain(verifyingContract, chainId);

    const payload = {
      orderId,
      amount: parsedAmount.toString(),
      recipient,
      timestamp,
      nonce
    };

    let signature;
    if (kms) {
        // KMS signing logic
        // We need to construct the digest manually for KMS
        // This part requires careful construction of the EIP-712 digest
        // For now, let's assume the KMS signer has a helper or we implement it here
        // The provided KMS signer code has signTypedDataDigest
        
        // We need to calculate domainSeparator and structHash
        const domainSeparator = ethers.utils._TypedDataEncoder.hashDomain(domain);
        const structHash = ethers.utils._TypedDataEncoder.hashStruct("Attestation", AttestationTypes, payload);
        
        const sig = await kms.signTypedDataDigest(domainSeparator, structHash);
        signature = ethers.utils.joinSignature({ r: sig.r, s: sig.s, v: sig.v });
    } else {
        signature = await wallet._signTypedData(domain, AttestationTypes, payload);
    }

    let txHash = null;
    if (SUBMIT_ONCHAIN) {
      // submit to chain
      // If using KMS, we need a wallet to send the TX (the operator wallet), not the attestor key itself (which is in KMS)
      // The wallet sending the TX doesn't need to be the attestor, it just pays gas.
      // But verifyAttestation is public? Yes.
      
      const operatorWallet = wallet || new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY || process.env.ATTESTOR_PRIVATE_KEY, provider);
      const attestor = new ethers.Contract(verifyingContract, ATTESTOR_ABI, operatorWallet);
      const tx = await attestor.verifyAttestation(orderId, payload.amount, recipient, timestamp, nonce, signature);
      const rcpt = await tx.wait();
      txHash = rcpt.transactionHash;
    }

    return res.json({ ok: true, payload, signature, txHash });
  } catch (err) {
    console.error("createOrder err", err);
    return res.status(500).json({ ok: false, error: err.toString() });
  }
});

app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, () => {
  console.log(`Attestor adapter running on port ${PORT}. SUBMIT_ONCHAIN=${SUBMIT_ONCHAIN}, verifyingContract=${verifyingContract}`);
});

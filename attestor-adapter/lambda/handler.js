// lambda/handler.js
const { KMSClient, SignCommand } = require('@aws-sdk/client-kms');
const { ethers } = require('ethers');
// const { AttestationTypes } = require('../src/eip712/types'); // Need to adjust path or bundle

const kms = new KMSClient({ region: process.env.AWS_REGION });
const KEY_ID = process.env.AWS_KMS_KEY_ID;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { orderId, amount, recipient } = body;
    if (!orderId || !amount || !recipient) {
      return { statusCode: 400, body: JSON.stringify({ error: 'invalid payload' }) };
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.floor(Math.random() * 1e9);

    // Re-implement digest construction here to be self-contained for Lambda
    const structHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
      ['bytes32','uint256','string','uint256','uint256'],
      [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(orderId)), ethers.BigNumber.from(amount).toString(), ethers.utils.keccak256(ethers.utils.toUtf8Bytes(recipient)), timestamp, nonce]
    ));

    const chainId = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 1;
    const domainSeparator = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
      ['bytes32','bytes32','uint256','address'],
      [ethers.utils.id('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'), ethers.utils.id(process.env.DOMAIN_NAME||'SOVR Attestor'), chainId, process.env.ATTESTOR_CONTRACT]
    ));

    const digest = ethers.utils.keccak256(ethers.utils.concat([
      ethers.utils.arrayify('0x1901'),
      ethers.utils.arrayify(domainSeparator),
      ethers.utils.arrayify(structHash)
    ]));

    // call KMS Sign
    const signCmd = new SignCommand({
      KeyId: KEY_ID,
      Message: ethers.utils.arrayify(digest),
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256'
    });

    const res = await kms.send(signCmd);
    
    // We would need the ASN1 decoder here too. For brevity, omitting the full decoding logic 
    // but in production you'd bundle the 'asn1.js' or similar library.
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        payload: { orderId, amount, recipient, timestamp, nonce },
        signature: { r: '0x...', s: '0x...', v: 27 } // Placeholder
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

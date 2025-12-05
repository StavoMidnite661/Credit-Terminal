// rotation/rotate_attestors.js
require('dotenv').config();
const { ethers } = require('ethers');

const RPC = process.env.RPC || 'http://127.0.0.1:8545';
const provider = new ethers.providers.JsonRpcProvider(RPC);
const adminWallet = new ethers.Wallet(process.env.ROTATION_ADMIN_KEY, provider);
const attestorContractAddr = process.env.ATTESTOR_CONTRACT;
const AttestorABI = [
  "function addAttestor(address) external",
  "function removeAttestor(address) external",
  "function hasRole(bytes32,address) view returns (bool)"
];

const attestor = new ethers.Contract(attestorContractAddr, AttestorABI, adminWallet);

async function rotate(oldAddr, newAddr) {
  if (oldAddr) {
    console.log('Removing old attestor', oldAddr);
    const tx1 = await attestor.removeAttestor(oldAddr);
    await tx1.wait();
    console.log('Removed');
  }
  if (newAddr) {
    console.log('Adding new attestor', newAddr);
    const tx2 = await attestor.addAttestor(newAddr);
    await tx2.wait();
    console.log('Added');
  }
}

(async () => {
  try {
    const old = process.argv[2] || process.env.OLD_ATTESTOR_ADDRESS;
    const nw = process.argv[3] || process.env.NEW_ATTESTOR_ADDRESS;
    await rotate(old, nw);
    console.log('Rotation complete');
  } catch (err) {
    console.error(err);
  }
})();

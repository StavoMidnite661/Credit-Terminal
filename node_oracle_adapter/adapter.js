import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const oracleAbi = [
  "function postAttestation(bytes32 eventId, uint256 value, bytes sig) external"
];

async function run() {
  const oracle = new ethers.Contract(process.env.ORACLE, oracleAbi, wallet);
  const eventId = ethers.id("peg:update");
  const value = 100000000; // example
  const message = ethers.solidityPackedKeccak256(["bytes32","uint256"], [eventId,value]);
  const sig = await wallet.signMessage(ethers.getBytes(message));

  const tx = await oracle.postAttestation(eventId, value, sig);
  console.log("submitted:", tx.hash);
}

run();

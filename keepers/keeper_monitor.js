// keepers/keeper_monitor.js
// Keeper bot: monitors ReserveManager collateralization and emits actions
import dotenv from "dotenv";
import { ethers } from "ethers";
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC || "http://127.0.0.1:8545");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || ethers.Wallet.createRandom().privateKey, provider);

const reserveAbi = [
  "function collateralizationBps() view returns (uint256)",
  "function collateralValue() view returns (uint256)"
];

async function main() {
  const reserveAddress = process.env.RESERVE_MANAGER_ADDRESS;
  if (!reserveAddress) {
      console.error("RESERVE_MANAGER_ADDRESS env var not set");
      return;
  }
  const reserve = new ethers.Contract(reserveAddress, reserveAbi, provider);
  console.log("Keeper running - watching CR and collateral at", reserveAddress);

  setInterval(async () => {
    try {
      const cr = await reserve.collateralizationBps();
      const coll = await reserve.collateralValue();
      const crNum = Number(cr.toString());
      console.log(new Date().toISOString(), "CR bps:", crNum, "Collateral:", coll.toString());
      if (crNum < 11500) {
        console.warn("⚠️ CR below 115% -> alert multisig / pause mints");
        // Here you could call a multisig API, open a governance proposal, or call a Pause function if exposed.
      }
    } catch (err) {
      console.error("Keeper error:", err);
    }
  }, 5000);
}

main();

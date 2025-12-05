const { ethers } = require("hardhat");

async function main() {
    console.log("Starting Add Liquidity Flow Test...");

    // Addresses from previous deployment output
    const ROUTER_ADDR = "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82";
    const SOVR_ADDR = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
    const USDC_ADDR = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";

    const [deployer, user] = await ethers.getSigners();
    console.log("Testing with user:", user.address);

    // 1. Get Contracts
    const router = await ethers.getContractAt("SOVRHybridRouter", ROUTER_ADDR);
    const sovr = await ethers.getContractAt("TestERC20Decimals", SOVR_ADDR);
    const usdc = await ethers.getContractAt("TestERC20Decimals", USDC_ADDR);

    // 2. Fund User
    const amountSOVR = ethers.utils.parseUnits("1000", 18);
    const amountUSDC = ethers.utils.parseUnits("1000", 6);

    console.log("Funding user from deployer...");
    await (await sovr.connect(deployer).transfer(user.address, amountSOVR)).wait();
    await (await usdc.connect(deployer).transfer(user.address, amountUSDC)).wait();
    console.log("User funded.");

    // 3. Approve Router
    console.log("Approving Router...");
    await (await sovr.connect(user).approve(ROUTER_ADDR, amountSOVR)).wait();
    await (await usdc.connect(user).approve(ROUTER_ADDR, amountUSDC)).wait();
    console.log("Router approved.");

    // 4. Add Liquidity
    console.log("Calling addLiquidity...");
    const tx = await router.connect(user).addLiquidity(amountSOVR, amountUSDC);
    const receipt = await tx.wait();

    // 5. Verify Event
    const event = receipt.events.find(e => e.event === "LiquidityAdded");
    if (event) {
        console.log("SUCCESS: LiquidityAdded event found!");
        // console.log("Event Args:", event.args); 
        console.log("Liquidity Added Successfully.");
    } else {
        console.error("FAILURE: LiquidityAdded event NOT found.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

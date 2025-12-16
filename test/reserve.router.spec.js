const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReserveManager: Router minting", function () {
  let deployer, routerAddr, user;
  let sFiat, usdc, reserve;

  beforeEach(async function () {
    [deployer, routerAddr, user] = await ethers.getSigners();
    // console.log("   Deployer:", deployer.address);

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    
    // Deploy USDC (6 decimals, 1B supply to deployer)
    const initialUSDC = ethers.utils.parseUnits("1000000000", 6);
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6, initialUSDC);
    await usdc.deployed();

    // Deploy sFIAT (18 decimals, 0 initial supply)
    // CRITICAL: Must be 0 so ReserveManager starts with 0 liability.
    sFiat = await MockERC20.deploy("sFIAT", "sFIAT", 18, 0);
    await sFiat.deployed();

    // Deploy ReserveManager
    const ReserveManager = await ethers.getContractFactory("ReserveManager");
    reserve = await ReserveManager.deploy(usdc.address, sFiat.address);
    await reserve.deployed();

    const collateralAmount = ethers.utils.parseUnits("10000", 6);
    await usdc.transfer(reserve.address, collateralAmount);
  });

  async function expectRevert(promise, expectedError) {
      try {
          await promise;
          expect.fail("Expected transaction to revert");
      } catch (error) {
          if (!error.message.includes(expectedError)) {
               throw new Error(`Expected revert with '${expectedError}', but got '${error.message}'`);
          }
      }
  }

  it("should allow only router to mint via mintSFFromRouter", async function () {
    // 1. Trying without setting router should fail
    await expectRevert(
        reserve.connect(routerAddr).mintSFFromRouter(user.address, ethers.utils.parseUnits("100", 18)),
        "ReserveManager: only router"
    );

    // 2. Set router (using deployer)
    const tx = await reserve.connect(deployer).setRouter(routerAddr.address);
    await tx.wait();

    expect(await reserve.router()).to.equal(routerAddr.address);

    // 3. Mint specific amount: 5000 sFIAT
    const mintAmount = ethers.utils.parseUnits("5000", 18);
    
    const mintTx = await reserve.connect(routerAddr).mintSFFromRouter(user.address, mintAmount);
    await mintTx.wait();

    expect((await sFiat.balanceOf(user.address)).toString()).to.equal(mintAmount.toString());
  });

  it("should revert if mint drops CR below target", async function () {
    await reserve.connect(deployer).setRouter(routerAddr.address);

    // Collateral: 10,000 USDC
    // Max mint for 120% CR: 10,000 / 1.2 = 8,333 sFIAT
    // mint 9,000 sFIAT -> CR 111%
    const badAmount = ethers.utils.parseUnits("9000", 18);

    await expectRevert(
        reserve.connect(routerAddr).mintSFFromRouter(user.address, badAmount),
        "CR under target"
    );
  });

  it("should allow owner to set router", async function () {
      await expectRevert(
          reserve.connect(user).setRouter(user.address),
          "Ownable: caller is not the owner"
      );
      
      await reserve.connect(deployer).setRouter(routerAddr.address);
      expect(await reserve.router()).to.equal(routerAddr.address);
  });
});

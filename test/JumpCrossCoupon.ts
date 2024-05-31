import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";

describe("JumpCrossCoupon Test", function () {
  async function deploy() {
    const provider = hre.ethers.provider;
    const [owner] = await hre.ethers.getSigners();

    const JCC = await hre.ethers.getContractFactory("JumpCrossCoupon");
    const jcc = await JCC.deploy();

    return { provider, jcc, owner };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { jcc, owner } = await loadFixture(deploy);

      expect(await jcc.owner()).to.equal(owner.address);
    });

    it("Should set the right EXCHANGE_RATE", async function () {
      const { jcc } = await loadFixture(deploy);

      expect(await jcc.EXCHANGE_RATE()).to.equal(ethers.parseEther("0.0014"));
    });

    it("Should set the right PROTOCOL_FEE_UPPER_LIMIT", async function () {
      const { jcc } = await loadFixture(deploy);

      expect(await jcc.PROTOCOL_FEE_UPPER_LIMIT()).to.equal(ethers.parseEther("0.01"));
    });

    it("Should set the right protocol fee parameters", async function () {
      const { jcc } = await loadFixture(deploy);

      expect(await jcc.protocolFeeFactor()).to.equal(BigInt(8));
      expect(await jcc.protocolFeeScale()).to.equal(BigInt(10 ** 3));
      expect(await jcc.protocolExitMultiplier()).to.equal(BigInt(2));  
    });
  });

  describe("Swap", function () {
    it ("Case: Pawn failed: Invalid amount", async function () {
      const { jcc } = await loadFixture(deploy);

      await expect(jcc.pawn(BigInt(0))).to.be.revertedWithCustomError(jcc, "InvalidExchangeAmountError");
    });

    it ("Case: Pawn failed: Insufficient funds", async function () {
      const { jcc } = await loadFixture(deploy);

      // the eth amount should be more than 0.007056 eth (0.007 for swapping 5 $JCC + 0.8% for protocol fee)
      await expect(jcc.pawn(BigInt(5), {value: ethers.parseEther("0.007055")})).to.be.revertedWithCustomError(
        jcc, "InsufficientFundsError");
    });

    it ("Case: Pawn successfully", async function () {
      const { provider, jcc, owner } = await loadFixture(deploy);

      // the eth amount should be more than 0.007056 eth (0.007 for swapping 5 $JCC + 0.8% for protocol fee)
      await expect(jcc.pawn(BigInt(5), {value: ethers.parseEther("0.007056")})).to.not.be.reverted;
      expect(await jcc.balanceOf(owner.address)).to.be.equal(BigInt(5));
      expect(await provider.getBalance(jcc)).to.be.equal(ethers.parseEther("0.007056"));
      expect(await jcc.getProtocolRevenue()).to.be.equal(ethers.parseEther("0.000056"));
    });

    it ("Case: Pawn successfully: upper limit protocol fee", async function () {
      const { provider, jcc, owner } = await loadFixture(deploy);

      // if the eth amount >= 893, the protocol fee should be 0.01 eth
      // the total eth amount won't be 1.2602016 (1.2502 for swapping 893 $JCC + (0.0100016) 0.8% for protocol fee)
      // it will be 1.2602 (1.2502 + 0.01) since the protocol fee upper limit is 0.01
      await expect(jcc.pawn(BigInt(893), {value: ethers.parseEther("1.2602")})).to.not.be.reverted;
      expect(await jcc.balanceOf(owner.address)).to.be.equal(BigInt(893));
      expect(await provider.getBalance(jcc)).to.be.equal(ethers.parseEther("1.2602"));
      expect(await jcc.getProtocolRevenue()).to.be.equal(ethers.parseEther("0.01"));
    });

    it ("Case: Redeem failed: Invalid amount", async function () {
      const { provider, jcc, owner } = await loadFixture(deploy);
    });

    it ("Case: Redeem failed: Insufficient balance", async function () {
      const { provider, jcc, owner } = await loadFixture(deploy);
    });

    it ("Case: Redeem failed: Insufficient funds(protocol fee only)", async function () {
      const { provider, jcc, owner } = await loadFixture(deploy);
    });

    it ("Case: Redeem successfully", async function () {
      const { provider, jcc, owner } = await loadFixture(deploy);
    });
  });

  describe("UpdateFee", function () {

  });

  describe("Revenue", function () {
    // Check and claim
  });

  describe("Integration test", function () {

  });
});

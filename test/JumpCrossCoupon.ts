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
    it("State: Should set the right owner", async function () {
      const { jcc, owner } = await loadFixture(deploy);

      expect(await jcc.owner()).to.equal(owner.address);
    });

    it("State: Should set the right EXCHANGE_RATE", async function () {
      const { jcc } = await loadFixture(deploy);

      expect(await jcc.EXCHANGE_RATE()).to.equal(ethers.parseEther("0.000014"));
    });

    it("State: Should set the right PROTOCOL_FEE_UPPER_LIMIT", async function () {
      const { jcc } = await loadFixture(deploy);

      expect(await jcc.PROTOCOL_FEE_UPPER_LIMIT()).to.equal(ethers.parseEther("0.01"));
    });

    it("State: Should set the right protocol fee parameters", async function () {
      const { jcc } = await loadFixture(deploy);

      expect(await jcc.protocolFeeFactor()).to.equal(BigInt(8));
      expect(await jcc.protocolFeeScale()).to.equal(BigInt(10 ** 3));
      expect(await jcc.protocolExitMultiplier()).to.equal(BigInt(2));  
    });

    it("State: Should get the right erc20 token decimals", async function () {
      const { jcc } = await loadFixture(deploy);

      expect(await jcc.decimals()).to.equal(BigInt(0));
    });
  });

  describe("Swap", function () {
    it ("Case: Pawn failed: Invalid amount", async function () {
      const { jcc } = await loadFixture(deploy);

      await expect(jcc.pawn(BigInt(0))).to.be
      .revertedWithCustomError(jcc, "InvalidExchangeAmountError")
      .withArgs(BigInt(0));
    });

    it ("Case: Pawn failed: Insufficient funds", async function () {
      const { jcc } = await loadFixture(deploy);

      // the eth amount should be more than 0.00007056 eth (0.00007 for swapping 5 $JCC + 0.8% for protocol fee)
      await expect(jcc.pawn(BigInt(5), {value: ethers.parseEther("0.00007055")})).to.be
      .revertedWithCustomError(jcc, "InsufficientFundsError")
      .withArgs(ethers.parseEther("0.00007056"), ethers.parseEther("0.00007055"));
    });

    it ("Case: Pawn successfully", async function () {
      const { provider, jcc, owner } = await loadFixture(deploy);

      // the eth amount should be more than 0.00007056 eth (0.00007 for swapping 5 $JCC + 0.8% for protocol fee)
      await expect(jcc.pawn(BigInt(5), {value: ethers.parseEther("0.00007056")})).to.not.be.reverted;
      expect(await jcc.balanceOf(owner.address)).to.be.equal(BigInt(5));
      expect(await provider.getBalance(jcc)).to.be.equal(ethers.parseEther("0.00007056"));
      expect(await jcc.protocolRevenue()).to.be.equal(ethers.parseEther("0.00000056"));
    });

    it ("Case: Pawn successfully: upper limit protocol fee", async function () {
      const { provider, jcc, owner } = await loadFixture(deploy);

      // if the amount >= 89286, the protocol fee should be 0.01 eth
      // the total eth amount won't be 1.260004032 (1.250004 for swapping 89286 $JCC + (0.010000032) 0.8% for protocol fee)
      // it will be 1.260004 (1.250004 + 0.01) since the protocol fee upper limit is 0.01
      await expect(jcc.pawn(BigInt(89286), {value: ethers.parseEther("1.260004")})).to.not.be.reverted;
      expect(await jcc.balanceOf(owner.address)).to.be.equal(BigInt(89286));
      expect(await provider.getBalance(jcc)).to.be.equal(ethers.parseEther("1.260004"));
      expect(await jcc.protocolRevenue()).to.be.equal(ethers.parseEther("0.01"));
    });

    it ("Case: Redeem failed: Invalid amount", async function () {
      const { jcc } = await loadFixture(deploy);

      await expect(jcc.redeem(BigInt(0))).to.be
      .revertedWithCustomError(jcc, "InvalidExchangeAmountError")
      .withArgs(BigInt(0));
    });

    it ("Case: Redeem failed: Insufficient balance", async function () {
      const { jcc, owner } = await loadFixture(deploy);

      await expect(jcc.redeem(BigInt(4))).to.be
      .revertedWithCustomError(jcc, "ERC20InsufficientBalance")
      .withArgs(owner.address, BigInt(0),BigInt(4));
    });

    it ("Case: Redeem successfully", async function () {
      const { provider, jcc, owner } = await loadFixture(deploy);

      // normal case
      await jcc.pawn(BigInt(10), {value: ethers.parseEther("0.00014112")})
      await expect(jcc.redeem(BigInt(10))).to.be.not.reverted;

      expect(await jcc.balanceOf(owner.address)).to.be.equal(BigInt(0));

      // fee = pawn + redeem
      let expectProtocolRevenue = ethers.parseEther("0.00000112") + ethers.parseEther("0.00000224")
      expect(await jcc.protocolRevenue()).to.be.equal(expectProtocolRevenue);
      expect(await provider.getBalance(jcc)).to.be.equal(expectProtocolRevenue);
    
    
      // big amount case with upper limit protocol fee
      await jcc.pawn(BigInt(89286), {value: ethers.parseEther("1.260004")})
      await expect(jcc.redeem(BigInt(89286))).to.be.not.reverted;
      expect(await jcc.balanceOf(owner.address)).to.be.equal(BigInt(0));

      // fee = pawn + redeem(upper limit)
      expectProtocolRevenue = expectProtocolRevenue + ethers.parseEther("0.01") + ethers.parseEther("0.02")
      expect(await jcc.protocolRevenue()).to.be.equal(expectProtocolRevenue);
      expect(await provider.getBalance(jcc)).to.be.equal(expectProtocolRevenue);
    });
  });

  describe("UpdateFee", function () {
    it ("Case: UpdateFee failed: Invalid fee factor", async function () {
      const { jcc } = await loadFixture(deploy);

      await expect(jcc.updateProtocolFee(BigInt(0), BigInt(2), BigInt(2))).to.be.revertedWithCustomError(
        jcc, "SetProtocolFeeError"
      ).withArgs("Invalid protocol fee factor");

      await expect(jcc.updateProtocolFee(BigInt(10), BigInt(2), BigInt(2))).to.be.revertedWithCustomError(
        jcc, "SetProtocolFeeError"
      ).withArgs("Invalid protocol fee factor");
    });

    it ("Case: UpdateFee failed: Invalid fee decimals", async function () {
      const { jcc } = await loadFixture(deploy);

      await expect(jcc.updateProtocolFee(BigInt(1), BigInt(1), BigInt(2))).to.be.revertedWithCustomError(
        jcc, "SetProtocolFeeError"
      ).withArgs("Invalid protocol fee decimals");

      await expect(jcc.updateProtocolFee(BigInt(1), BigInt(19), BigInt(2))).to.be.revertedWithCustomError(
        jcc, "SetProtocolFeeError"
      ).withArgs("Invalid protocol fee decimals");
    });
    
    it ("Case: UpdateFee failed: Invalid exit multiplier", async function () {
      const { jcc } = await loadFixture(deploy);

      await expect(jcc.updateProtocolFee(BigInt(1), BigInt(2), BigInt(0))).to.be.revertedWithCustomError(
        jcc, "SetProtocolFeeError"
      ).withArgs("Invalid protocol exit multiplier");

      await expect(jcc.updateProtocolFee(BigInt(1), BigInt(18), BigInt(6))).to.be.revertedWithCustomError(
        jcc, "SetProtocolFeeError"
      ).withArgs("Invalid protocol exit multiplier");
    });

    it ("Case: UpdateFee successfully", async function () {
      const { jcc } = await loadFixture(deploy);

      await expect(jcc.updateProtocolFee(BigInt(8), BigInt(2), BigInt(3)))
      .to
      .emit(jcc, "UpdateProtocolFee")
      .withArgs(BigInt(8), BigInt(2), BigInt(3));
      expect(await jcc.protocolFeeFactor()).to.be.equal(BigInt(8));
      expect(await jcc.protocolFeeScale()).to.be.equal(BigInt(10 ** 2));
      expect(await jcc.protocolExitMultiplier()).to.be.equal(BigInt(3));
    });
  });

  describe("Revenue", async function () {
    it ("Case: Initial revenue should be 0", async function () {
      const { jcc } = await loadFixture(deploy);
      expect(await jcc.protocolRevenue()).to.be.equal(BigInt(0));
    });

    it ("Case: Check and claim successfully", async function () {
      const { owner, provider, jcc } = await loadFixture(deploy);
      
      // simulate pay protocol fee for pawn 100 $JCC and redeem 10 $JCC
      await jcc.pawn(BigInt(100), {value: ethers.parseEther("0.0014112")})
      let expectProtocolRevenue = ethers.parseEther("0.0000112")
      expect(await provider.getBalance(jcc)).to.be.equal(ethers.parseEther("0.0014112"));
      expect(await jcc.protocolRevenue()).to.be.equal(expectProtocolRevenue);

      await expect(jcc.redeem(BigInt(10))).to.be.not.reverted;
      // fee = pawn + redeem
      expectProtocolRevenue += ethers.parseEther("0.00000224")
      expect(await jcc.balanceOf(owner.address)).to.be.equal(BigInt(90));
      expect(await jcc.protocolRevenue()).to.be.equal(expectProtocolRevenue);

      // the eth balance here will be `protocol revenue` + `$ETH equivalent to $90 JCC`
      expect(await provider.getBalance(jcc)).to.be
      .equal(expectProtocolRevenue + BigInt(90) * ethers.parseEther("0.000014"));
      
      // claim
          
      let balanceBefore = await provider.getBalance(owner.address);
      const tx = await jcc.claimRevenue();
      const receipt = await tx.wait();
      expect(receipt).to.be.not.null;
      const gasUsed = receipt!.gasUsed;
      const gasCost = gasUsed * receipt!.gasPrice;

      let balanceAfter = await provider.getBalance(owner.address);

      expect(balanceBefore + expectProtocolRevenue - gasCost).to.be.equal(balanceAfter);

      expect(await jcc.protocolRevenue()).to.be.equal(BigInt(0));
      
      expect(await provider.getBalance(jcc)).to.be.equal(BigInt(90) * ethers.parseEther("0.000014"));
    });
  });

  describe("Integration test", async function () {

  });
});

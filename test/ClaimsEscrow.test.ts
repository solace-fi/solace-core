import chai from "chai";
import { waffle, upgrades, ethers} from "hardhat";
import { BigNumber as BN, constants } from "ethers";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Registry, Vault, ClaimsEscrow, Weth9, PolicyManager } from "../typechain";


describe("ClaimsEscrow", function () {
  let vault: Vault;
  let weth: Weth9;
  let registry: Registry;
  let claimsEscrow: ClaimsEscrow;
  let policyManager: PolicyManager;
  let artifacts: ArtifactImports;

  const [owner, newOwner, depositor1, claimant, mockProduct] = provider.getWallets();
  const testDepositAmount = BN.from("10");
  const testClaimAmount = BN.from("8");
  const testClaimAmount2 = BN.from("6");
  const testClaimAmount3 = BN.from("20");
  const claimID = BN.from("1");
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const COOLDOWN_PERIOD = 3600; // one hour

  before(async function () {
    artifacts = await import_artifacts();
    // forking uses old timestamp, need to force update
    const timestamp = Math.floor(Date.now()/1000);
    await provider.send("evm_setNextBlockTimestamp", [timestamp]);
    await provider.send("evm_mine", []);
  })

  beforeEach(async () => {
    weth = (await deployContract(
      owner,
      artifacts.WETH
    )) as Weth9;

    // deploy registry contract
    registry = (await deployContract(owner, artifacts.Registry, [owner.address])) as Registry;

    claimsEscrow = (await deployContract(
      owner,
      artifacts.ClaimsEscrow,
      [owner.address, registry.address]
    )) as ClaimsEscrow;

    // deploy vault
    vault = (await deployContract(
      owner,
      artifacts.Vault,
      [
        owner.address,
        registry.address,
        weth.address
      ]
    )) as Vault;

    // deploy policy manager
    policyManager = (await deployContract(
      owner,
      artifacts.PolicyManager,
      [
        owner.address
      ]
    )) as PolicyManager;

    await registry.setVault(vault.address);
    await registry.setClaimsEscrow(claimsEscrow.address);
    await registry.setPolicyManager(policyManager.address);
    await policyManager.addProduct(mockProduct.address);
    await vault.setRequestor(claimsEscrow.address, true);
  });

  describe("deployment", function () {
    it("should set the governance address", async function () {
      expect(await claimsEscrow.governance()).to.equal(owner.address);
    });
  });

  describe("setGovernance", function () {
    it("should allow governance to set new governance address", async function () {
      expect(await claimsEscrow.governance()).to.equal(owner.address);
      await claimsEscrow.connect(owner).setGovernance(newOwner.address);
      expect(await claimsEscrow.governance()).to.equal(owner.address);
      expect(await claimsEscrow.newGovernance()).to.equal(newOwner.address);
      let tx = await claimsEscrow.connect(newOwner).acceptGovernance();
      await expect(tx).to.emit(claimsEscrow, "GovernanceTransferred").withArgs(newOwner.address);
      expect(await claimsEscrow.governance()).to.equal(newOwner.address);
      expect(await claimsEscrow.newGovernance()).to.equal(ZERO_ADDRESS);
    });
    it("should revert if not called by governance", async function () {
      await expect(claimsEscrow.connect(depositor1).setGovernance(depositor1.address)).to.be.revertedWith("!governance");
      await claimsEscrow.connect(owner).setGovernance(newOwner.address);
      await expect(claimsEscrow.connect(depositor1).acceptGovernance()).to.be.revertedWith("!governance");
    });
  });

  describe("receiveClaim", function () {
    beforeEach("deposit", async function () {
      await vault.connect(depositor1).depositEth({ value: testDepositAmount});
    });
    it("should revert if not called by the vault", async function () {
      await expect(claimsEscrow.connect(owner).receiveClaim(1, owner.address, 0)).to.be.revertedWith("!product");
    });
    it("should create a Claim object with the right data", async function () {
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(0);
      await claimsEscrow.connect(mockProduct).receiveClaim(claimID, claimant.address, testClaimAmount);
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(testClaimAmount);
      const callClaimant = await claimsEscrow.ownerOf(claimID);
      expect(callClaimant).to.equal(claimant.address);
      const timestamp = BN.from(Math.floor(Date.now()/1000));
      const claim1 = await claimsEscrow.claim(claimID);
      expect(claim1.amount).to.equal(testClaimAmount);
      expect(claim1.receivedAt).to.be.closeTo(timestamp, 900);
      const claim2 = await claimsEscrow.getClaim(claimID);
      expect(claim2.amount).to.equal(testClaimAmount);
      expect(claim2.receivedAt).to.be.closeTo(timestamp, 900);
    });
  });

  describe("withdrawClaimsPayout", function () {
    beforeEach("deposit to vault and approve claim", async function () {
      await vault.connect(depositor1).depositEth({ value: testDepositAmount});
      await claimsEscrow.connect(mockProduct).receiveClaim(claimID, claimant.address, testClaimAmount);
    });
    it("should revert if invalid claimID", async function () {
      await expect(claimsEscrow.connect(owner).withdrawClaimsPayout(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("should revert if not called by the claimant", async function () {
      await expect(claimsEscrow.connect(owner).withdrawClaimsPayout(claimID)).to.be.revertedWith("!claimant");
    });
    it("should revert if cooldown period has not elapsed", async function () {
      await expect(claimsEscrow.connect(claimant).withdrawClaimsPayout(claimID)).to.be.revertedWith("cooldown period has not elapsed");
    });
    it("should transfer claim amount to claimant", async function () {
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
      let bal1 = await claimant.getBalance();
      let tx = await claimsEscrow.connect(claimant).withdrawClaimsPayout(claimID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await claimant.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(testClaimAmount);
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(0);
    });
    it("should emit ClaimWithdrawn event after function logic is successful", async function () {
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
      expect(await claimsEscrow.connect(claimant).withdrawClaimsPayout(claimID)).to.emit(claimsEscrow, "ClaimWithdrawn").withArgs(claimID, claimant.address, testClaimAmount);
    });
    it("should delete the Claim object after successful withdrawal", async function () {
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
      await claimsEscrow.connect(claimant).withdrawClaimsPayout(claimID);
      expect(await claimsEscrow.exists(claimID)).to.be.false;
      await expect(claimsEscrow.ownerOf(claimID)).to.be.reverted;
      await expect(claimsEscrow.claim(claimID)).to.be.reverted;
      await expect(claimsEscrow.getClaim(claimID)).to.be.reverted;
    });
    it("should request more eth if needed", async function () { // and partial payout
      let claimID2 = 2;
      let balance1 = await claimant.getBalance();
      await claimsEscrow.connect(mockProduct).receiveClaim(claimID2, claimant.address, testClaimAmount3);
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(testClaimAmount.add(testClaimAmount3));
      await vault.connect(depositor1).depositEth({ value: 4 });
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
      let tx1 = await claimsEscrow.connect(claimant).withdrawClaimsPayout(claimID2);
      let receipt1 = await tx1.wait();
      let gasCost1 = receipt1.gasUsed.mul(receipt1.effectiveGasPrice);
      let balance2 = await claimant.getBalance();
      expect(balance2.sub(balance1).add(gasCost1)).to.equal(testDepositAmount.add(4));
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(testClaimAmount.add(testClaimAmount3).sub(testDepositAmount.add(4)));
      expect(await claimsEscrow.exists(claimID2)).to.be.true;
      await vault.connect(depositor1).depositEth({ value: 10 });
      let tx2 = await claimsEscrow.connect(claimant).withdrawClaimsPayout(claimID2);
      let receipt2 = await tx2.wait();
      let gasCost2 = receipt2.gasUsed.mul(receipt2.effectiveGasPrice);
      let balance3 = await claimant.getBalance();
      expect(balance3.sub(balance1).add(gasCost1).add(gasCost2)).to.equal(testClaimAmount3);
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(testClaimAmount);
      expect(await claimsEscrow.exists(claimID2)).to.be.false;
    })
  });

  describe("adjustClaim", function () {
    beforeEach("deposit to vault and approve claim", async function () {
      await vault.connect(depositor1).depositEth({ value: testDepositAmount});
      await claimsEscrow.connect(mockProduct).receiveClaim(3, claimant.address, 3);
      await claimsEscrow.connect(mockProduct).receiveClaim(1, claimant.address, testClaimAmount);
    });
    it("should revert if not called by governance", async function () {
      await expect(claimsEscrow.connect(claimant).adjustClaim(claimID, testClaimAmount2)).to.be.revertedWith("!governance");
    });
    it("should revert if claim doesnt exist", async function () {
      await expect(claimsEscrow.connect(owner).adjustClaim(999, testClaimAmount2)).to.be.revertedWith("query for nonexistent token");
    });
    it("should update claim object with the right data", async function () {
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(testClaimAmount.add(3));
      await claimsEscrow.connect(owner).adjustClaim(claimID, testClaimAmount2);
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(testClaimAmount2.add(3));
      const callClaimant = await claimsEscrow.ownerOf(claimID);
      const callAmount = (await claimsEscrow.claim(claimID)).amount;
      expect(callClaimant).to.equal(claimant.address);
      expect(callAmount).to.equal(testClaimAmount2);
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
      let bal1 = await claimant.getBalance();
      let tx = await claimsEscrow.connect(claimant).withdrawClaimsPayout(claimID);
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      let bal2 = await claimant.getBalance();
      expect(bal2.sub(bal1).add(gasCost)).to.equal(testClaimAmount2);
    });
  });

  describe("sweep", function () {
    it("should revert if not called by governance", async function () {
      await expect(claimsEscrow.connect(claimant).sweep(weth.address, 0, claimant.address)).to.be.revertedWith("!governance");
    });
    it("should sweep eth", async function () {
      let escrowBalance1 = await provider.getBalance(claimsEscrow.address);
      let userBalance1 = await claimant.getBalance();
      await owner.sendTransaction({
        to: claimsEscrow.address,
        value: 100,
        data: "0xabcd"
      });
      await claimsEscrow.connect(owner).sweep(ETH_ADDRESS, 20, claimant.address);
      let escrowBalance2 = await provider.getBalance(claimsEscrow.address);
      let userBalance2 = await claimant.getBalance();
      expect(escrowBalance2.sub(escrowBalance1)).to.eq(80);
      expect(userBalance2.sub(userBalance1)).to.eq(20);
    });
    it("should sweep erc20", async function () {
      let escrowBalance1 = await weth.balanceOf(claimsEscrow.address);
      let userBalance1 = await weth.balanceOf(claimant.address);
      await weth.connect(owner).deposit({value: 100});
      await weth.connect(owner).transfer(claimsEscrow.address, 100);
      await claimsEscrow.connect(owner).sweep(weth.address, 20, claimant.address);
      let escrowBalance2 = await weth.balanceOf(claimsEscrow.address);
      let userBalance2 = await weth.balanceOf(claimant.address);
      expect(escrowBalance2.sub(escrowBalance1)).to.eq(80);
      expect(userBalance2.sub(userBalance1)).to.eq(20);
    });
  });

  describe("cooldown", function () {
    it("should start at one hour", async function () {
      expect(await claimsEscrow.cooldownPeriod()).to.equal(COOLDOWN_PERIOD);
    });
    it("should revert setCooldown if called by non governance", async function () {
      await expect(claimsEscrow.connect(depositor1).setCooldownPeriod(1)).to.be.revertedWith("!governance");
    });
    it("should set cooldown", async function () {
      await claimsEscrow.connect(owner).setCooldownPeriod(1);
      expect(await claimsEscrow.cooldownPeriod()).to.equal(1);
    });
  });

  describe("isWithdrawable", function () {
    let claimID = 1;
    beforeEach(async function () {
      await claimsEscrow.connect(mockProduct).receiveClaim(claimID, claimant.address, testClaimAmount);
    });
    it("non existant claim should not be withdrawable", async function () {
      expect(await claimsEscrow.isWithdrawable(999)).to.be.false;
    });
    it("new claim should not be withdrawable", async function () {
      expect(await claimsEscrow.isWithdrawable(claimID)).to.be.false;
    });
    it("claim should become withdrawable", async function () {
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]);
      await owner.sendTransaction({to: claimsEscrow.address});
      expect(await claimsEscrow.isWithdrawable(claimID)).to.be.true;
    });
  });

  describe("timeLeft", function () {
    let claimID = 1;
    beforeEach(async function () {
      await claimsEscrow.connect(mockProduct).receiveClaim(claimID, claimant.address, testClaimAmount);
    });
    it("reverts non existant claim", async function () {
      await expect(claimsEscrow.timeLeft(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("need to wait entire cooldown period for a new claim", async function () {
      expect(await claimsEscrow.timeLeft(claimID)).to.be.closeTo(BN.from(COOLDOWN_PERIOD), 10);
    });
    it("counts down", async function () {
      await provider.send("evm_increaseTime", [1000]);
      await owner.sendTransaction({to: claimsEscrow.address});
      expect(await claimsEscrow.timeLeft(claimID)).to.be.closeTo(BN.from(COOLDOWN_PERIOD-1000), 10);
    });
    it("hits zero", async function () {
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]);
      await owner.sendTransaction({to: claimsEscrow.address});
      expect(await claimsEscrow.timeLeft(claimID)).to.equal(0);
    });
  });

  describe("listClaims", function () {
    it("lists claims", async function () {
      expect(await claimsEscrow.listClaims(claimant.address)).to.deep.equal([]);
      await claimsEscrow.connect(mockProduct).receiveClaim(2, claimant.address, 0);
      expect(await claimsEscrow.listClaims(claimant.address)).to.deep.equal([BN.from(2)]);
      await claimsEscrow.connect(mockProduct).receiveClaim(4, claimant.address, 0);
      expect(await claimsEscrow.listClaims(claimant.address)).to.deep.equal([BN.from(2),BN.from(4)]);
      await claimsEscrow.connect(mockProduct).receiveClaim(6, owner.address, 0);
      expect(await claimsEscrow.listClaims(claimant.address)).to.deep.equal([BN.from(2),BN.from(4)]);
      await claimsEscrow.connect(mockProduct).receiveClaim(8, claimant.address, 0);
      expect(await claimsEscrow.listClaims(claimant.address)).to.deep.equal([BN.from(2),BN.from(4),BN.from(8)]);
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]);
      await claimsEscrow.connect(claimant).withdrawClaimsPayout(4);
      expect(await claimsEscrow.listClaims(claimant.address)).to.deep.equal([BN.from(2),BN.from(8)]);
    });
  });
});

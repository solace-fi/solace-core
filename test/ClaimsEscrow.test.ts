import chai from "chai";
import { waffle, upgrades, ethers} from "hardhat";
import { BigNumber as BN, constants } from "ethers";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Registry, Vault, ClaimsEscrow, Weth9, PolicyManager } from "../typechain";
import { expectClose } from "./utilities/math";


describe("ClaimsEscrow", function () {
  let vault: Vault;
  let weth: Weth9;
  let registry: Registry;
  let claimsEscrow: ClaimsEscrow;
  let policyManager: PolicyManager;
  let artifacts: ArtifactImports;

  const [deployer, governor, newGovernor, depositor, claimant, mockProduct] = provider.getWallets();
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
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    // forking uses old timestamp, need to force update
    await provider.send("evm_mine", []);
    const blockTimestamp = (await provider.getBlock('latest')).timestamp;
    const dateTimestamp = Math.floor(Date.now()/1000);
    const setTimestamp = Math.max(blockTimestamp, dateTimestamp) + 1;
    await provider.send("evm_setNextBlockTimestamp", [setTimestamp]);
    await provider.send("evm_mine", []);
  })

  beforeEach(async function () {
    registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    await registry.connect(governor).setWeth(weth.address);
    vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
    await registry.connect(governor).setVault(vault.address);
    claimsEscrow = (await deployContract(deployer, artifacts.ClaimsEscrow, [governor.address, registry.address])) as ClaimsEscrow;
    await registry.connect(governor).setClaimsEscrow(claimsEscrow.address);
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
    await registry.connect(governor).setPolicyManager(policyManager.address);

    await policyManager.connect(governor).addProduct(mockProduct.address);
    await vault.connect(governor).addRequestor(claimsEscrow.address);
  });

  describe("deployment", function () {
    it("should set the governance address", async function () {
      expect(await claimsEscrow.governance()).to.equal(governor.address);
    });
    it("should revert if registry is zero address", async function () {
      await expect(deployContract(deployer, artifacts.ClaimsEscrow, [governor.address, ZERO_ADDRESS])).to.be.revertedWith("zero address registry");
    });
  });

  describe("setGovernance", function () {
    it("should allow governance to set new governance address", async function () {
      expect(await claimsEscrow.governance()).to.equal(governor.address);
      let tx1 = await claimsEscrow.connect(governor).setGovernance(newGovernor.address);
      expect(tx1).to.emit(claimsEscrow, "GovernancePending").withArgs(newGovernor.address);
      expect(await claimsEscrow.governance()).to.equal(governor.address);
      expect(await claimsEscrow.pendingGovernance()).to.equal(newGovernor.address);
      let tx2 = await claimsEscrow.connect(newGovernor).acceptGovernance();
      await expect(tx2).to.emit(claimsEscrow, "GovernanceTransferred").withArgs(governor.address, newGovernor.address);
      expect(await claimsEscrow.governance()).to.equal(newGovernor.address);
      expect(await claimsEscrow.pendingGovernance()).to.equal(ZERO_ADDRESS);
    });
    it("should revert if not called by governance", async function () {
      await expect(claimsEscrow.connect(depositor).setGovernance(depositor.address)).to.be.revertedWith("!governance");
      await claimsEscrow.connect(governor).setGovernance(newGovernor.address);
      await expect(claimsEscrow.connect(depositor).acceptGovernance()).to.be.revertedWith("!governance");
    });
  });

  describe("receiveClaim", function () {
    beforeEach("deposit", async function () {
      await vault.connect(depositor).depositEth({ value: testDepositAmount});
    });
    it("should revert if not called by the vault", async function () {
      await expect(claimsEscrow.connect(deployer).receiveClaim(1, deployer.address, 0)).to.be.revertedWith("!product");
    });
    it("should revert if zero claimant", async function () {
      await expect(claimsEscrow.connect(mockProduct).receiveClaim(claimID, ZERO_ADDRESS, testClaimAmount)).to.be.revertedWith("zero address");
    });
    it("should create a Claim object with the right data", async function () {
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(0);
      await claimsEscrow.connect(mockProduct).receiveClaim(claimID, claimant.address, testClaimAmount);
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(testClaimAmount);
      const callClaimant = await claimsEscrow.ownerOf(claimID);
      expect(callClaimant).to.equal(claimant.address);
      const timestamp = (await provider.getBlock('latest')).timestamp;
      const claim1 = await claimsEscrow.claim(claimID);
      expect(claim1.amount).to.equal(testClaimAmount);
      expectClose(claim1.receivedAt, timestamp, 900);
      const claim2 = await claimsEscrow.getClaim(claimID);
      expect(claim2.amount).to.equal(testClaimAmount);
      expectClose(claim2.receivedAt, timestamp, 900);
    });
  });

  describe("withdrawClaimsPayout", function () {
    beforeEach("deposit to vault and approve claim", async function () {
      await vault.connect(depositor).depositEth({ value: testDepositAmount});
      await claimsEscrow.connect(mockProduct).receiveClaim(claimID, claimant.address, testClaimAmount);
    });
    it("should revert if invalid claimID", async function () {
      await expect(claimsEscrow.connect(deployer).withdrawClaimsPayout(999)).to.be.revertedWith("query for nonexistent token");
    });
    it("should revert if not called by the claimant", async function () {
      await expect(claimsEscrow.connect(deployer).withdrawClaimsPayout(claimID)).to.be.revertedWith("!claimant");
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
      await vault.connect(depositor).depositEth({ value: 4 });
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
      let tx1 = await claimsEscrow.connect(claimant).withdrawClaimsPayout(claimID2);
      let receipt1 = await tx1.wait();
      let gasCost1 = receipt1.gasUsed.mul(receipt1.effectiveGasPrice);
      let balance2 = await claimant.getBalance();
      expect(balance2.sub(balance1).add(gasCost1)).to.equal(testDepositAmount.add(4));
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(testClaimAmount.add(testClaimAmount3).sub(testDepositAmount.add(4)));
      expect(await claimsEscrow.exists(claimID2)).to.be.true;
      await vault.connect(depositor).depositEth({ value: 10 });
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
      await vault.connect(depositor).depositEth({ value: testDepositAmount});
      await claimsEscrow.connect(mockProduct).receiveClaim(3, claimant.address, 3);
      await claimsEscrow.connect(mockProduct).receiveClaim(1, claimant.address, testClaimAmount);
    });
    it("should revert if not called by governance", async function () {
      await expect(claimsEscrow.connect(claimant).adjustClaim(claimID, testClaimAmount2)).to.be.revertedWith("!governance");
    });
    it("should revert if claim doesnt exist", async function () {
      await expect(claimsEscrow.connect(governor).adjustClaim(999, testClaimAmount2)).to.be.revertedWith("query for nonexistent token");
    });
    it("should update claim object with the right data", async function () {
      expect(await claimsEscrow.totalClaimsOutstanding()).to.equal(testClaimAmount.add(3));
      await claimsEscrow.connect(governor).adjustClaim(claimID, testClaimAmount2);
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

  describe("returnEth", function () {
    it("should revert if not called by governance", async function () {
      await expect(claimsEscrow.connect(claimant).returnEth(0)).to.be.revertedWith("!governance");
    });
    it("should returnEth", async function () {
      let escrowBalance1 = await provider.getBalance(claimsEscrow.address);
      let vaultBalance1 = await vault.totalAssets();
      await deployer.sendTransaction({
        to: claimsEscrow.address,
        value: 100,
        data: "0xabcd"
      });
      await claimsEscrow.connect(governor).returnEth(20);
      let escrowBalance2 = await provider.getBalance(claimsEscrow.address);
      let vaultBalance2 = await vault.totalAssets();
      expect(escrowBalance2.sub(escrowBalance1)).to.eq(80);
      expect(vaultBalance2.sub(vaultBalance1)).to.eq(20);
    });
  });

  describe("cooldown", function () {
    it("should start at one hour", async function () {
      expect(await claimsEscrow.cooldownPeriod()).to.equal(COOLDOWN_PERIOD);
    });
    it("should revert setCooldown if called by non governance", async function () {
      await expect(claimsEscrow.connect(depositor).setCooldownPeriod(1)).to.be.revertedWith("!governance");
    });
    it("should set cooldown", async function () {
      await claimsEscrow.connect(governor).setCooldownPeriod(1);
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
      await deployer.sendTransaction({to: claimsEscrow.address});
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
      await deployer.sendTransaction({to: claimsEscrow.address});
      expect(await claimsEscrow.timeLeft(claimID)).to.be.closeTo(BN.from(COOLDOWN_PERIOD-1000), 10);
    });
    it("hits zero", async function () {
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]);
      await deployer.sendTransaction({to: claimsEscrow.address});
      expect(await claimsEscrow.timeLeft(claimID)).to.equal(0);
    });
  });

  describe("listTokensOfOwner", function () {
    it("lists claims", async function () {
      expect(await claimsEscrow.listTokensOfOwner(claimant.address)).to.deep.equal([]);
      await claimsEscrow.connect(mockProduct).receiveClaim(2, claimant.address, 0);
      expect(await claimsEscrow.listTokensOfOwner(claimant.address)).to.deep.equal([BN.from(2)]);
      await claimsEscrow.connect(mockProduct).receiveClaim(4, claimant.address, 0);
      expect(await claimsEscrow.listTokensOfOwner(claimant.address)).to.deep.equal([BN.from(2),BN.from(4)]);
      await claimsEscrow.connect(mockProduct).receiveClaim(6, deployer.address, 0);
      expect(await claimsEscrow.listTokensOfOwner(claimant.address)).to.deep.equal([BN.from(2),BN.from(4)]);
      await claimsEscrow.connect(mockProduct).receiveClaim(8, claimant.address, 0);
      expect(await claimsEscrow.listTokensOfOwner(claimant.address)).to.deep.equal([BN.from(2),BN.from(4),BN.from(8)]);
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]);
      await claimsEscrow.connect(claimant).withdrawClaimsPayout(4);
      expect(await claimsEscrow.listTokensOfOwner(claimant.address)).to.deep.equal([BN.from(2),BN.from(8)]);
    });
    it("does not list claims for zero address", async function () {
      await expect(claimsEscrow.listTokensOfOwner(ZERO_ADDRESS)).to.be.revertedWith("zero address");
    });
  });

  describe("transfer", async function () {
    beforeEach(async function () {
      await claimsEscrow.connect(mockProduct).receiveClaim(1, claimant.address, 0);
    });
    it("should reject transfer of nonexistent token", async function () {
      await expect(claimsEscrow.connect(claimant).transfer(depositor.address, 99)).to.be.revertedWith("ERC721: operator query for nonexistent token");
    });
    it("should reject transfer by non owner", async function () {
      await expect(claimsEscrow.connect(depositor).transfer(depositor.address, claimID)).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });
    it("should transfer", async function () {
      let bal11 = await claimsEscrow.balanceOf(claimant.address);
      let bal12 = await claimsEscrow.balanceOf(depositor.address);
      let ts1 = await claimsEscrow.totalSupply();
      expect(await claimsEscrow.ownerOf(claimID)).to.equal(claimant.address);
      let tx = await claimsEscrow.connect(claimant).transfer(depositor.address, claimID);
      expect(tx).to.emit(claimsEscrow, "Transfer").withArgs(claimant.address, depositor.address, claimID);
      let bal21 = await claimsEscrow.balanceOf(claimant.address);
      let bal22 = await claimsEscrow.balanceOf(depositor.address);
      let ts2 = await claimsEscrow.totalSupply();
      expect(await claimsEscrow.ownerOf(claimID)).to.equal(depositor.address);
      expect(bal11.sub(bal21)).to.equal(1);
      expect(bal22.sub(bal12)).to.equal(1);
      expect(ts1).to.equal(ts2);
    });
    it("should reject safeTransfer of nonexistent token", async function () {
      await expect(claimsEscrow.connect(claimant).safeTransfer(claimant.address, 99)).to.be.revertedWith("ERC721: operator query for nonexistent token");
    });
    it("should reject safeTransfer by non owner", async function () {
      await expect(claimsEscrow.connect(depositor).safeTransfer(depositor.address, claimID)).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });
    it("should safeTransfer", async function () {
      let bal11 = await claimsEscrow.balanceOf(claimant.address);
      let bal12 = await claimsEscrow.balanceOf(depositor.address);
      let ts1 = await claimsEscrow.totalSupply();
      expect(await claimsEscrow.ownerOf(claimID)).to.equal(claimant.address);
      let tx = await claimsEscrow.connect(claimant).safeTransfer(depositor.address, claimID);
      expect(tx).to.emit(claimsEscrow, "Transfer").withArgs(claimant.address, depositor.address, claimID);
      let bal21 = await claimsEscrow.balanceOf(claimant.address);
      let bal22 = await claimsEscrow.balanceOf(depositor.address);
      let ts2 = await claimsEscrow.totalSupply();
      expect(await claimsEscrow.ownerOf(claimID)).to.equal(depositor.address);
      expect(bal11.sub(bal21)).to.equal(1);
      expect(bal22.sub(bal12)).to.equal(1);
      expect(ts1).to.equal(ts2);
    });
  });
});

import chai from "chai";
import { waffle } from "hardhat";
import { BigNumber as BN } from "ethers";
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
  const claimId = BN.from("1");
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const COOLDOWN_PERIOD = 1209600; // 14 days

  before(async function () {
    artifacts = await import_artifacts();
  })

  beforeEach(async () => {
    weth = (await deployContract(
      owner,
      artifacts.WETH
    )) as Weth9;

    registry = (await deployContract(
      owner,
      artifacts.Registry,
      [owner.address]
    )) as Registry;

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
      await vault.connect(depositor1).deposit({ value: testDepositAmount});
    });
    it("should revert if not called by the vault", async function () {
      await expect(claimsEscrow.connect(owner).receiveClaim(owner.address)).to.be.revertedWith("!vault");
    });
    it("should update create a Claim object with the right data", async function () {
      await vault.connect(mockProduct).processClaim(claimant.address, testClaimAmount);
      const callClaimant = (await claimsEscrow.claims(claimId)).claimant;
      const callAmount = (await claimsEscrow.claims(claimId)).amount;
      expect(callClaimant).to.equal(claimant.address);
      expect(callAmount).to.equal(testClaimAmount);
    });
  });

  describe("withdrawClaimsPayout", function () {
    beforeEach("deposit to vault and approve claim", async function () {
      await vault.connect(depositor1).deposit({ value: testDepositAmount});
      await vault.connect(mockProduct).processClaim(claimant.address, testClaimAmount);
    });
    it("should revert if not called by the claimant", async function () {
      await expect(claimsEscrow.connect(owner).withdrawClaimsPayout(claimId)).to.be.revertedWith("!claimant");
    });
    it("should revert if cooldown period has not elapsed", async function () {
      await expect(claimsEscrow.connect(claimant).withdrawClaimsPayout(claimId)).to.be.revertedWith("cooldown period has not elapsed");
    });
    it("should transfer claim amount to claimant", async function () {
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add 14 days
      await expect(() => claimsEscrow.connect(claimant).withdrawClaimsPayout(claimId)).to.changeEtherBalance(claimant, testClaimAmount);
    });
    it("should emit ClaimWithdrawn event after function logic is successful", async function () {
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add 14 days
      expect(await claimsEscrow.connect(claimant).withdrawClaimsPayout(claimId)).to.emit(claimsEscrow, "ClaimWithdrawn").withArgs(claimId, claimant.address, testClaimAmount);
    });
    it("should delete the Claim object after successful withdrawal", async function () {
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add 14 days
      await claimsEscrow.connect(claimant).withdrawClaimsPayout(claimId);
      const callClaimant = (await claimsEscrow.claims(claimId)).claimant;
      const callAmount = (await claimsEscrow.claims(claimId)).amount;
      const callReceivedAt = (await claimsEscrow.claims(claimId)).receivedAt;
      expect(callClaimant).to.equal(ZERO_ADDRESS);
      expect(callAmount).to.equal(0);
      expect(callReceivedAt).to.equal(0);
    });
  });

  describe("adjustClaim", function () {
    beforeEach("deposit to vault and approve claim", async function () {
      await vault.connect(depositor1).deposit({ value: testDepositAmount});
      await vault.connect(mockProduct).processClaim(claimant.address, testClaimAmount);
    });
    it("should revert if not called by governance", async function () {
      await expect(claimsEscrow.connect(claimant).adjustClaim(claimId, testClaimAmount2)).to.be.revertedWith("!governance");
    });
    it("should revert if claim doesnt exist", async function () {
      await expect(claimsEscrow.connect(owner).adjustClaim(999, testClaimAmount2)).to.be.revertedWith("claim dne");
    });
    it("should update claim object with the right data", async function () {
      await claimsEscrow.connect(owner).adjustClaim(claimId, testClaimAmount2);
      const callClaimant = (await claimsEscrow.claims(claimId)).claimant;
      const callAmount = (await claimsEscrow.claims(claimId)).amount;
      expect(callClaimant).to.equal(claimant.address);
      expect(callAmount).to.equal(testClaimAmount2);
      await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add 14 days
      await expect(() => claimsEscrow.connect(claimant).withdrawClaimsPayout(claimId)).to.changeEtherBalance(claimant, testClaimAmount2);
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
});

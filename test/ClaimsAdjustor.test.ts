import chai from "chai";
import { waffle } from "hardhat";
import { BigNumber as BN } from "ethers";
const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Registry, Vault, ClaimsAdjustor, ClaimsEscrow, Weth9 } from "../typechain";

describe("ClaimsAdjustor", function () {
    let vault: Vault;
    let weth: Weth9;
    let registry: Registry;
    let claimsAdjustor: ClaimsAdjustor;
    let claimsEscrow: ClaimsEscrow;
    let artifacts: ArtifactImports;

    const [owner, newOwner, depositor1, claimant] = provider.getWallets();
    const testDepositAmount = BN.from("10");
    const testClaimAmount = BN.from("2");
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

        vault = (await deployContract(
            owner,
            artifacts.Vault,
            [owner.address, registry.address, weth.address]
        )) as Vault;

        claimsEscrow = (await deployContract(
            owner,
            artifacts.ClaimsEscrow,
            [registry.address]
        )) as ClaimsEscrow;

        claimsAdjustor = (await deployContract(
            owner,
            artifacts.ClaimsAdjustor,
            [registry.address]
        )) as ClaimsAdjustor;

        await registry.setVault(vault.address);
        await registry.setClaimsAdjustor(claimsAdjustor.address);
        await registry.setClaimsEscrow(claimsEscrow.address);
    });

    describe("deployment", function () {
        it("should set the governance address", async function () {
            expect(await claimsAdjustor.governance()).to.equal(owner.address);
        });
    });

    describe("setGovernance", function () {
        it("should allow governance to set new governance address", async function () {
            expect(await claimsAdjustor.governance()).to.equal(owner.address);
            await claimsAdjustor.connect(owner).setGovernance(newOwner.address);
            expect(await claimsAdjustor.governance()).to.equal(owner.address);
            expect(await claimsAdjustor.newGovernance()).to.equal(newOwner.address);
            let tx = await claimsAdjustor.connect(newOwner).acceptGovernance();
            await expect(tx).to.emit(claimsAdjustor, "GovernanceTransferred").withArgs(newOwner.address);
            expect(await claimsAdjustor.governance()).to.equal(newOwner.address);
            expect(await claimsAdjustor.newGovernance()).to.equal(ZERO_ADDRESS);
        });
        it("should revert if not called by governance", async function () {
            await expect(claimsAdjustor.connect(depositor1).setGovernance(depositor1.address)).to.be.revertedWith("!governance");
            await claimsAdjustor.connect(owner).setGovernance(newOwner.address);
            await expect(claimsAdjustor.connect(depositor1).acceptGovernance()).to.be.revertedWith("!governance");
        });
    });

    describe("approveClaim", function () {
        beforeEach("deposit", async function () {
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
        });
        it("should revert if not called by governance", async function () {
            await expect(claimsAdjustor.connect(depositor1).approveClaim(claimant.address, testClaimAmount)).to.be.revertedWith("!governance");
        });
        it("should emit ClaimApproved event after function logic is successful", async function () {
            expect(await claimsAdjustor.connect(owner).approveClaim(claimant.address, testClaimAmount)).to.emit(claimsAdjustor, "ClaimApproved").withArgs(claimant.address, testClaimAmount);
        });
    });
});

import chai from "chai";
import { waffle } from "hardhat";
import VaultArtifact from '../artifacts/contracts/Vault.sol/Vault.json'
import WETHArtifact from '../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json'
import RegistryArtifact from "../artifacts/contracts/Registry.sol/Registry.json";
import ClaimsAdjustorArtifact from '../artifacts/contracts/ClaimsAdjustor.sol/ClaimsAdjustor.json';
import ClaimsEscrowArtifact from '../artifacts/contracts/ClaimsEscrow.sol/ClaimsEscrow.json';
import { Registry, Vault, ClaimsAdjustor, ClaimsEscrow, MockWeth } from "../typechain";
import { BigNumber as BN } from 'ethers';

const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

chai.use(solidity);

describe("ClaimsAdjustor", function () {
    let vault: Vault;
    let weth: MockWeth;
    let registry: Registry;
    let claimsAdjustor: ClaimsAdjustor;
    let claimsEscrow: ClaimsEscrow;

    const [owner, depositor1, claimant] = provider.getWallets();
    const testDepositAmount = BN.from("10");
    const testClaimAmount = BN.from("2");

    beforeEach(async () => {
        weth = (await deployContract(
            owner,
            WETHArtifact
        )) as MockWeth;

        registry = (await deployContract(
            owner,
            RegistryArtifact,
            [owner.address]
        )) as Registry;

        vault = (await deployContract(
            owner,
            VaultArtifact,
            [owner.address, registry.address, weth.address]
        )) as Vault;

        claimsEscrow = (await deployContract(
            owner,
            ClaimsEscrowArtifact,
            [registry.address]
        )) as ClaimsEscrow;

        claimsAdjustor = (await deployContract(
            owner,
            ClaimsAdjustorArtifact,
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

    describe("approveClaim", function () {
        beforeEach("deposit", async function () {
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
        });
        it("should revert if not called by governance", async function () {
            await expect(claimsAdjustor.connect(depositor1).approveClaim(claimant.address, testClaimAmount)).to.be.revertedWith("!governance");
        });
        it('should emit ClaimApproved event after function logic is successful', async function () {
            expect(await claimsAdjustor.connect(owner).approveClaim(claimant.address, testClaimAmount)).to.emit(claimsAdjustor, 'ClaimApproved').withArgs(claimant.address, testClaimAmount);
        });
    });
});

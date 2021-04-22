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

describe("ClaimsEscrow", function () {
    let vault: Vault;
    let weth: MockWeth;
    let registry: Registry;
    let claimsAdjustor: ClaimsAdjustor;
    let claimsEscrow: ClaimsEscrow;

    const [owner, depositor1, claimant] = provider.getWallets();
    const testDepositAmount = BN.from("10");
    const testClaimAmount = BN.from("2");
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const COOLDOWN_PERIOD = 1209600; // 14 days

    beforeEach(async () => {
        weth = (await deployContract(
            owner,
            WETHArtifact
        )) as MockWeth;

        registry = (await deployContract(
            owner,
            RegistryArtifact
        )) as Registry;

        vault = (await deployContract(
            owner,
            VaultArtifact,
            [registry.address, weth.address]
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
            expect(await claimsEscrow.governance()).to.equal(owner.address);
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
            await claimsAdjustor.connect(owner).approveClaim(claimant.address, testClaimAmount);
            const callClaimant = (await claimsEscrow.claims(0)).claimant;
            const callAmount = (await claimsEscrow.claims(0)).amount;
            expect(callClaimant).to.equal(claimant.address);
            expect(callAmount).to.equal(testClaimAmount);
        });
    });

    describe("withdrawClaimsPayout", function () {
        beforeEach("deposit to vault and approve claim", async function () {
            await vault.connect(depositor1).deposit({ value: testDepositAmount});
            await claimsAdjustor.connect(owner).approveClaim(claimant.address, testClaimAmount); // claimId = 0
        });
        it("should revert if not called by the claimant", async function () {
            await expect(claimsEscrow.connect(owner).withdrawClaimsPayout(0)).to.be.revertedWith("!claimant");
        });
        it("should revert if cooldown period has not elapsed", async function () {
            await expect(claimsEscrow.connect(claimant).withdrawClaimsPayout(0)).to.be.revertedWith("cooldown period has not elapsed");
        });
        it("should transfer claim amount to claimant", async function () {
            await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add 14 days
            await expect(() => claimsEscrow.connect(claimant).withdrawClaimsPayout(0)).to.changeEtherBalance(claimant, testClaimAmount);
        });
        it('should emit ClaimWithdrawn event after function logic is successful', async function () {
            await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add 14 days
            expect(await claimsEscrow.connect(claimant).withdrawClaimsPayout(0)).to.emit(claimsEscrow, 'ClaimWithdrawn').withArgs(0, claimant.address, testClaimAmount);
        });
        it("should delete the Claim object after successful withdrawal", async function () {
            await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add 14 days
            await claimsEscrow.connect(claimant).withdrawClaimsPayout(0);
            const callClaimant = (await claimsEscrow.claims(0)).claimant;
            const callAmount = (await claimsEscrow.claims(0)).amount;
            const callReceivedAt = (await claimsEscrow.claims(0)).receivedAt;
            expect(callClaimant).to.equal(ZERO_ADDRESS);
            expect(callAmount).to.equal(0);
            expect(callReceivedAt).to.equal(0);
        });
    });
});

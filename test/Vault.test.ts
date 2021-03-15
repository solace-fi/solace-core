import chai from "chai";
import { waffle } from "hardhat";
import VaultArtifact from '../artifacts/contracts/Vault.sol/Vault.json'
import { Vault } from "../typechain";

const { expect } = chai;
const { deployContract, solidity } = waffle;
const provider = waffle.provider;

chai.use(solidity);

describe("Vault", function () {
    let vault: Vault;

    const [owner, newOwner, depositor1, depositor2] = provider.getWallets();
    const tokenName = "Solace CP Token";
    const tokenSymbol = "SCP";
    const testAmount = 5;
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

    beforeEach(async () => {
        vault = (await deployContract(
            owner,
            VaultArtifact
        )) as Vault;
    });

    describe("deployment", function () {

        it("should set the right token name and symbol", async function () {
            expect(await vault.name()).to.equal(tokenName);
            expect(await vault.symbol()).to.equal(tokenSymbol);
        });

        it("should set the governance address", async function () {
            expect(await vault.governance()).to.equal(owner.address);
        });

    });

    describe("setGovernance", function () {

        it("should allow governance to set new governance address", async function () {
            await vault.connect(owner).setGovernance(newOwner.address);
            expect(await vault.governance()).to.equal(newOwner.address);
        });

        it("should revert when called by someone other than governance", async function () {
            await expect(vault.connect(depositor1).setGovernance(depositor1.address)).to.be.revertedWith("!governance");
        });

    });

    describe("deposit", function () {

        it("should mint the first depositor CP tokens with ratio 1:1", async function () {
            await vault.connect(depositor1).deposit({ value: testAmount});
            expect(await vault.balanceOf(depositor1.address)).to.equal(testAmount);
        });

        it("should mint the second depositor CP tokens according to existing pool amount", async function () {
            await vault.connect(depositor1).deposit({ value: testAmount});
            expect(await vault.balanceOf(depositor1.address)).to.equal(testAmount);

            await vault.connect(depositor2).deposit({ value: testAmount});
            expect(await vault.balanceOf(depositor2.address)).to.equal(testAmount);
        });

        it('should emit Transfer event as CP tokens are minted', async function () {
            expect(await vault.connect(depositor1).deposit({ value: testAmount})).to.emit(vault, 'Transfer').withArgs(ZERO_ADDRESS, depositor1.address, testAmount);
        })

    });
});


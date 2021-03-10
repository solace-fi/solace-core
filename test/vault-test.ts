import { ethers as ethers } from "hardhat";
import { Contract, ContractFactory, Signer } from "ethers";
import { assert, expect } from "chai";

describe("Vault", function () {
    // @ts-ignore
    let deployer: SignerWithAddress;
    // @ts-ignore
    let owner: SignerWithAddress;
    // @ts-ignore
    let depositor1: SignerWithAddress;
    // @ts-ignore
    let depositor2: SignerWithAddress;

    let vaultFactory: ContractFactory;
    let vault: Contract;
    let ownerSigner;
    let depositor1Signer;
    let depositor2Signer;
    let tokenName = "Capital Provider";
    let tokenSymbol = "CP";
    let testAmount = 5;

    before(async function () {
        [deployer, owner, depositor1, depositor2] = await ethers.getSigners();
    });

    beforeEach(async function () {
        vaultFactory = await ethers.getContractFactory("Vault", { signer: owner });

        vault = await vaultFactory.deploy();
        await vault.deployed();

        ownerSigner = vault.connect(owner);
        depositor1Signer = vault.connect(depositor1);
        depositor2Signer = vault.connect(depositor2);
    });

    describe("Deployment", function () {

        it("Should set the right token name and symbol", async function () {
            expect(await vault.name()).to.equal(tokenName);
            expect(await vault.symbol()).to.equal(tokenSymbol);
        });

        it("Should set the governance address", async function () {
            expect(await vault.governance()).to.equal(owner.address);
        });

    });

    describe("deposit", function () {
        let vaultWithDepositor1Signer;
        let vaultWithDepositor2Signer;
        it("Should mint the first depositor CP tokens with ratio 1:1", async function () {
            vaultWithDepositor1Signer = vault.connect(depositor1);
            await vaultWithDepositor1Signer.deposit({ value: 5});
            expect(await vault.balanceOf(depositor1.address)).to.equal(5);
        });

        it("Should mint the second depositor CP tokens according to existing pool amount", async function () {
            vaultWithDepositor1Signer = vault.connect(depositor1);
            vaultWithDepositor2Signer = vault.connect(depositor2);

            await vaultWithDepositor1Signer.deposit({ value: testAmount});
            expect(await vault.balanceOf(depositor1.address)).to.equal(testAmount);

            await vaultWithDepositor2Signer.deposit({ value: testAmount});
            expect(await vault.balanceOf(depositor2.address)).to.equal(testAmount);
        });

    });
});


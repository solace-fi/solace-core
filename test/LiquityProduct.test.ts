import hardhat from "hardhat";
import { waffle, ethers } from "hardhat";
import { MockProvider } from "ethereum-waffle";
import chai from "chai";
import { BigNumber as BN, constants, utils } from "ethers";
import { config as dotenv_config } from "dotenv";


import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, LiquityProduct, Treasury, ClaimsEscrow, Weth9, Registry, Vault, RiskManager } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { encodeAddresses } from "./utilities/positionDescription";

dotenv_config();
const hre = hardhat;
const { deployContract, solidity } = waffle;
const { expect } = chai;
chai.use(solidity);
const provider: MockProvider = waffle.provider;
const DOMAIN_NAME = "Solace.fi-LiquityProduct";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("LiquityProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("InvalidType(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

if (process.env.FORK_NETWORK === "mainnet") {

  describe("LiquityProductRinkeby", function() {
    const [deployer, governor, policyholder1, policyholder2, policyholder3, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;
    let policyManager: PolicyManager;
    let product1: LiquityProduct;
    let product2: LiquityProduct;
    let product3: LiquityProduct;
    let weth : Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let riskManager: RiskManager;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45100; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const price = 11044; // 2.60%/yr
    const coverAmount = BN.from("10000000000000000000"); // 10 eth
    const blocks = BN.from(threeDays);
    const expectedPremium = BN.from("2137014000000000");
    const cooldownPeriod = 3600; // one hour
    const TROVE_MANAGER_ADDRESS = "0xA39739EF8b0231DbFA0DcdA07d7e29faAbCf4bb2";
    const LQTY_STAKING_ADDRESS = "0x4f9Fbb3f1E99B56e0Fe2892e623Ed36A76Fc605d";
    const STABILITY_POOL_ADDRESS = "0x66017D22b0f8556afDd19FC67041899Eb65a21bb";
    const LQTY_TOKEN_ADDRESS = "0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D";
    const LUSD_TOKEN_ADDRESS = "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0";
    const REAL_USER =   "0x9Ada9Ae98457aD8a2D53DE2B888cd1337d3438E8";

    before (async function() {
      artifacts = await import_artifacts();
      await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
      registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
      await registry.connect(governor).setWeth(weth.address);
      vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
      await registry.connect(governor).setVault(vault.address);
      claimsEscrow = (await deployContract(deployer, artifacts.ClaimsEscrow, [governor.address, registry.address])) as ClaimsEscrow;
      await registry.connect(governor).setClaimsEscrow(claimsEscrow.address);
      treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, ZERO_ADDRESS, registry.address])) as Treasury;
      await registry.connect(governor).setTreasury(treasury.address);
      policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
      await registry.connect(governor).setPolicyManager(policyManager.address);
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
      await registry.connect(governor).setRiskManager(riskManager.address);
      // deploy Compound Product
      product1 = (await deployContract(
        deployer,
        artifacts.LiquityProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          TROVE_MANAGER_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as LiquityProduct;
      product2 = (await deployContract(
        deployer,
        artifacts.LiquityProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          TROVE_MANAGER_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as LiquityProduct;
      product3 = (await deployContract(
        deployer,
        artifacts.LiquityProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          TROVE_MANAGER_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as LiquityProduct;

      await vault.connect(deployer).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product1.address, 1, 11044, 1);
      await product1.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as trove manager", async function () {
        expect(await product1.coveredPlatform()).to.equal(TROVE_MANAGER_ADDRESS);
        expect(await product1.troveManager()).to.equal(TROVE_MANAGER_ADDRESS);
      });
      it("cannot be set by non governor", async function () {
        await expect(product1.connect(policyholder1).setCoveredPlatform(policyholder1.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product1.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product1.coveredPlatform()).to.equal(treasury.address);
        expect(await product1.troveManager()).to.equal(treasury.address);
        await product1.connect(governor).setCoveredPlatform(TROVE_MANAGER_ADDRESS);
      });
    });

    describe("position description", function () {
      it("cannot be zero length", async function () {
        expect(await product1.isValidPositionDescription("0x")).to.be.false;
      });

      it("cannot be odd size", async function () {
        expect(await product1.isValidPositionDescription("0xabcd")).to.be.false;
        expect(await product1.isValidPositionDescription("0x123456789012345678901234567890123456789077")).to.be.false;
      });

      it("cannot have non liquity position", async function () {
        expect(await product1.isValidPositionDescription("0x1234567890123456789012345678901234567890")).to.be.false;
        expect(await product1.isValidPositionDescription(policyholder1.address)).to.be.false;
        expect(await product1.isValidPositionDescription(encodeAddresses([REAL_USER]))).to.be.false;
        expect(await product1.isValidPositionDescription(governor.address)).to.be.false;
        expect(await product1.isValidPositionDescription(encodeAddresses([ZERO_ADDRESS]))).to.be.false;
        expect(await product1.isValidPositionDescription(encodeAddresses([LQTY_STAKING_ADDRESS,ZERO_ADDRESS]))).to.be.false;
      });

      it("can be liquity trove manager", async function () {
        expect(await product1.isValidPositionDescription(encodeAddresses([TROVE_MANAGER_ADDRESS]))).to.be.true;
      });

      it("can be liquity staking", async function () {
        expect(await product1.isValidPositionDescription(encodeAddresses([LQTY_STAKING_ADDRESS]))).to.be.true;
      });

      it("can be liquity stable pool", async function () {
        expect(await product1.isValidPositionDescription(encodeAddresses([STABILITY_POOL_ADDRESS]))).to.be.true;
      });

      it("can be multiple positions", async function () {
        expect(await product1.isValidPositionDescription(encodeAddresses([TROVE_MANAGER_ADDRESS, LQTY_STAKING_ADDRESS, STABILITY_POOL_ADDRESS]))).to.be.true;
      });
    });

    describe("implementedFunctions", function () {
      before(async function () {
        expect(await policyManager.totalSupply()).to.equal(0);
        expect(await policyManager.balanceOf(policyholder1.address)).to.equal(0);

        await policyManager.connect(governor).addProduct(product1.address);
        await policyManager.connect(governor).addProduct(product2.address);
        await policyManager.connect(governor).addProduct(product3.address);

        expect(await policyManager.productIsActive(product1.address)).to.equal(true);
        expect(await policyManager.productIsActive(product2.address)).to.equal(true);
        expect(await policyManager.productIsActive(product3.address)).to.equal(true);
      });

      it("can getQuote", async function () {
        let quote = BN.from(await product1.getQuote(coverAmount, blocks));
        expect(quote).to.equal(expectedPremium);
      });

      it("cannot buy policy with invalid description", async function () {
        await expect(product1.buyPolicy(policyholder1.address, coverAmount, blocks, "0x1234567890123456789012345678901234567890", { value: expectedPremium })).to.be.reverted;
      });

      it("can buyPolicy", async function () {
        let tx = await product1.buyPolicy(policyholder1.address, coverAmount, blocks, TROVE_MANAGER_ADDRESS, { value: expectedPremium });
        expect(tx).to.emit(product1, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(policyholder1.address)).to.equal(1);
      });

      it("can buy duplicate policy", async function () {
        let tx = await product1.buyPolicy(policyholder1.address, coverAmount, blocks, TROVE_MANAGER_ADDRESS, { value: expectedPremium });
        expect(tx).to.emit(product1, "PolicyCreated").withArgs(2);
        expect(await policyManager.totalSupply()).to.equal(2);
        expect(await policyManager.balanceOf(policyholder1.address)).to.equal(2);
      });

      it("can buy policy that covers multiple positions", async function () {
        let tx = await product1.buyPolicy(policyholder1.address, coverAmount, blocks, encodeAddresses([LQTY_STAKING_ADDRESS, STABILITY_POOL_ADDRESS]), { value: expectedPremium });
        expect(tx).to.emit(product1, "PolicyCreated").withArgs(3);
        expect(await policyManager.totalSupply()).to.equal(3);
        expect(await policyManager.balanceOf(policyholder1.address)).to.equal(3);
      });

      it("can get product name", async function () {
        expect(await product1.name()).to.equal("Liquity");
      });
    });

    describe("submitClaim", async function () {
      let policyID1 = 1;
      let amountOut1 = 500000;

     before(async function() {
        await deployer.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
     })

      it("cannot submit claim with expired signature", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product1.address, chainId, policyID1, policyholder1.address, amountOut1, 0, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product1.connect(policyholder1).submitClaim(policyID1, amountOut1, 0, signature)).to.be.revertedWith("expired deadline");
      });

      it("cannot submit claim on someone elses policy", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product1.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product1.connect(policyholder2).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
      });

      it("cannot submit claim on someone elses policy after transfer", async function () {
        await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID1)
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product1.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product1.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
        await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID1)
      });

      it("cannot submit claim signed for someone else", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product1.address, chainId, policyID1, policyholder2.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product1.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });

      it("cannot submit claim from wrong product", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product1.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product2.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("wrong product");
      });

      it("cannot submit claim with excessive payout", async function () {
        let coverAmount = (await policyManager.getPolicyInfo(policyID1)).coverAmount;
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product1.address, chainId, policyID1, policyholder1.address, coverAmount.add(1), deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product1.connect(policyholder1).submitClaim(policyID1, coverAmount.add(1), deadline, signature)).to.be.revertedWith("excessive amount out");
      });

      it("cannot submit claim with forged signature", async function () {
        await expect(product1.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, "0x")).to.be.revertedWith("invalid signature");
        await expect(product1.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, "0xabcd")).to.be.revertedWith("invalid signature");
        await expect(product1.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890")).to.be.revertedWith("invalid signature");
      });

      it("cannot submit claim from unauthorized signer", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product1.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(policyholder1.privateKey.slice(2), "hex")));
        await expect(product1.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });

      it("cannot submit claim with changed arguments", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product1.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product1.connect(policyholder1).submitClaim(policyID1, "700000", deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product1.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline.sub(1), signature)).to.be.revertedWith("invalid signature");
      });

      it("cannot submit claim with invalid domain", async function () {
        let digest = getSubmitClaimDigest(INVALID_DOMAIN, product1.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product1.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });

      it("cannot submit claim with invalid typehash", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product1.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, INVALID_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product1.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });

      it("can open a claim", async function () {
        // sign swap
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product1.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));

        // submit claim
        let tx1 = await product1.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature);
        expect(tx1).to.emit(product1, "ClaimSubmitted").withArgs(policyID1);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID1, policyholder1.address, amountOut1);
        expect(await policyManager.exists(policyID1)).to.be.false;

        // verify payout
        expect((await claimsEscrow.claim(policyID1)).amount).to.equal(amountOut1);
        await provider.send("evm_increaseTime", [cooldownPeriod]); // add one hour
        let userEth1 = await policyholder1.getBalance();
        let tx2 = await claimsEscrow.connect(policyholder1).withdrawClaimsPayout(policyID1);
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
        let userEth2 = await policyholder1.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost).toNumber()).to.equal(amountOut1);
      });
    });
  });
}

import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, utils, constants, Contract } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { config as dotenv_config } from "dotenv";
dotenv_config();

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, WaaveProduct, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { toBytes32, setStorageAt } from "./utilities/setStorage";
import { encodeAddresses } from "./utilities/positionDescription";
import { oneToken } from "./utilities/math";

const DOMAIN_NAME = "Solace.fi-WaaveProduct";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("WaaveProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("InvalidType(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

if(process.env.FORK_NETWORK === "kovan"){
  describe("WaaveProduct", function () {
    const [deployer, governor, policyholder1, policyholder2, policyholder3, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: WaaveProduct;
    let product2: WaaveProduct;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let riskManager: RiskManager;

    let weth: Weth9;
    let waWeth: Contract;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const AAVE_DATA_PROVIDER = "0x3c73A5E5785cAC854D468F727c606C07488a29D6";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45100; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const price = 11044; // 2.60%/yr

    const coverAmount = BN.from("10000000000000000000"); // 10 eth
    const blocks = BN.from(threeDays);
    const expectedPremium = BN.from("2137014000000000");

    const WAREGISTRY_ADDRESS        = "0x166956c3A96c875610DCfb80F228Da0f4e92B73B";
    const WETH_ADDRESS              = "0xd0A1E359811322d97991E03f863a0C30C2cF029C";
    const WAWETH_ADDRESS            = "0xe0f1cdB8AC8d75Af103b227Ee0aE7c7fd47A4A83";

    const REAL_USER1 = "0x0cdD2e13E5b612e8a34049a680cdd57Aca2952E4";
    const BALANCE1 = "60000000000000000";

    const COOLDOWN_PERIOD = 3600; // one hour

    var watokens = [
      {"symbol":"waWETH","address":"0xe0f1cdB8AC8d75Af103b227Ee0aE7c7fd47A4A83"},
      {"symbol":"waDAI","address":"0xcc920E61c23f39Ae5AFc7B494E669b975594Eeea"},
      {"symbol":"waUSDT","address":"0x23887f03647282f4E5305e6Cd877842D76De07a1"},
      {"symbol":"waWBTC","address":"0x23887f03647282f4E5305e6Cd877842D76De07a1","uimpl":"","blacklist":""}
    ];

    before(async function () {
      artifacts = await import_artifacts();
      await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

      registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      weth = (await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS)) as Weth9;
      await registry.connect(governor).setWeth(weth.address);
      vault = (await deployContract(deployer, artifacts.Vault, [governor.address, registry.address])) as Vault;
      await registry.connect(governor).setVault(vault.address);
      claimsEscrow = (await deployContract(deployer, artifacts.ClaimsEscrow, [governor.address, registry.address])) as ClaimsEscrow;
      await registry.connect(governor).setClaimsEscrow(claimsEscrow.address);
      treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry.address])) as Treasury;
      await registry.connect(governor).setTreasury(treasury.address);
      policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
      await registry.connect(governor).setPolicyManager(policyManager.address);
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
      await registry.connect(governor).setRiskManager(riskManager.address);

      // deploy Waave Product
      product = (await deployContract(
        deployer,
        artifacts.WaaveProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          WAREGISTRY_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as WaaveProduct;

      product2 = (await deployContract(
        deployer,
        artifacts.WaaveProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          WAREGISTRY_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as WaaveProduct;

      // fetch contracts
      waWeth = await ethers.getContractAt(artifacts.IWaToken.abi, WAWETH_ADDRESS);

      await vault.connect(deployer).depositEth({value: BN.from("1000000000000000000000")}); // 1000 eth
      await riskManager.connect(governor).addProduct(product.address, 1, 11044, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as waRegistry", async function () {
        expect(await product.coveredPlatform()).to.equal(WAREGISTRY_ADDRESS);
        expect(await product.waRegistry()).to.equal(WAREGISTRY_ADDRESS);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(policyholder1).setCoveredPlatform(policyholder1.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.waRegistry()).to.equal(treasury.address);
        await product.connect(governor).setCoveredPlatform(WAREGISTRY_ADDRESS);
      });
    });

    describe("position description", function () {
      it("cannot be zero length", async function () {
        expect(await product.isValidPositionDescription("0x")).to.be.false;
      });
      it("cannot be odd size", async function () {
        expect(await product.isValidPositionDescription("0xabcd")).to.be.false;
        expect(await product.isValidPositionDescription("0x123456789012345678901234567890123456789077")).to.be.false;
      });
      it("cannot have non waTokens", async function () {
        expect(await product.isValidPositionDescription("0x1234567890123456789012345678901234567890")).to.be.false;
        expect(await product.isValidPositionDescription(REAL_USER1)).to.be.false;
        expect(await product.isValidPositionDescription(encodeAddresses([REAL_USER1]))).to.be.false;
        expect(await product.isValidPositionDescription(governor.address)).to.be.false;
        expect(await product.isValidPositionDescription(WAREGISTRY_ADDRESS)).to.be.false;
        expect(await product.isValidPositionDescription(encodeAddresses([ZERO_ADDRESS]))).to.be.false;
        expect(await product.isValidPositionDescription(encodeAddresses([watokens[0].address,ZERO_ADDRESS]))).to.be.false;
      });
      it("can be one or more waTokens", async function () {
        for(var i = 0; i < watokens.length; ++i) {
          expect(await product.isValidPositionDescription(encodeAddresses([watokens[i].address]))).to.be.true;
          // don't care about duplicates
          for(var j = 0; j < watokens.length; ++j) {
            expect(await product.isValidPositionDescription(encodeAddresses([watokens[i].address, watokens[j].address]))).to.be.true;
          }
        }
        expect(await product.isValidPositionDescription(encodeAddresses(watokens.map(watoken => watoken.address)))).to.be.true;
      });
    });

    describe("implementedFunctions", function () {
      before(async function () {
        expect(await policyManager.totalSupply()).to.equal(0);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(0);
        // adding the owner product to the ProductManager
        (await policyManager.connect(governor).addProduct(product.address));
        expect(await policyManager.productIsActive(product.address)).to.equal(true);
      });
      it("can getQuote", async function () {
        let quote = BN.from(await product.getQuote(coverAmount, blocks));
        expect(quote).to.equal(expectedPremium);
      });
      it("cannot buy policy with invalid description", async function () {
        await expect(product.buyPolicy(REAL_USER1, coverAmount, blocks, "0x1234567890123456789012345678901234567890", { value: expectedPremium })).to.be.reverted;
      });
      it("can buyPolicy", async function () {
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, WAWETH_ADDRESS, { value: expectedPremium });
        expect(tx).to.emit(policyManager, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, WAWETH_ADDRESS, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
        expect(await policyManager.totalSupply()).to.equal(2);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(2);
      });
      it("can buy policy that covers multiple positions", async function () {
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, encodeAddresses([watokens[0].address, watokens[1].address]), { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(3);
        expect(await policyManager.totalSupply()).to.equal(3);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(3);
      });
      it("can get product name", async function () {
        expect(await product.name()).to.equal("Waave");
      })
    })

    describe("submitClaim", function () {
      let policyID1: BN;
      let amountOut1 = 5000000000;
      let amountOut2 = 50000000;

      before(async function () {
        let policyCount = await policyManager.totalPolicyCount();
        policyID1 = policyCount.add(1);
        await deployer.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        // create a waWETH position and policy
        let depositAmount1 = BN.from("1000000000000000");
        await weth.connect(policyholder1).deposit({value: depositAmount1});
        await weth.connect(policyholder1).approve(waWeth.address, depositAmount1);
        await waWeth.connect(policyholder1).deposit(depositAmount1);
        await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, WAWETH_ADDRESS, { value: expectedPremium });
        // create another waWETH position and policy
        let depositAmount2 = BN.from("2000000000000000");
        await weth.connect(policyholder2).deposit({value: depositAmount2});
        await weth.connect(policyholder2).approve(waWeth.address, depositAmount2);
        await waWeth.connect(policyholder2).deposit(depositAmount2);
        await product.connect(policyholder2).buyPolicy(policyholder2.address, coverAmount, blocks, WAWETH_ADDRESS, { value: expectedPremium });
      });
      it("cannot submit claim with expired signature", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, 0, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, 0, signature)).to.be.revertedWith("expired deadline");
      });
      it("cannot submit claim on someone elses policy", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder2).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
      });
      it("cannot submit claim on someone elses policy after transfer", async function () {
        await policyManager.connect(policyholder1).transferFrom(policyholder1.address, policyholder2.address, policyID1)
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
        await policyManager.connect(policyholder2).transferFrom(policyholder2.address, policyholder1.address, policyID1)
      });
      it("cannot submit claim signed for someone else", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder2.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim from wrong product", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product2.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("wrong product");
      });
      it("cannot submit claim with excessive payout", async function () {
        let coverAmount = (await policyManager.getPolicyInfo(policyID1)).coverAmount;
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, coverAmount.add(1), deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, coverAmount.add(1), deadline, signature)).to.be.revertedWith("excessive amount out");
      });
      it("cannot submit claim with forged signature", async function () {
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, "0x")).to.be.revertedWith("invalid signature");
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, "0xabcd")).to.be.revertedWith("invalid signature");
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890")).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim from unauthorized signer", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(deployer.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with changed arguments", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut2, deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline.sub(1), signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with invalid domain", async function () {
        let digest = getSubmitClaimDigest(INVALID_DOMAIN, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with invalid typehash", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, INVALID_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("can open a claim on a waWETH position", async function () {
        // sign swap
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        let activeCover1 = await product.activeCoverAmount();
        let policyInfo = await policyManager.getPolicyInfo(policyID1);
        // submit claim
        let userWaWeth1 = await waWeth.balanceOf(policyholder1.address);
        let userEth0 = await policyholder1.getBalance();
        let tx1 = await product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature);
        let receipt1 = await tx1.wait();
        let gasCost1 = receipt1.gasUsed.mul(receipt1.effectiveGasPrice);
        let userEth1 = await policyholder1.getBalance();
        expect(userEth1.sub(userEth0).add(gasCost1)).to.equal(0);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID1);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID1, policyholder1.address, amountOut1);
        expect(await policyManager.exists(policyID1)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claim(policyID1)).amount).to.equal(amountOut1);
        let userWaWeth2 = await waWeth.balanceOf(policyholder1.address);
        expect(userWaWeth1.sub(userWaWeth2)).to.equal(0);
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let tx2 = await claimsEscrow.connect(policyholder1).withdrawClaimsPayout(policyID1);
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
        let userEth2 = await policyholder1.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut1);
        let activeCover2 = await product.activeCoverAmount();
        expect(activeCover1.sub(activeCover2)).eq(policyInfo.coverAmount);
      });
      it("should support all watokens", async function () {
        var success = 0;
        var successList = [];
        var failList = [];
        for(var i = 0; i < watokens.length; ++i){
          const watokenAddress = watokens[i].address;
          const symbol = watokens[i].symbol;
          try {
            // fetch contracts
            const watoken = await ethers.getContractAt(artifacts.IWaToken.abi, watokenAddress);
            const uAddress = await watoken.underlying();
            const uToken = await ethers.getContractAt(artifacts.ERC20.abi, uAddress);
            const decimals = await uToken.decimals();
            const uAmount = oneToken(decimals);
            const uimpl = ((watokens[i].uimpl || "") != "") ? watokens[i].uimpl : uAddress;
            const blacklistAddress = watokens[i].blacklist || ZERO_ADDRESS;
            const isBlacklistable = blacklistAddress != ZERO_ADDRESS;
            // create position
            var value = toBytes32(uAmount).toString();
            for(var j = 0; j < 200; ++j) {
              try { // solidity rigged balanceOf
                var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[policyholder3.address,j]);
                await setStorageAt(uimpl, index, value);
                var uBalance = await uToken.balanceOf(policyholder3.address);
                if(uBalance.eq(uAmount)) break;
              } catch(e) { }
              try { // vyper rigged balanceOf
                var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[j,policyholder3.address]);
                await setStorageAt(uimpl, index, value);
                var uBalance = await uToken.balanceOf(policyholder3.address);
                if(uBalance.eq(uAmount)) break;
              } catch(e) { }
            }
            expect(await uToken.balanceOf(policyholder3.address)).to.equal(uAmount);
            if(isBlacklistable) {
              const blacklistContract = await ethers.getContractAt(artifacts.Blacklist.abi, blacklistAddress);
              var value = toBytes32(BN.from(0)).toString();
              for(var j = 0; j < 200; ++j) {
                try {
                  var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[policyholder3.address,j]);
                  await setStorageAt(uimpl, index, value);
                  var blacklisted = await blacklistContract.isBlacklisted(policyholder3.address);
                  if(!blacklisted) break;
                } catch(e) { }
              }
              expect(await blacklistContract.isBlacklisted(policyholder3.address)).to.be.false;
            }
            await uToken.connect(policyholder3).approve(watokenAddress, constants.MaxUint256);
            await watoken.connect(policyholder3).deposit(uAmount);
            expect(await uToken.balanceOf(policyholder3.address)).to.be.equal(0);

            const cAmount = await watoken.balanceOf(policyholder3.address);
            expect(cAmount).to.be.gt(0);
            // create policy
            await product.connect(policyholder3).buyPolicy(policyholder3.address, coverAmount, blocks, watokenAddress, { value: expectedPremium });
            let policyID = (await policyManager.totalPolicyCount()).toNumber();
            // sign swap
            let amountOut = 10000;
            let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID, policyholder3.address, amountOut, deadline, SUBMIT_CLAIM_TYPEHASH);
            let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
            // submit claim
            let tx1 = await product.connect(policyholder3).submitClaim(policyID, amountOut, deadline, signature);
            expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID);
            expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID, policyholder3.address, amountOut);
            expect(await policyManager.exists(policyID)).to.be.false;
            // verify payout
            expect((await claimsEscrow.claim(policyID)).amount).to.equal(amountOut);
            await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
            let userEth1 = await policyholder3.getBalance();
            let tx2 = await claimsEscrow.connect(policyholder3).withdrawClaimsPayout(policyID);
            let receipt = await tx2.wait();
            let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
            let userEth2 = await policyholder3.getBalance();
            expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut);
            ++success;
            successList.push(symbol);
            console.log(`\x1b[38;5;239m        ✓ ${symbol}\x1b[0m`);
          } catch (e) {
            console.log(`\x1b[31m        ✘ ${symbol}`);
            console.log("          "+e.stack.replace(/\n/g, "\n      "));
            console.log("\x1b[0m");
            failList.push(symbol);
          }
        }
        if(failList.length != 0) {
          console.log("supported watokens:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
          console.log("unsupported watokens:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
        }
        expect(`${success}/${watokens.length} supported watokens`).to.equal(`${watokens.length}/${watokens.length} supported watokens`);
      });
    });
  });
}

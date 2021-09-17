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
import { PolicyManager, CompoundProductRinkeby, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { toBytes32, setStorageAt } from "./utilities/setStorage";
import { encodeAddresses } from "./utilities/positionDescription";
import { oneToken } from "./utilities/math";

const DOMAIN_NAME = "Solace.fi-CompoundProduct";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("CompoundProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("InvalidType(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

if(process.env.FORK_NETWORK === "rinkeby"){
  describe("CompoundProductRinkeby", function () {
    const [deployer, governor, policyholder1, policyholder2, policyholder3, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: CompoundProductRinkeby;
    let product2: CompoundProductRinkeby;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let riskManager: RiskManager;

    let ceth: Contract;
    let cusdc: Contract;
    let usdc: Contract;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45100; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const price = 11044; // 2.60%/yr

    const coverAmount = BN.from("10000000000000000000"); // 10 eth
    const blocks = BN.from(threeDays);
    const expectedPremium = BN.from("2137014000000000");

    const COMPTROLLER_ADDRESS = "0x2EAa9D77AE4D8f9cdD9FAAcd44016E746485bddb";
    const cETH_ADDRESS = "0xd6801a1DfFCd0a410336Ef88DeF4320D6DF1883e";
    const REAL_USER1 = "0x0fb78424e5021404093aA0cFcf50B176B30a3c1d";
    const BALANCE1 = "1006239030286184920";

    const USDC_ADDRESS = "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b";
    const cUSDC_ADDRESS = "0x5B281A6DdA0B271e91ae35DE655Ad301C976edb1";
    const DAI_ADDRESS = "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa";
    const cDAI_ADDRESS = "0x6D7F0754FFeb405d23C51CE938289d4835bE3b14";

    const COOLDOWN_PERIOD = 3600; // one hour

    const ctokens = [
      {"symbol":"cBAT","address":"0xEBf1A11532b93a529b5bC942B4bAA98647913002"},
      {"symbol":"cDAI","address":"0x6D7F0754FFeb405d23C51CE938289d4835bE3b14"},
      {"symbol":"cETH","address":"0xd6801a1DfFCd0a410336Ef88DeF4320D6DF1883e"},
      {"symbol":"cUSDC","address":"0x5B281A6DdA0B271e91ae35DE655Ad301C976edb1"},
      {"symbol":"cUSDT","address":"0x2fB298BDbeF468638AD6653FF8376575ea41e768","uimpl":"0x98394a121D26F90F4841e7BFE9dD4Aba05E666E4"},
      {"symbol":"cZRX","address":"0x52201ff1720134bBbBB2f6BC97Bf3715490EC19B","uimpl":"","blacklist":""}
    ];

    before(async function () {
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
      product = (await deployContract(
        deployer,
        artifacts.CompoundProductRinkeby,
        [
          governor.address,
          policyManager.address,
          registry.address,
          COMPTROLLER_ADDRESS,
          minPeriod,
          maxPeriod,
          price,
          1
        ]
      )) as CompoundProductRinkeby;

      product2 = (await deployContract(
        deployer,
        artifacts.CompoundProductRinkeby,
        [
          governor.address,
          policyManager.address,
          registry.address,
          COMPTROLLER_ADDRESS,
          minPeriod,
          maxPeriod,
          price,
          1
        ]
      )) as CompoundProductRinkeby;

      // fetch contracts
      ceth = await ethers.getContractAt(artifacts.ICETH.abi, cETH_ADDRESS);
      cusdc = await ethers.getContractAt(artifacts.ICERC20.abi, cUSDC_ADDRESS);
      usdc = await ethers.getContractAt(artifacts.ERC20.abi, USDC_ADDRESS);

      await vault.connect(deployer).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product.address, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as comptroller", async function () {
        expect(await product.coveredPlatform()).to.equal(COMPTROLLER_ADDRESS);
        expect(await product.comptroller()).to.equal(COMPTROLLER_ADDRESS);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(policyholder1).setCoveredPlatform(policyholder1.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.comptroller()).to.equal(treasury.address);
        await product.connect(governor).setCoveredPlatform(COMPTROLLER_ADDRESS);
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
      it("cannot have non cTokens", async function () {
        expect(await product.isValidPositionDescription("0x1234567890123456789012345678901234567890")).to.be.false;
        expect(await product.isValidPositionDescription(REAL_USER1)).to.be.false;
        expect(await product.isValidPositionDescription(encodeAddresses([REAL_USER1]))).to.be.false;
        expect(await product.isValidPositionDescription(governor.address)).to.be.false;
        expect(await product.isValidPositionDescription(COMPTROLLER_ADDRESS)).to.be.false;
        expect(await product.isValidPositionDescription(encodeAddresses([ZERO_ADDRESS]))).to.be.false;
        expect(await product.isValidPositionDescription(encodeAddresses([cETH_ADDRESS,ZERO_ADDRESS]))).to.be.false;
      });
      it("can be one or more cTokens", async function () {
        for(var i = 0; i < ctokens.length; ++i) {
          expect(await product.isValidPositionDescription(encodeAddresses([ctokens[i].address]))).to.be.true;
          // don't care about duplicates
          for(var j = 0; j < ctokens.length; ++j) {
            expect(await product.isValidPositionDescription(encodeAddresses([ctokens[i].address, ctokens[j].address]))).to.be.true;
          }
        }
        expect(await product.isValidPositionDescription(encodeAddresses(ctokens.map(ctoken => ctoken.address)))).to.be.true;
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
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, cETH_ADDRESS, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, cETH_ADDRESS, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
        expect(await policyManager.totalSupply()).to.equal(2);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(2);
      });
      it("can buy policy that covers multiple positions", async function () {
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, encodeAddresses([cETH_ADDRESS, cDAI_ADDRESS]), { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(3);
        expect(await policyManager.totalSupply()).to.equal(3);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(3);
      });
      it("can get product name", async function () {
        expect(await product.name()).to.equal("Compound");
      })
    })

    describe("submitClaim", function () {
      let policyID1: BN;
      let policyID2: BN;
      let amountOut1 = 5000000000;
      let amountOut2 = 50000000;

      before(async function () {
        let policyCount = await policyManager.totalPolicyCount();
        policyID1 = policyCount.add(1);
        policyID2 = policyCount.add(2);
        await deployer.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        // create a cETH position and policy
        await ceth.connect(policyholder1).mint({value: BN.from("1000000000000000")});
        await ceth.connect(policyholder1).approve(product.address, constants.MaxUint256);
        await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, cETH_ADDRESS, { value: expectedPremium });
        // create a cUSDC position and policy
        let uAmount = BN.from("1000000");
        let index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[policyholder1.address,0]);
        await setStorageAt(USDC_ADDRESS,index,toBytes32(uAmount).toString());
        let usdcBalance = await usdc.balanceOf(policyholder1.address);
        expect(usdcBalance).to.equal(uAmount);
        await usdc.connect(policyholder1).approve(cUSDC_ADDRESS, constants.MaxUint256)
        await cusdc.connect(policyholder1).mint(usdcBalance);
        await cusdc.connect(policyholder1).approve(product.address, constants.MaxUint256);
        await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, cUSDC_ADDRESS, { value: expectedPremium });

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
      it("can open a claim on a cETH position", async function () {
        // sign swap
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let userCeth1 = await ceth.balanceOf(policyholder1.address);
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
        let userCeth2 = await ceth.balanceOf(policyholder1.address);
        expect(userCeth1.sub(userCeth2)).to.equal(0);
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let tx2 = await claimsEscrow.connect(policyholder1).withdrawClaimsPayout(policyID1);
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
        let userEth2 = await policyholder1.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut1);
      });
      it("can open a claim on a cERC20 position", async function () {
        // sign swap
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID2, policyholder1.address, amountOut2, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let userCusdc1 = await cusdc.balanceOf(policyholder1.address);
        let userUsdc1 = await usdc.balanceOf(policyholder1.address);
        let tx1 = await product.connect(policyholder1).submitClaim(policyID2, amountOut2, deadline, signature);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID2);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID2, policyholder1.address, amountOut2);
        expect(await policyManager.exists(policyID2)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claim(policyID2)).amount).to.equal(amountOut2);
        let userCusdc2 = await cusdc.balanceOf(policyholder1.address);
        expect(userCusdc1.sub(userCusdc2)).to.equal(0);
        let userUsdc2 = await usdc.balanceOf(policyholder1.address);
        expect(userUsdc2.sub(userUsdc1)).to.equal(0);
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let userEth1 = await policyholder1.getBalance();
        let tx2 = await claimsEscrow.connect(policyholder1).withdrawClaimsPayout(policyID2);
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
        let userEth2 = await policyholder1.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut2);
      });
      it("should support all ctokens", async function () {
        var success = 0;
        var successList = [];
        var failList = [];
        for(var i = 0; i < ctokens.length; ++i){
          const ctokenAddress = ctokens[i].address;
          const symbol = ctokens[i].symbol;
          try {
            // fetch contracts
            const cToken = await ethers.getContractAt(artifacts.ICERC20.abi, ctokenAddress);
            if(symbol == "cETH") {
              await ceth.connect(policyholder3).mint({value: BN.from("1000000000000000000")});
              expect(await cToken.balanceOf(policyholder3.address)).to.be.gt(0);
            } else {
              const uAddress = await cToken.underlying();
              const uToken = await ethers.getContractAt(artifacts.ERC20.abi, uAddress);
              const decimals = await uToken.decimals();
              const uAmount = oneToken(decimals);
              const uimpl = ((ctokens[i].uimpl || "") != "") ? ctokens[i].uimpl : uAddress;
              const blacklistAddress = ctokens[i].blacklist || ZERO_ADDRESS;
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
              await uToken.connect(policyholder3).approve(ctokenAddress, constants.MaxUint256);
              await cToken.connect(policyholder3).mint(uAmount);
              expect(await uToken.balanceOf(policyholder3.address)).to.be.equal(0);
            }
            const cAmount = await cToken.balanceOf(policyholder3.address);
            expect(cAmount).to.be.gt(0);
            // create policy
            await product.connect(policyholder3).buyPolicy(policyholder3.address, coverAmount, blocks, ctokenAddress, { value: expectedPremium });
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
          console.log("supported ctokens:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
          console.log("unsupported ctokens:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
        }
        expect(`${success}/${ctokens.length} supported ctokens`).to.equal(`${ctokens.length}/${ctokens.length} supported ctokens`);
      });
    });
  });
}

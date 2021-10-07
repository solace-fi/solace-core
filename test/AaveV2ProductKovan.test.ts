import hardhat from "hardhat";
const hre = hardhat;
import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Contract, utils, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, AaveV2Product, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager, MockAToken } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { toBytes32, setStorageAt } from "./utilities/setStorage";
import { encodeAddresses } from "./utilities/positionDescription";
import { oneToken } from "./utilities/math";

const DOMAIN_NAME = "Solace.fi-AaveV2Product";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("AaveV2ProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("InvalidType(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

if(process.env.FORK_NETWORK === "kovan"){
  describe("AaveV2ProductKovan", function () {
    const [deployer, governor, policyholder1, policyholder2, policyholder3, depositor, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: AaveV2Product;
    let product2: AaveV2Product;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let riskManager: RiskManager;

    let alink: Contract;
    let link: Contract;
    let lendingPool: Contract;
    let mockAToken: MockAToken;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const AAVE_DATA_PROVIDER = "0x3c73A5E5785cAC854D468F727c606C07488a29D6";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const price = 11044; // 2.60%/yr

    const coverAmount = BN.from("10000000000000000000"); // 10 eth
    const blocks = BN.from(threeDays);
    const expectedPremium = BN.from("2137014000000000");

    const aWETH_ADDRESS = "0x87b1f4cf9BD63f7BBD3eE1aD04E8F52540349347";
    const REAL_USER1 = "0xc2b74b547d02bafc93feb34bd964d42312ae70c3";
    const BALANCE1 = BN.from("689713795702756155");

    const aUSDT_ADDRESS = "0xFF3c8bc103682FA918c954E84F5056aB4DD5189d";
    const REAL_USER2 = "0xde6663fbb083c1bd0f2303f68276e2df2deb0a9d";
    const BALANCE2 = BN.from("3120873596044892954");

    const aLINK_ADDRESS = "0xeD9044cA8F7caCe8eACcD40367cF2bee39eD1b04";
    const LINK_ADDRESS = "0xad5ce863ae3e4e9394ab43d4ba0d80f419f61789";
    const LENDING_POOL_ADDRESS = "0xE0fBa4Fc209b4948668006B2bE61711b7f465bAe";

    const COOLDOWN_PERIOD = 3600; // one hour

    const atokens = [
      {"symbol":"aAAVE","address":"0x6d93ef8093F067f19d33C2360cE17b20a8c45CD7"},
      {"symbol":"aBAT","address":"0x28f92b4c8Bdab37AF6C4422927158560b4bB446e"},
      {"symbol":"aBUSD","address":"0xfe3E41Db9071458e39104711eF1Fa668bae44e85"},
      {"symbol":"aDAI","address":"0xdCf0aF9e59C002FA3AA091a46196b37530FD48a8"},
      {"symbol":"aENJ","address":"0x1d1F2Cb9ED46A8d5bf0254E5CE400514D62d55F0"},
      {"symbol":"aKNC","address":"0xdDdEC78e29f3b579402C42ca1fd633DE00D23940"},
      {"symbol":"aLINK","address":"0xeD9044cA8F7caCe8eACcD40367cF2bee39eD1b04"},
      {"symbol":"aMANA","address":"0xA288B1767C91Aa9d8A14a65dC6B2E7ce68c02DFd"},
      {"symbol":"aMKR","address":"0x9d9DaBEae6BcBa881404A9e499B13B2B3C1F329E"},
      {"symbol":"aREN","address":"0x01875ee883B32f5f961A92eC597DcEe2dB7589c1"},
      {"symbol":"aSNX","address":"0xAA74AdA92dE4AbC0371b75eeA7b1bd790a69C9e1"},
      {"symbol":"aSUSD","address":"0x9488fF6F29ff75bfdF8cd5a95C6aa679bc7Cd65c"},
      {"symbol":"aTUSD","address":"0x39914AdBe5fDbC2b9ADeedE8Bcd444b20B039204"},
      {"symbol":"aUSDC","address":"0xe12AFeC5aa12Cf614678f9bFeeB98cA9Bb95b5B0"},
      {"symbol":"aUSDT","address":"0xFF3c8bc103682FA918c954E84F5056aB4DD5189d"},
      {"symbol":"aWBTC","address":"0x62538022242513971478fcC7Fb27ae304AB5C29F"},
      {"symbol":"aWETH","address":"0x87b1f4cf9BD63f7BBD3eE1aD04E8F52540349347"},
      {"symbol":"aYFI","address":"0xF6c7282943Beac96f6C70252EF35501a6c1148Fe"},
      {"symbol":"aZRX","address":"0xf02D7C23948c9178C68f5294748EB778Ab5e5D9c","uimpl":""},
      {"symbol":"aUNI","address":"0x601FFc9b7309bdb0132a02a569FBd57d6D1740f2"},
      {"symbol":"aAMPL","address":"0xb8a16bbab34FA7A5C09Ec7679EAfb8fEC06897bc","uimpl":"0xcea5Db2E865213CDa8C0EAaD2e68Ccc54Dd88d27"}
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

      // deploy Aave V2 Product
      product = (await deployContract(
        deployer,
        artifacts.AaveV2Product,
        [
          governor.address,
          policyManager.address,
          registry.address,
          AAVE_DATA_PROVIDER,
          minPeriod,
          maxPeriod
        ]
      )) as unknown as AaveV2Product;

      product2 = (await deployContract(
        deployer,
        artifacts.AaveV2Product,
        [
          governor.address,
          policyManager.address,
          registry.address,
          AAVE_DATA_PROVIDER,
          minPeriod,
          maxPeriod
        ]
      )) as unknown as AaveV2Product;

      mockAToken = (await deployContract(deployer, artifacts.MockAToken)) as MockAToken;

      // fetch contracts
      alink = await ethers.getContractAt(artifacts.AToken.abi, aLINK_ADDRESS);
      link = await ethers.getContractAt(artifacts.ERC20.abi, LINK_ADDRESS);
      lendingPool = await ethers.getContractAt(artifacts.LendingPool.abi, LENDING_POOL_ADDRESS);

      await vault.connect(depositor).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product.address, 1, 11044, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as aave data provider", async function () {
        expect(await product.coveredPlatform()).to.equal(AAVE_DATA_PROVIDER);
        expect(await product.aaveDataProvider()).to.equal(AAVE_DATA_PROVIDER);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(policyholder1).setCoveredPlatform(policyholder1.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.aaveDataProvider()).to.equal(treasury.address);
        await product.connect(governor).setCoveredPlatform(AAVE_DATA_PROVIDER);
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
      it("cannot have non aTokens", async function () {
        // would like to.be.false, to.be.reverted will work though
        await expect(product.isValidPositionDescription("0x1234567890123456789012345678901234567890")).to.be.reverted;
        await expect(product.isValidPositionDescription(REAL_USER1)).to.be.reverted;
        await expect(product.isValidPositionDescription(encodeAddresses([REAL_USER1]))).to.be.reverted;
        await expect(product.isValidPositionDescription(governor.address)).to.be.reverted;
        await expect(product.isValidPositionDescription(AAVE_DATA_PROVIDER)).to.be.reverted;
        await expect(product.isValidPositionDescription(encodeAddresses([ZERO_ADDRESS]))).to.be.reverted;
        expect(await product.isValidPositionDescription(encodeAddresses([mockAToken.address]))).to.be.false;
        expect(await product.isValidPositionDescription(encodeAddresses([aWETH_ADDRESS, mockAToken.address]))).to.be.false;
      });
      it("can be one or more aTokens", async function () {
        for(var i = 0; i < atokens.length; ++i) {
          expect(await product.isValidPositionDescription(encodeAddresses([atokens[i].address]))).to.be.true;
          // don't care about duplicates
          for(var j = 0; j < atokens.length; ++j) {
            expect(await product.isValidPositionDescription(encodeAddresses([atokens[i].address, atokens[j].address]))).to.be.true;
          }
        }
        expect(await product.isValidPositionDescription(encodeAddresses(atokens.map(atoken => atoken.address)))).to.be.true;
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
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, aWETH_ADDRESS, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, aWETH_ADDRESS, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
        expect(await policyManager.totalSupply()).to.equal(2);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(2);
      });
      it("can buy policy that covers multiple positions", async function () {
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, encodeAddresses([aWETH_ADDRESS, aLINK_ADDRESS]), { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(3);
        expect(await policyManager.totalSupply()).to.equal(3);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(3);
      });
      it("can get product name", async function () {
        expect(await product.name()).to.equal("AaveV2");
      });
    })

    describe("submitClaim", async function () {
      let policyID1: BN;
      let policyID2: BN;
      let amountIn1 = BN.from(100000000000);
      let amountOut1 = 500000;
      before(async function () {
        let policyCount = await policyManager.totalPolicyCount();
        policyID1 = policyCount.add(1);
        policyID2 = policyCount.add(2);
        await depositor.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        // create an aLink position and policy
        let index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[policyholder1.address,0]);
        await setStorageAt(LINK_ADDRESS,index,toBytes32(amountIn1.mul(2)).toString());
        await link.connect(policyholder1).transfer(policyholder2.address, amountIn1);
        expect(await link.balanceOf(policyholder1.address)).to.equal(amountIn1);
        await link.connect(policyholder1).approve(lendingPool.address, constants.MaxUint256);
        await lendingPool.connect(policyholder1).deposit(LINK_ADDRESS, amountIn1, policyholder1.address, 0);
        expect(await link.balanceOf(policyholder1.address)).to.be.equal(0);
        expect(await alink.balanceOf(policyholder1.address)).to.be.gte(amountIn1);
        await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, aLINK_ADDRESS, { value: expectedPremium });
        // create another aLink position and policy
        expect(await link.balanceOf(policyholder2.address)).to.equal(amountIn1);
        await link.connect(policyholder2).approve(lendingPool.address, constants.MaxUint256);
        await lendingPool.connect(policyholder2).deposit(LINK_ADDRESS, amountIn1, policyholder2.address, 0);
        expect(await link.balanceOf(policyholder2.address)).to.be.equal(0);
        expect(await alink.balanceOf(policyholder2.address)).to.be.gte(amountIn1);
        await product.connect(policyholder2).buyPolicy(policyholder2.address, coverAmount, blocks, aLINK_ADDRESS, { value: expectedPremium });
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
        let signature = assembleSignature(sign(digest, Buffer.from(policyholder1.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with changed arguments", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, "700000", deadline, signature)).to.be.revertedWith("invalid signature");
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
      it("can open a claim", async function () {
        // sign swap
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, policyholder1.address, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let tx1 = await product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID1);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID1, policyholder1.address, amountOut1);
        expect(await policyManager.exists(policyID1)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claim(policyID1)).amount).to.equal(amountOut1);
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let userEth1 = await policyholder1.getBalance();
        let tx2 = await claimsEscrow.connect(policyholder1).withdrawClaimsPayout(policyID1);
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
        let userEth2 = await policyholder1.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut1);
      });
      it("should support all atokens", async function () {
        var success = 0;
        var successList = [];
        var failList = [];
        for(var i = 0; i < atokens.length; ++i){
          const aAddress = atokens[i].address;
          const symbol = atokens[i].symbol;
          try {
            // create policy
            await product.connect(policyholder3).buyPolicy(policyholder3.address, coverAmount, blocks, aAddress, { value: expectedPremium });
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
          } catch (e: any) {
            console.log(`\x1b[31m        ✘ ${symbol}`);
            console.log("          " + e.stack.replace(/\n/g, "\n      "));
            console.log("\x1b[0m");
            failList.push(atokens[i].symbol);
          }
        }
        if(failList.length != 0) {
          console.log("supported atokens:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
          console.log("unsupported atokens:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
        }
        expect(`${success}/${atokens.length} supported atokens`).to.equal(`${atokens.length}/${atokens.length} supported atokens`);
      });
    });
  });
}

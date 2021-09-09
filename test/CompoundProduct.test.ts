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
import { PolicyManager, CompoundProduct, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { toBytes32, setStorageAt } from "./utilities/setStorage";
import { encodeAddresses } from "./utilities/positionDescription";
import { oneToken } from "./utilities/math";

const DOMAIN_NAME = "Solace.fi-CompoundProduct";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("CompoundProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("InvalidType(uint256 policyID,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

if(process.env.FORK_NETWORK === "mainnet"){
  describe("CompoundProduct", function () {
    const [deployer, governor, policyholder, policyholder2, policyholder3, depositor, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: CompoundProduct;
    let product2: CompoundProduct;
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
    const maxPeriod = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const price = 11044; // 2.60%/yr

    const coverAmount = BN.from("10000000000000000000"); // 10 eth
    const blocks = BN.from(threeDays);
    const expectedPremium = BN.from("2137014000000000");

    const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
    const COMPTROLLER_ADDRESS = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";

    const cETH_ADDRESS = "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5";
    const REAL_USER1 = "0xa0f75491720835b36edc92d06ddc468d201e9b73";
    const BALANCE1  = BN.from("12010752049567712323060");
    const BALANCE11 = BN.from("12010752049567712323060");

    const cDAI_ADDRESS = "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643";
    const REAL_USER2 = "0xda3059e065781976845359154cc3aae1d0e99289";
    const BALANCE2  = BN.from("4088791470421633888366");
    const BALANCE12 = BN.from("4027473651811652543692");

    const cUSDC_ADDRESS = "0x39AA39c021dfbaE8faC545936693aC917d5E7563"
    const REAL_USER3 = "0x416f4d9d9a6c595e24aef284672ef3c98eda6bb0";
    const BALANCE3  = BN.from("14139034817159767211");
    const BALANCE13 = BN.from("2283188801550000000");
    const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

    const COOLDOWN_PERIOD = 3600; // one hour

    const ctokens = [
      {"symbol":"cBAT","address":"0x6C8c6b02E7b2BE14d4fA6022Dfd6d75921D90E4E"},
      {"symbol":"cDAI","address":"0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643"},
      {"symbol":"cETH","address":"0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5"},
      //{"symbol":"cREP","address":"0x158079Ee67Fce2f58472A96584A73C7Ab9AC95c1"}, // deprecated
      {"symbol":"cUSDC","address":"0x39AA39c021dfbaE8faC545936693aC917d5E7563","blacklist":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"},
      {"symbol":"cUSDT","address":"0xf650C3d88D12dB855b8bf7D11Be6C55A4e07dCC9"},
      //{"symbol":"cWBTC","address":"0xC11b1268C1A384e55C48c2391d8d480264A3A7F4"}, // deprecated (old wbtc)
      {"symbol":"cZRX","address":"0xB3319f5D18Bc0D84dD1b4825Dcde5d5f7266d407"},
      //{"symbol":"cDAI","address":"0xF5DCe57282A584D2746FaF1593d3121Fcac444dC"}, // deprecated (sai)
      {"symbol":"cUNI","address":"0x35A18000230DA775CAc24873d00Ff85BccdeD550"},
      {"symbol":"cCOMP","address":"0x70e36f6BF80a52b3B46b3aF8e106CC0ed743E8e4"},
      {"symbol":"cWBTC","address":"0xccF4429DB6322D5C611ee964527D42E5d685DD6a"},
      {"symbol":"cTUSD","address":"0x12392F67bdf24faE0AF363c24aC620a2f67DAd86"},
      {"symbol":"cLINK","address":"0xFAce851a4921ce59e912d19329929CE6da6EB0c7","uimpl":"","blacklist":""},
      {"symbol":"cMKR","address":"0x95b4eF2869eBD94BEb4eEE400a99824BF5DC325b"},
      {"symbol":"cSUSHI","address":"0x4B0181102A0112A2ef11AbEE5563bb4a3176c9d7"},
      {"symbol":"cAAVE","address":"0xe65cdB6479BaC1e22340E4E755fAE7E509EcD06c"},
      {"symbol":"cYFI","address":"0x80a2AE356fc9ef4305676f7a3E2Ed04e12C33946"}
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
        artifacts.CompoundProduct,
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
      )) as CompoundProduct;

      product2 = (await deployContract(
        deployer,
        artifacts.CompoundProduct,
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
      )) as CompoundProduct;

      // fetch contracts
      ceth = await ethers.getContractAt(artifacts.ICETH.abi, cETH_ADDRESS);
      cusdc = await ethers.getContractAt(artifacts.ICERC20.abi, cUSDC_ADDRESS);
      usdc = await ethers.getContractAt(artifacts.ERC20.abi, USDC_ADDRESS);

      await vault.connect(depositor).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product.address, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as comptroller", async function () {
        expect(await product.coveredPlatform()).to.equal(COMPTROLLER_ADDRESS);
        expect(await product.comptroller()).to.equal(COMPTROLLER_ADDRESS);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(policyholder).setCoveredPlatform(policyholder.address)).to.be.revertedWith("!governance");
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
        await expect(product.buyPolicy(REAL_USER1, "0x1234567890123456789012345678901234567890", coverAmount, blocks, { value: expectedPremium })).to.be.reverted;
      });
      it("can buyPolicy", async function () {
        let tx = await product.buyPolicy(REAL_USER1, cETH_ADDRESS, coverAmount, blocks, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let tx = await product.buyPolicy(REAL_USER1, cETH_ADDRESS, coverAmount, blocks, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
        expect(await policyManager.totalSupply()).to.equal(2);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(2);
      });
      it("can buy policy that covers multiple positions", async function () {
        let tx = await product.buyPolicy(REAL_USER1, encodeAddresses([cETH_ADDRESS, cDAI_ADDRESS]), coverAmount, blocks, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(3);
        expect(await policyManager.totalSupply()).to.equal(3);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(3);
      });
      it("can get product name", async function () {
        expect(await product.name()).to.equal("Compound");
      });
    });

    describe("submitClaim", function () {
      let policyID1: BN;
      let policyID2: BN;
      let amountOut1 = 5000000;
      let amountOut2 = 50000000;

      before(async function () {
        let policyCount = await policyManager.totalPolicyCount();
        policyID1 = policyCount.add(1);
        policyID2 = policyCount.add(2);
        await deployer.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        // create a cETH position and policy
        await ceth.connect(policyholder).mint({value: BN.from("1000000000000000")});
        await product.connect(policyholder).buyPolicy(policyholder.address, cETH_ADDRESS, coverAmount, blocks, { value: expectedPremium });
        // create a cUSDC position and policy
        let uAmount = BN.from("1000000");
        let index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[policyholder.address,9]);
        await setStorageAt(USDC_ADDRESS,index,toBytes32(uAmount).toString());
        let usdcBalance = await usdc.balanceOf(policyholder.address);
        expect(usdcBalance).to.equal(uAmount);

        await usdc.connect(policyholder).approve(cUSDC_ADDRESS, constants.MaxUint256)
        await cusdc.connect(policyholder).mint(usdcBalance);
        await product.connect(policyholder).buyPolicy(policyholder.address, cUSDC_ADDRESS, coverAmount, blocks, { value: expectedPremium });

      });
      it("cannot submit claim with expired signature", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, amountOut1, 0, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder).submitClaim(policyID1, amountOut1, 0, signature)).to.be.revertedWith("expired deadline");
      });
      it("cannot submit claim on someone elses policy", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(deployer).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
      });
      it("cannot submit claim from wrong product", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product2.connect(policyholder).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("wrong product");
      });
      it("cannot submit claim with excessive payout", async function () {
        let coverAmount = (await policyManager.getPolicyInfo(policyID1)).coverAmount;
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, coverAmount.add(1), deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder).submitClaim(policyID1, coverAmount.add(1), deadline, signature)).to.be.revertedWith("excessive amount out");
      });
      it("cannot submit claim with forged signature", async function () {
        await expect(product.connect(policyholder).submitClaim(policyID1, amountOut1, deadline, "0x")).to.be.revertedWith("invalid signature");
        await expect(product.connect(policyholder).submitClaim(policyID1, amountOut1, deadline, "0xabcd")).to.be.revertedWith("invalid signature");
        await expect(product.connect(policyholder).submitClaim(policyID1, amountOut1, deadline, "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890")).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim from unauthorized signer", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(deployer.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with changed arguments", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder).submitClaim(policyID1, amountOut2, deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(policyholder).submitClaim(policyID1, amountOut1, deadline.sub(1), signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with invalid domain", async function () {
        let digest = getSubmitClaimDigest(INVALID_DOMAIN, product.address, chainId, policyID1, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with invalid typehash", async function () {
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, amountOut1, deadline, INVALID_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("can open a claim on a cETH position", async function () {
        // sign swap
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID1, amountOut1, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let userCeth1 = await ceth.balanceOf(policyholder.address);
        let userEth0 = await policyholder.getBalance();
        let tx1 = await product.connect(policyholder).submitClaim(policyID1, amountOut1, deadline, signature);
        let receipt1 = await tx1.wait();
        let gasCost1 = receipt1.gasUsed.mul(receipt1.effectiveGasPrice);
        let userEth1 = await policyholder.getBalance();
        expect(userEth1.sub(userEth0).add(gasCost1)).to.equal(0);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID1);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID1, policyholder.address, amountOut1);
        expect(await policyManager.exists(policyID1)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claim(policyID1)).amount).to.equal(amountOut1);
        let userCeth2 = await ceth.balanceOf(policyholder.address);
        expect(userCeth1.sub(userCeth2)).to.equal(0);
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let tx2 = await claimsEscrow.connect(policyholder).withdrawClaimsPayout(policyID1);
        expect(await claimsEscrow.exists(policyID1)).to.be.false;
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
        let userEth2 = await policyholder.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut1);
      });
      it("can open a claim on a cERC20 position", async function () {
        // sign swap
        let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID2, amountOut2, deadline, SUBMIT_CLAIM_TYPEHASH);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let userCusdc1 = await cusdc.balanceOf(policyholder.address);
        let userUsdc1 = await usdc.balanceOf(policyholder.address);
        let tx1 = await product.connect(policyholder).submitClaim(policyID2, amountOut2, deadline, signature);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID2);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID2, policyholder.address, amountOut2);
        expect(await policyManager.exists(policyID2)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claim(policyID2)).amount).to.equal(amountOut2);
        let userCusdc2 = await cusdc.balanceOf(policyholder.address);
        expect(userCusdc1.sub(userCusdc2)).to.equal(0);
        let userUsdc2 = await usdc.balanceOf(policyholder.address);
        expect(userUsdc2.sub(userUsdc1)).to.equal(0);
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let userEth1 = await policyholder.getBalance();
        let tx2 = await claimsEscrow.connect(policyholder).withdrawClaimsPayout(policyID2);
        expect(await claimsEscrow.exists(policyID2)).to.be.false;
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
        let userEth2 = await policyholder.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut2);
      });
      it("should support all ctokens", async function () {
        var success = 0;
        var successList = [];
        var failList = [];
        for(var i = 0; i < ctokens.length; ++i){
          const symbol = ctokens[i].symbol;
          const ctokenAddress = ctokens[i].address;
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
            await product.connect(policyholder3).buyPolicy(policyholder3.address, ctokenAddress, coverAmount, blocks, { value: expectedPremium });
            let policyID = (await policyManager.totalPolicyCount()).toNumber();
            // sign swap
            let amountOut = 10000;
            let digest = getSubmitClaimDigest(DOMAIN_NAME, product.address, chainId, policyID, amountOut, deadline, SUBMIT_CLAIM_TYPEHASH);
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
  })
}

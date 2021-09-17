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
import { PolicyManager, YearnV2Product, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { toBytes32, setStorageAt } from "./utilities/setStorage";
import { encodeAddresses } from "./utilities/positionDescription";
import { oneToken } from "./utilities/math";

const DOMAIN_NAME = "Solace.fi-YearnV2Product";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("YearnV2ProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("InvalidType(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

if(process.env.FORK_NETWORK === "mainnet"){
  describe("YearnV2Product", function () {
    const [deployer, governor, policyholder1, policyholder2, depositor, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: YearnV2Product;
    let product2: YearnV2Product;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let riskManager: RiskManager;
    let dai: Contract;
    let ydai: Contract;

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
    const IYREGISTRY = "0x3eE41C098f9666ed2eA246f4D2558010e59d63A0";
    const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const YDAI_ADDRESS = "0xacd43e627e64355f1861cec6d3a6688b31a6f952";
    const REAL_USER1 = "0x452269ae20f7df9fc93f2f92d1c5351b895a39b3";
    const BALANCE = BN.from("7207201633777852");

    const COOLDOWN_PERIOD = 3600; // one hour

    var yvaults = [
      {"symbol":"yaLINK","address":"0x29e240cfd7946ba20895a7a02edb25c210f9f324"}, // safeerc20
      {"symbol":"yLINK","address":"0x881b06da56bb5675c54e4ed311c21e54c5025298","uimpl":""},
      {"symbol":"yUSDC","address":"0x597ad1e0c13bfe8025993d9e79c69e1c0233522e","blacklist":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"}, // black listed
      {"symbol":"yyDAI+yUSDC+yUSDT+yTUSD","address":"0x5dbcf33d8c2e976c6b560249878e6f1491bca25c"}, // no reason
      {"symbol":"yTUSD","address":"0x37d19d1c4e1fa9dc47bd1ea12f742a0887eda74a"},
      {"symbol":"yDAI","address":"0xacd43e627e64355f1861cec6d3a6688b31a6f952"},
      {"symbol":"yUSDT","address":"0x2f08119c6f07c006695e079aafc638b8789faf18"},
      {"symbol":"yYFI","address":"0xba2e7fed597fd0e3e70f5130bcdbbfe06bb94fe1"},
      {"symbol":"yyDAI+yUSDC+yUSDT+yBUSD","address":"0x2994529c0652d127b7842094103715ec5299bbed"}, // zero position value
      {"symbol":"ycrvRenWSBTC","address":"0x7ff566e1d69deff32a7b244ae7276b9f90e9d0f6"}, // zero position value
      {"symbol":"yWETH","address":"0xe1237aa7f535b0cc33fd973d66cbf830354d16c7"},
      {"symbol":"y3Crv","address":"0x9ca85572e6a3ebf24dedd195623f188735a5179f"},
      {"symbol":"yGUSD","address":"0xec0d8d3ed5477106c6d4ea27d90a60e594693c90","uimpl":"0x6704ba24b8640BCcEe6BF2fd276a6a1b8EdF4Ade"}, // gusd is proxy
      {"symbol":"yvcDAI+cUSDC","address":"0x629c759d1e83efbf63d84eb3868b564d9521c129"}, // zero position value
      {"symbol":"yvmusd3CRV","address":"0x0fcdaedfb8a7dfda2e9838564c5a1665d856afdf"}, // zero position value
      {"symbol":"yvgusd3CRV","address":"0xcc7e70a958917cce67b4b87a8c30e6297451ae98"}, // zero position value
      {"symbol":"yveursCRV","address":"0x98b058b2cbacf5e99bc7012df757ea7cfebd35bc"}, // zero position value
      {"symbol":"yvmUSD","address":"0xe0db48b4f71752c4bef16de1dbd042b82976b8c7"},
      {"symbol":"yvcrvRenWBTC","address":"0x5334e150b938dd2b6bd040d9c4a03cff0ced3765"}, // zero position value
      {"symbol":"yvusdn3CRV","address":"0xfe39ce91437c76178665d64d7a2694b0f6f17fe3"}, // zero position value
      {"symbol":"yvust3CRV","address":"0xf6c9e9af314982a4b38366f4abfaa00595c5a6fc"}, // zero position value
      {"symbol":"yvbBTC/sbtcCRV","address":"0xa8b1cb4ed612ee179bdea16cca6ba596321ae52d"}, // zero position value
      {"symbol":"yvtbtc/sbtcCrv","address":"0x07fb4756f67bd46b748b16119e802f1f880fb2cc"}, // zero position value
      {"symbol":"yvoBTC/sbtcCRV","address":"0x7f83935ecfe4729c4ea592ab2bc1a32588409797"}, // zero position value
      {"symbol":"yvpBTC/sbtcCRV","address":"0x123964ebe096a920dae00fb795ffbfa0c9ff4675"}, // zero position value
      {"symbol":"yvhCRV","address":"0x46afc2dfbd1ea0c0760cad8262a5838e803a37e5"}, // zero position value
      {"symbol":"yvcrvPlain3andSUSD","address":"0x5533ed0a3b83f70c3c4a1f69ef5546d3d4713e44"},
      {"symbol":"yvhusd3CRV","address":"0x39546945695dcb1c037c836925b355262f551f55"}, // zero position value
      {"symbol":"yvdusd3CRV","address":"0x8e6741b456a074f0bc45b8b82a755d4af7e965df"}, // zero position value
      {"symbol":"yva3CRV","address":"0x03403154afc09ce8e44c3b185c82c6ad5f86b9ab"}, // zero position value
      {"symbol":"yvankrCRV","address":"0xe625f5923303f1ce7a43acfefd11fd12f30dbca4"}, // zero position value
      {"symbol":"yvsaCRV","address":"0xbacb69571323575c6a5a3b4f9eede1dc7d31fbc1"}, // zero position value
      {"symbol":"yvusdp3CRV","address":"0x1b5eb1173d2bf770e50f10410c9a96f7a8eb6e75"}, // zero position value
      {"symbol":"yvlinkCRV","address":"0x96ea6af74af09522fcb4c28c269c26f59a31ced6","uimpl":""} // zero position value
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

      // deploy YearnV2 Product
      product = (await deployContract(
        deployer,
        artifacts.YearnV2Product,
        [
          governor.address,
          policyManager.address,
          registry.address,
          IYREGISTRY,
          minPeriod,
          maxPeriod,
          price,
          1
        ]
      )) as YearnV2Product;

      // deploy another YearnV2 Product
      product2 = (await deployContract(
        deployer,
        artifacts.YearnV2Product,
        [
          governor.address,
          policyManager.address,
          registry.address,
          IYREGISTRY,
          minPeriod,
          maxPeriod,
          price,
          1
        ]
      )) as YearnV2Product;

      // fetch contracts
      dai = await ethers.getContractAt(artifacts.ERC20.abi, DAI_ADDRESS);
      ydai = await ethers.getContractAt(artifacts.YVault.abi, YDAI_ADDRESS);

      await vault.connect(depositor).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product.address, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as yearn registry", async function () {
        expect(await product.coveredPlatform()).to.equal(IYREGISTRY);
        expect(await product.yregistry()).to.equal(IYREGISTRY);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(policyholder1).setCoveredPlatform(policyholder1.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.yregistry()).to.equal(treasury.address);
        await product.connect(governor).setCoveredPlatform(IYREGISTRY);
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
      it("cannot have non yVaults", async function () {
        // would like to.be.false, to.be.reverted will work though
        await expect(product.isValidPositionDescription("0x1234567890123456789012345678901234567890")).to.be.reverted;
        await expect(product.isValidPositionDescription(REAL_USER1)).to.be.reverted;
        await expect(product.isValidPositionDescription(encodeAddresses([REAL_USER1]))).to.be.reverted;
        await expect(product.isValidPositionDescription(governor.address)).to.be.reverted;
        await expect(product.isValidPositionDescription(IYREGISTRY)).to.be.reverted;
        await expect(product.isValidPositionDescription(encodeAddresses([ZERO_ADDRESS]))).to.be.reverted;
        await expect(product.isValidPositionDescription(encodeAddresses([yvaults[0].address,ZERO_ADDRESS]))).to.be.reverted;
      });
      it("can be one or more yVaults", async function () {
        for(var i = 0; i < yvaults.length; ++i) {
          expect(await product.isValidPositionDescription(encodeAddresses([yvaults[i].address]))).to.be.true;
          // don't care about duplicates
          for(var j = 0; j < yvaults.length; ++j) {
            expect(await product.isValidPositionDescription(encodeAddresses([yvaults[i].address, yvaults[j].address]))).to.be.true;
          }
        }
        expect(await product.isValidPositionDescription(encodeAddresses(yvaults.map(yvault => yvault.address)))).to.be.true;
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
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, YDAI_ADDRESS, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, YDAI_ADDRESS, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
        expect(await policyManager.totalSupply()).to.equal(2);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(2);
      });
      it("can buy policy that covers multiple positions", async function () {
        let tx = await product.buyPolicy(REAL_USER1, coverAmount, blocks, encodeAddresses([yvaults[0].address, yvaults[1].address]), { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(3);
        expect(await policyManager.totalSupply()).to.equal(3);
        expect(await policyManager.balanceOf(REAL_USER1)).to.equal(3);
      });
      it("can get product name", async function () {
        expect(await product.name()).to.equal("YearnV2");
      });
    })

    describe("submitClaim", async function () {
      let policyID1: BN;
      let policyID2: BN;
      let daiAmount = BN.from(100000000000);
      let amountOut1 = 500000;

      before(async function () {
        let policyCount = await policyManager.totalPolicyCount();
        policyID1 = policyCount.add(1);
        policyID2 = policyCount.add(2);
        await dai.connect(policyholder2).transfer(depositor.address, await dai.balanceOf(policyholder2.address));
        await depositor.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        // create a dai position and policy
        let index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[policyholder1.address,2]);
        await setStorageAt(DAI_ADDRESS,index,toBytes32(daiAmount.mul(2)).toString());
        await dai.connect(policyholder1).transfer(policyholder2.address, daiAmount);
        expect(await dai.balanceOf(policyholder1.address)).to.equal(daiAmount);
        await dai.connect(policyholder1).approve(ydai.address, constants.MaxUint256);
        await ydai.connect(policyholder1).deposit(daiAmount);
        await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, YDAI_ADDRESS, { value: expectedPremium });
        // create another dai position and policy
        expect(await dai.balanceOf(policyholder2.address)).to.equal(daiAmount);
        await dai.connect(policyholder2).approve(ydai.address, constants.MaxUint256);
        await ydai.connect(policyholder2).deposit(daiAmount);
        await product.connect(policyholder2).buyPolicy(policyholder2.address, coverAmount, blocks, YDAI_ADDRESS, { value: expectedPremium });
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
      it("should support all yearn vaults", async function () {
        const policyholder3Address = "0x688514032e2cD27fbCEc700E2b10aa8D34741956";
        await hre.network.provider.request({method: "hardhat_impersonateAccount", params: [policyholder3Address]});
        await depositor.sendTransaction({to: policyholder3Address, value: BN.from("1000000000000000000")});
        const policyholder3 = await ethers.getSigner(policyholder3Address);
        var success = 0;
        var successList = [];
        var failList = [];
        for(var i = 0; i < yvaults.length; ++i){
          const yAddress = yvaults[i].address;
          const symbol = yvaults[i].symbol;
          try {
            // fetch contracts
            const yvault = await ethers.getContractAt(artifacts.YVault.abi, yAddress);
            const uAddress = await yvault.token();
            const uToken = await ethers.getContractAt(artifacts.ERC20.abi, uAddress);
            const decimals = await uToken.decimals();
            const uAmount = oneToken(decimals);
            const uimpl = ((yvaults[i].uimpl || "") != "") ? yvaults[i].uimpl : uAddress;
            const blacklistAddress = yvaults[i].blacklist || ZERO_ADDRESS;
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
            await uToken.connect(policyholder3).approve(yvault.address, constants.MaxUint256);
            await yvault.connect(policyholder3).deposit(uAmount);
            expect(await uToken.balanceOf(policyholder3.address)).to.be.equal(0);
            const aAmount = await yvault.balanceOf(policyholder3.address);
            expect(aAmount).to.be.gt(0);
            // create policy
            await product.connect(policyholder3).buyPolicy(policyholder3.address, coverAmount, blocks, yAddress, { value: expectedPremium });
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
        await hre.network.provider.request({method: "hardhat_stopImpersonatingAccount",params: [policyholder3Address]});
        if(failList.length != 0) {
          console.log("supported vaults:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
          console.log("unsupported vaults:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
        }
        expect(`${success}/${yvaults.length} supported vaults`).to.equal(`${yvaults.length}/${yvaults.length} supported vaults`);
      });
    });
  })
}

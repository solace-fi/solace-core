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

import { expectClose } from "./utilities/chai_extensions";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, AaveV2Product, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { getDomainSeparator, sign } from "./utilities/signature";
import { ECDSASignature } from "ethereumjs-util";

const EXCHANGE_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("AaveV2ProductExchange(uint256 policyID,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

const toBytes32 = (bn: BN) => {
  return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
};

const setStorageAt = async (address: string, index: string, value: string) => {
  index = ethers.utils.hexStripZeros(index);
  await ethers.provider.send("hardhat_setStorageAt", [address, index, value]);
  await ethers.provider.send("evm_mine", []); // Just mines to the next block
};

// Returns the EIP712 hash which should be signed by the authorized signer
// in order to make a call to AaveV2Product.submitClaim()
function getSubmitClaimDigest(
    name: string,
    address: string,
    chainId: number,
    policyID: BigNumberish,
    amountOut: BigNumberish,
    deadline: BigNumberish
    ) {
    const DOMAIN_SEPARATOR = getDomainSeparator(name, address, chainId)
    return utils.keccak256(
        utils.solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
            '0x19',
            '0x01',
            DOMAIN_SEPARATOR,
            utils.keccak256(
            utils.defaultAbiCoder.encode(
                ['bytes32', 'uint256', 'uint256','uint256'],
                [EXCHANGE_TYPEHASH, policyID, amountOut, deadline]
            )
            ),
        ]
        )
    )
}

if(process.env.FORK_NETWORK === "mainnet"){
  describe('AaveV2Product', () => {
    const [deployer, user, user2, paclasSigner] = provider.getWallets();
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

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const AAVE_DATA_PROVIDER = "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const price = 11044; // 2.60%/yr

    const aWETH_ADDRESS = "0x030ba81f1c18d280636f32af80b9aad02cf0854e";
    const USER1 = "0xd85e821b874cff4880031b96601dc73bfe92f48c";
    const BALANCE1 = BN.from("49630710460431870110");

    const aUSDT_ADDRESS = "0x3ed3b47dd13ec9a98b44e6204a523e766b225811";
    const USER2 = "0x2edce9a8e7991b9fd6074aece928d5a9040ed98d";
    const BALANCE2 = BN.from("158414918763560000");

    const aLINK_ADDRESS = "0xa06bC25B5805d5F8d82847D191Cb4Af5A3e873E0"; // proxy
    const LINK_ADDRESS = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
    const LENDING_POOL_ADDRESS = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

    const COOLDOWN_PERIOD = 3600; // one hour

    before(async () => {
      artifacts = await import_artifacts();

      // deploy policy manager
      policyManager = (await deployContract(
        deployer,
        artifacts.PolicyManager,
        [
          deployer.address
        ]
      )) as PolicyManager;

      // deploy weth
      weth = (await deployContract(
          deployer,
          artifacts.WETH
      )) as Weth9;

      // deploy registry contract
      let registryContract = await ethers.getContractFactory("Registry");
      registry = (await upgrades.deployProxy(registryContract, [deployer.address], { kind: "uups" })) as Registry;

      // deploy vault
      vault = (await deployContract(
        deployer,
        artifacts.Vault,
        [
          deployer.address,
          registry.address,
          weth.address
        ]
      )) as Vault;

      // deploy claims escrow
      claimsEscrow = (await deployContract(
          deployer,
          artifacts.ClaimsEscrow,
          [deployer.address, registry.address]
      )) as ClaimsEscrow;

      // deploy treasury contract
      treasury = (await deployContract(
        deployer,
        artifacts.Treasury,
        [
          deployer.address,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          weth.address
        ]
      )) as Treasury;

      // deploy risk manager contract
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [deployer.address, registry.address])) as RiskManager;

      // deploy Aave V2 Product
      product = (await deployContract(
        deployer,
        artifacts.AaveV2Product,
        [
          deployer.address,
          policyManager.address,
          registry.address,
          AAVE_DATA_PROVIDER,
          minPeriod,
          maxPeriod,
          price,
          1
        ]
      )) as unknown as AaveV2Product;

      product2 = (await deployContract(
        deployer,
        artifacts.AaveV2Product,
        [
          deployer.address,
          policyManager.address,
          registry.address,
          AAVE_DATA_PROVIDER,
          minPeriod,
          maxPeriod,
          price,
          1
        ]
      )) as unknown as AaveV2Product;

      // fetch contracts
      alink = await ethers.getContractAt(artifacts.AToken.abi, aLINK_ADDRESS);
      link = await ethers.getContractAt(artifacts.ERC20.abi, LINK_ADDRESS);
      lendingPool = await ethers.getContractAt(artifacts.LendingPool.abi, LENDING_POOL_ADDRESS);

      await registry.setVault(vault.address);
      await deployer.sendTransaction({to:vault.address,value:maxCoverAmount});
      await registry.setClaimsEscrow(claimsEscrow.address);
      await registry.setTreasury(treasury.address);
      await registry.setPolicyManager(policyManager.address);
      await registry.setRiskManager(riskManager.address);
      await riskManager.setProductWeights([product.address],[1]);
      await product.addSigner(paclasSigner.address);
    })

    describe("appraisePosition", function () {
      it("reverts if invalid pool or token", async function () {
        await expect(product.appraisePosition(user.address, ZERO_ADDRESS)).to.be.reverted;
        await expect(product.appraisePosition(user.address, user.address)).to.be.reverted;
      });
      it("no positions should have no value", async function () {
        expect(await product.appraisePosition(user.address, aWETH_ADDRESS)).to.equal(0);
      });
      it("a position should have a value", async function () {
        expectClose(await product.appraisePosition(USER1, aWETH_ADDRESS), BALANCE1, BN.from("100000000000"))
        expectClose(await product.appraisePosition(USER2, aUSDT_ADDRESS), BALANCE2, BN.from("100000000000"))
      });
    });

    describe("covered platform", function () {
      it("starts as aave data provider", async function () {
        expect(await product.coveredPlatform()).to.equal(AAVE_DATA_PROVIDER);
        expect(await product.aaveDataProvider()).to.equal(AAVE_DATA_PROVIDER);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(user).setCoveredPlatform(user.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(deployer).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.aaveDataProvider()).to.equal(treasury.address);
        await product.connect(deployer).setCoveredPlatform(AAVE_DATA_PROVIDER);
      });
    });

    describe('implementedFunctions', function () {
      it('can getQuote', async function () {
        let price = BN.from(await product.price());
        let positionAmount = await product.appraisePosition(USER1, aWETH_ADDRESS);
        let coverAmount = positionAmount.mul(5000).div(10000);
        let blocks = BN.from(threeDays)
        let expectedPremium = BN.from("5303076154194467");
        let quote = BN.from(await product.getQuote(USER1, aWETH_ADDRESS, coverAmount, blocks));
        expectClose(quote, expectedPremium, BN.from("1000000000"))
      })
      it('can buyPolicy', async function () {
        expect(await policyManager.totalSupply()).to.equal(0);
        expect(await policyManager.balanceOf(USER1)).to.equal(0);
        // adding the owner product to the ProductManager
        (await policyManager.connect(deployer).addProduct(product.address));
        expect(await policyManager.productIsActive(product.address)).to.equal(true);

        let positionAmount = await product.appraisePosition(USER1, aWETH_ADDRESS);
        let coverAmount = positionAmount.mul(500).div(10000);
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(USER1, aWETH_ADDRESS, coverAmount, blocks));
        quote = quote.mul(10001).div(10000);
        let tx = await product.buyPolicy(USER1, aWETH_ADDRESS, coverAmount, blocks, { value: quote });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(USER1)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let positionAmount = await product.appraisePosition(USER1, aWETH_ADDRESS);
        let coverAmount = positionAmount.mul(500).div(10000);
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(USER1, aWETH_ADDRESS, coverAmount, blocks));
        quote = quote.mul(10001).div(10000);
        let tx = await product.buyPolicy(USER1, aWETH_ADDRESS, coverAmount, blocks, { value: quote });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
      });
      it("can get product name", async function () {
        expect(await product.name()).to.equal("AaveV2");
      });
    })

    describe("submitClaim", async function () {
      let policyID1 = 3;
      let policyID2 = 4;
      let amountIn1 = BN.from(100000000000);
      let amountOut1 = 5000000000;
      before(async function () {
        await deployer.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        // create an aLink position and policy
        let index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[user.address,1]);
        await setStorageAt(LINK_ADDRESS,index,toBytes32(amountIn1.mul(2)).toString());
        await link.connect(user).transfer(user2.address, amountIn1);
        expect(await link.balanceOf(user.address)).to.equal(amountIn1);
        await link.connect(user).approve(lendingPool.address, constants.MaxUint256);
        await lendingPool.connect(user).deposit(LINK_ADDRESS, amountIn1, user.address, 0);
        expect(await link.balanceOf(user.address)).to.be.equal(0);
        expect(await alink.balanceOf(user.address)).to.be.gte(amountIn1);
        let positionAmount = await product.appraisePosition(user.address, aLINK_ADDRESS);
        let coverAmount = positionAmount;
        let blocks = threeDays;
        let quote = BN.from(await product.getQuote(user.address, aLINK_ADDRESS, coverAmount, blocks));
        quote = quote.mul(10001).div(10000);
        await product.connect(user).buyPolicy(user.address, aLINK_ADDRESS, coverAmount, blocks, { value: quote });
        // create another aLink position and policy
        expect(await link.balanceOf(user2.address)).to.equal(amountIn1);
        await link.connect(user2).approve(lendingPool.address, constants.MaxUint256);
        await lendingPool.connect(user2).deposit(LINK_ADDRESS, amountIn1, user2.address, 0);
        expect(await link.balanceOf(user2.address)).to.be.equal(0);
        expect(await alink.balanceOf(user2.address)).to.be.gte(amountIn1);
        await product.connect(user2).buyPolicy(user2.address, aLINK_ADDRESS, coverAmount, blocks, { value: quote });
      });
      it("cannot submit claim with expired signature", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, amountOut1, 0);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, 0, signature)).to.be.revertedWith("expired deadline");
      });
      it("cannot submit claim on someone elses policy", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID2, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(deployer).submitClaim(policyID2, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
      });
      it("cannot submit claim from wrong product", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product2.connect(user).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("wrong product");
      });
      it("cannot submit claim with forged signature", async function () {
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, "0x")).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, "0xabcd")).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890")).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim from unauthorized signer", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(deployer.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with changed arguments", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, "100000000000", deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline.sub(1), signature)).to.be.revertedWith("invalid signature");
      });
      it("can open a claim", async function () {
        // sign swap
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let tx1 = await product.connect(user).submitClaim(policyID1, amountOut1, deadline, signature);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID1);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID1, user.address, amountOut1);
        expect(await policyManager.exists(policyID1)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claims(policyID1)).amount).to.equal(amountOut1);
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let userEth1 = await user.getBalance();
        let tx2 = await claimsEscrow.connect(user).withdrawClaimsPayout(policyID1);
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(tx2.gasPrice || 0);
        let userEth2 = await user.getBalance();
        expectClose(userEth2.sub(userEth1).add(gasCost), amountOut1);
      });
      it("should support all atokens", async function () {
        const user3Address = "0x688514032e2cD27fbCEc700E2b10aa8D34741956";
        await hre.network.provider.request({method: "hardhat_impersonateAccount", params: [user3Address]});
        await deployer.sendTransaction({to: user3Address, value: BN.from("1000000000000000000")});
        const user3 = await ethers.getSigner(user3Address);
        var atokens = [
          {"symbol":"aUSDT","address":"0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811"},
          {"symbol":"aWBTC","address":"0x9ff58f4fFB29fA2266Ab25e75e2A8b3503311656"},
          {"symbol":"aWETH","address":"0x030bA81f1c18d280636F32af80b9AAd02Cf0854e"},
          {"symbol":"aYFI","address":"0x5165d24277cD063F5ac44Efd447B27025e888f37"},
          {"symbol":"aZRX","address":"0xDf7FF54aAcAcbFf42dfe29DD6144A69b629f8C9e"},
          {"symbol":"aUNI","address":"0xB9D7CB55f463405CDfBe4E90a6D2Df01C2B92BF1"},
          {"symbol":"aAAVE","address":"0xFFC97d72E13E01096502Cb8Eb52dEe56f74DAD7B"},
          {"symbol":"aBAT","address":"0x05Ec93c0365baAeAbF7AefFb0972ea7ECdD39CF1"},
          {"symbol":"aBUSD","address":"0xA361718326c15715591c299427c62086F69923D9"},
          {"symbol":"aDAI","address":"0x028171bCA77440897B824Ca71D1c56caC55b68A3"},
          {"symbol":"aENJ","address":"0xaC6Df26a590F08dcC95D5a4705ae8abbc88509Ef"},
          {"symbol":"aKNC","address":"0x39C6b3e42d6A679d7D776778Fe880BC9487C2EDA"},
          {"symbol":"aLINK","address":"0xa06bC25B5805d5F8d82847D191Cb4Af5A3e873E0"},
          {"symbol":"aMANA","address":"0xa685a61171bb30d4072B338c80Cb7b2c865c873E"},
          {"symbol":"aMKR","address":"0xc713e5E149D5D0715DcD1c156a020976e7E56B88"},
          {"symbol":"aREN","address":"0xCC12AbE4ff81c9378D670De1b57F8e0Dd228D77a"},
          {"symbol":"aSNX","address":"0x35f6B052C598d933D69A4EEC4D04c73A191fE6c2","uimpl":"0x5b1b5fEa1b99D83aD479dF0C222F0492385381dD"},
          {"symbol":"aSUSD","address":"0x6C5024Cd4F8A59110119C56f8933403A539555EB","uimpl":"0x05a9CBe762B36632b3594DA4F082340E0e5343e8"},
          {"symbol":"aTUSD","address":"0x101cc05f4A51C0319f570d5E146a8C625198e636"},
          {"symbol":"aUSDC","address":"0xBcca60bB61934080951369a648Fb03DF4F96263C","blacklist":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"},
          {"symbol":"aCRV","address":"0x8dAE6Cb04688C62d939ed9B68d32Bc62e49970b1"},
          {"symbol":"aGUSD","address":"0xD37EE7e4f452C6638c96536e68090De8cBcdb583","uimpl":"0xc42B14e49744538e3C239f8ae48A1Eaaf35e68a0"},
          {"symbol":"aBAL","address":"0x272F97b7a56a387aE942350bBC7Df5700f8a4576"},
          {"symbol":"aXSUSHI","address":"0xF256CC7847E919FAc9B808cC216cAc87CCF2f47a"},
          {"symbol":"aRENFIL","address":"0x514cd6756CCBe28772d4Cb81bC3156BA9d1744aa"}
        ];
        var success = 0;
        var successList = [];
        var failList = [];
        for(var i = 0; i < atokens.length; ++i){
          const aAddress = atokens[i].address;
          const symbol = atokens[i].symbol;
          try {
            // fetch contracts
            const aToken = await ethers.getContractAt(artifacts.AToken.abi, aAddress);
            const uAddress = await aToken.UNDERLYING_ASSET_ADDRESS();
            const uToken = await ethers.getContractAt(artifacts.ERC20.abi, uAddress);
            const decimals = await uToken.decimals();
            const uAmount = oneToken(decimals);
            const poolAddress = await aToken.POOL();
            const pool = await ethers.getContractAt(artifacts.LendingPool.abi, poolAddress);
            const uimpl = ((atokens[i].uimpl || "") != "") ? atokens[i].uimpl : uAddress;
            const blacklistAddress = atokens[i].blacklist || ZERO_ADDRESS;
            const isBlacklistable = blacklistAddress != ZERO_ADDRESS;
            // create position
            var value = toBytes32(uAmount).toString();
            for(var j = 0; j < 200; ++j) {
              try { // solidity rigged balanceOf
                var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[user3.address,j]);
                await setStorageAt(uimpl, index, value);
                var uBalance = await uToken.balanceOf(user3.address);
                if(uBalance.eq(uAmount)) break;
              } catch(e) { }
              try { // vyper rigged balanceOf
                var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[j,user3.address]);
                await setStorageAt(uimpl, index, value);
                var uBalance = await uToken.balanceOf(user3.address);
                if(uBalance.eq(uAmount)) break;
              } catch(e) { }
            }
            expect(await uToken.balanceOf(user3.address)).to.equal(uAmount);
            if(isBlacklistable) {
              const blacklistContract = await ethers.getContractAt(artifacts.Blacklist.abi, blacklistAddress);
              var value = toBytes32(BN.from(0)).toString();
              for(var j = 0; j < 200; ++j) {
                try {
                  var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[user3.address,j]);
                  await setStorageAt(uimpl, index, value);
                  var blacklisted = await blacklistContract.isBlacklisted(user3.address);
                  if(!blacklisted) break;
                } catch(e) { }
              }
              expect(await blacklistContract.isBlacklisted(user3.address)).to.be.false;
            }
            await uToken.connect(user3).approve(poolAddress, constants.MaxUint256);
            await pool.connect(user3).deposit(uAddress, uAmount, user3.address, 0);
            expect(await uToken.balanceOf(user3.address)).to.be.equal(0);
            const aAmount = await aToken.balanceOf(user3.address);
            expectClose(aAmount, uAmount, 100);
            // create policy
            let positionAmount = await product.appraisePosition(USER1, aWETH_ADDRESS);
            let coverAmount = positionAmount;
            let blocks = threeDays;
            let quote = BN.from(await product.getQuote(user3.address, aAddress, coverAmount, blocks));
            quote = quote.mul(10001).div(10000);
            await product.connect(user3).buyPolicy(user3.address, aAddress, coverAmount, blocks, { value: quote });
            let policyID = (await policyManager.totalPolicyCount()).toNumber();
            // sign swap
            let amountOut = 10000;
            let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID, amountOut, deadline);
            let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
            // submit claim
            let tx1 = await product.connect(user3).submitClaim(policyID, amountOut, deadline, signature);
            expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID);
            expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID, user3.address, amountOut);
            expect(await policyManager.exists(policyID)).to.be.false;
            // verify payout
            expect((await claimsEscrow.claims(policyID)).amount).to.equal(amountOut);
            await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
            let userEth1 = await user3.getBalance();
            let tx2 = await claimsEscrow.connect(user3).withdrawClaimsPayout(policyID);
            let receipt = await tx2.wait();
            let gasCost = receipt.gasUsed.mul(tx2.gasPrice || 0);
            let userEth2 = await user3.getBalance();
            expectClose(userEth2.sub(userEth1).add(gasCost), amountOut);
            ++success;
            successList.push(symbol);
            console.log(`\x1b[38;5;239m        ✓ ${symbol}\x1b[0m`);
          } catch (e) {
            console.log(`\x1b[31m        ✘ ${symbol}`);
            console.log('          '+e.stack.replace(/\n/g, '\n      '));
            console.log('\x1b[0m');
            failList.push(symbol);
          }
        }
        await hre.network.provider.request({method: "hardhat_stopImpersonatingAccount",params: [user3Address]});
        if(failList.length != 0) {
          console.log("supported atokens:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,''));
          console.log("unsupported atokens:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,''));
        }
        expect(`${success}/${atokens.length} supported atokens`).to.equal(`${atokens.length}/${atokens.length} supported atokens`);
      });
    });
  });
}

function buf2hex(buffer: Buffer) { // buffer is an ArrayBuffer
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function assembleSignature(parts: ECDSASignature) {
  let { v, r, s } = parts;
  let v_ = Number(v).toString(16);
  let r_ = buf2hex(r);
  let s_ = buf2hex(s);
  return `0x${r_}${s_}${v_}`;
}

function oneToken(decimals: number) {
  var s = "1";
  for(var i = 0; i < decimals; ++i) s += "0";
  return BN.from(s);
}

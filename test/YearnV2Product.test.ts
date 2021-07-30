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
import { PolicyManager, YearnV2Product, ExchangeQuoter, ExchangeQuoterManual, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { getDomainSeparator, sign } from "./utilities/signature";
import { ECDSASignature } from "ethereumjs-util";

const EXCHANGE_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("YearnV2ProductExchange(uint256 policyID,uint256 amountOut,uint256 deadline)"));

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
// in order to make a call to YearnV2Product.submitClaim()
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
  describe('YearnV2Product', () => {
    const [deployer, user, user2, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: YearnV2Product;
    let product2: YearnV2Product;
    let quoter: ExchangeQuoter;
    let quoter2: ExchangeQuoterManual;
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
    const maxCoverPerUser = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const cancelFee = BN.from("100000000000000000"); // 0.1 Ether in wei
    const price = 11044; // 2.60%/yr

    const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
    const IYREGISTRY = "0x3eE41C098f9666ed2eA246f4D2558010e59d63A0";
    const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const YDAI_ADDRESS = "0xacd43e627e64355f1861cec6d3a6688b31a6f952";
    const WHALE = "0xb7a9ee05c43bd4027ea34ca125d8c06618f8331a"; // random whale
    const WHALE_VALUE = BN.from("20451792085120037125");

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

      // deploy exchange quoter
      quoter = (await deployContract(
        deployer,
        artifacts.ExchangeQuoter,
        [
          ONE_SPLIT_VIEW
        ]
      )) as ExchangeQuoter;

      // deploy manual exchange quoter
      quoter2 = (await deployContract(
        deployer,
        artifacts.ExchangeQuoterManual,
        [
          deployer.address
        ]
      )) as ExchangeQuoterManual;
      await expect(quoter2.connect(user).setRates([],[])).to.be.revertedWith("!governance");
      await quoter2.setRates(["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359","0xc00e94cb662c3520282e6f5717214004a7f26888","0x1f9840a85d5af5bf1d1762f925bdaddc4201f984","0x514910771af9ca656af840dff83e8264ecf986ca","0x2260fac5e5542a773aa44fbcfedf7c193bc2c599","0xdac17f958d2ee523a2206206994597c13d831ec7","0x1985365e9f78359a9b6ad760e32412f4a445e862","0x0d8775f648430679a709e98d2b0cb6250d2887ef","0xe41d2489571d322189246dafa5ebde1f4699f498","0x0000000000085d4780b73119b644ae5ecd22b376","0x6b175474e89094c44da98b954eedeac495271d0f","0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],["1000000000000000000","5214879005539865","131044789678131649","9259278326749300","9246653217422099","15405738054265288944","420072999319953","12449913804491249","281485209795972","372925580282399","419446558886231","205364954059859","50000000000000"]);

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
          weth.address,
          ZERO_ADDRESS
        ]
      )) as Treasury;

      // deploy risk manager contract
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [deployer.address, registry.address])) as RiskManager;

      // deploy YearnV2 Product
      product = (await deployContract(
        deployer,
        artifacts.YearnV2Product,
        [
          deployer.address,
          policyManager.address,
          registry.address,
          IYREGISTRY,
          minPeriod,
          maxPeriod,
          price,
          1,
          quoter.address
        ]
      )) as YearnV2Product;

      // deploy another YearnV2 Product
      product2 = (await deployContract(
        deployer,
        artifacts.YearnV2Product,
        [
          deployer.address,
          policyManager.address,
          registry.address,
          IYREGISTRY,
          minPeriod,
          maxPeriod,
          price,
          1,
          quoter.address
        ]
      )) as YearnV2Product;

      // fetch contracts
      dai = await ethers.getContractAt(artifacts.ERC20.abi, DAI_ADDRESS);
      ydai = await ethers.getContractAt(artifacts.YVault.abi, YDAI_ADDRESS);

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
      })

      it("no positions should have no value", async function () {
        expect(await product.appraisePosition(user.address, YDAI_ADDRESS)).to.equal(0);
      })

      it("a position should have a value", async function () {
        expect(await product.appraisePosition(WHALE, YDAI_ADDRESS)).to.equal(WHALE_VALUE);
      })
    })

    describe("covered platform", function () {
      it("starts as yearn registry", async function () {
        expect(await product.coveredPlatform()).to.equal(IYREGISTRY);
        expect(await product.yregistry()).to.equal(IYREGISTRY);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(user).setCoveredPlatform(user.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(deployer).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.yregistry()).to.equal(treasury.address);
        await product.connect(deployer).setCoveredPlatform(IYREGISTRY);
      });
    });

    describe('implementedFunctions', function () {
      it("can get product name", async function () {
        expect(await product.name()).to.equal("YearnV2");
      });
      it('can getQuote', async function () {
        let coverLimit = 5000 // cover 50% of the position
        let blocks = BN.from(threeDays)
        let expectedPremium = BN.from("2185288300549535");
        let quote = BN.from(await product.getQuote(WHALE, YDAI_ADDRESS, coverLimit, blocks));
        expectClose(quote, expectedPremium, BN.from("1000000000"))
      })
      it('can buyPolicy', async function () {
        expect(await policyManager.totalSupply()).to.equal(0);
        expect(await policyManager.balanceOf(WHALE)).to.equal(0);
        // adding the owner product to the ProductManager
        (await policyManager.connect(deployer).addProduct(product.address));
        expect(await policyManager.productIsActive(product.address)).to.equal(true);

        let coverLimit = 500 // cover 5% of the position
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(WHALE, YDAI_ADDRESS, coverLimit, blocks));
        quote = quote.mul(10001).div(10000);
        let tx = await product.buyPolicy(WHALE, YDAI_ADDRESS, coverLimit, blocks, { value: quote });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(WHALE)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let coverLimit = 500 // cover 5% of the position
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(WHALE, YDAI_ADDRESS, coverLimit, blocks));
        quote = quote.mul(10001).div(10000);
        let tx = await product.buyPolicy(WHALE, YDAI_ADDRESS, coverLimit, blocks, { value: quote });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
      });
    })

    describe("submitClaim", async function () {
      let policyID1 = 3;
      let policyID2 = 4;
      let daiAmount = BN.from(100000000000);
      let amountOut1 = 5000000000;
      before(async function () {
        await deployer.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        // create a dai position and policy
        let index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[user.address,2]);
        await setStorageAt(DAI_ADDRESS,index,toBytes32(daiAmount.mul(2)).toString());
        await dai.connect(user).transfer(user2.address, daiAmount);
        expect(await dai.balanceOf(user.address)).to.equal(daiAmount);
        await dai.connect(user).approve(ydai.address, constants.MaxUint256);
        await ydai.connect(user).deposit(daiAmount);
        let coverLimit = 10000;
        let blocks = threeDays;
        let quote = BN.from(await product.getQuote(user.address, YDAI_ADDRESS, coverLimit, blocks));
        quote = quote.mul(10001).div(10000);
        await product.connect(user).buyPolicy(user.address, YDAI_ADDRESS, coverLimit, blocks, { value: quote });
        // create another dai position and policy
        expect(await dai.balanceOf(user2.address)).to.equal(daiAmount);
        await dai.connect(user2).approve(ydai.address, constants.MaxUint256);
        await ydai.connect(user2).deposit(daiAmount);
        await product.connect(user2).buyPolicy(user2.address, YDAI_ADDRESS, coverLimit, blocks, { value: quote });
      });
      it("cannot submit claim with expired signature", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-YearnV2Product", product.address, chainId, policyID1, amountOut1, 0);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, 0, signature)).to.be.revertedWith("expired deadline");
      });
      it("cannot submit claim on someone elses policy", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-YearnV2Product", product.address, chainId, policyID2, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(deployer).submitClaim(policyID2, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
      });
      it("cannot submit claim from wrong product", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-YearnV2Product", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product2.connect(user).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("wrong product");
      });
      it("cannot submit claim with forged signature", async function () {
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, "0x")).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, "0xabcd")).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890")).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim from unauthorized signer", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-YearnV2Product", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(deployer.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with changed arguments", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-YearnV2Product", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, "100000000000", deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline.sub(1), signature)).to.be.revertedWith("invalid signature");
      });
      it("can open a claim", async function () {
        // sign swap
        let digest = getSubmitClaimDigest("Solace.fi-YearnV2Product", product.address, chainId, policyID1, amountOut1, deadline);
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
      it("should support all yearn vaults", async function () {
        const user3Address = "0x688514032e2cD27fbCEc700E2b10aa8D34741956";
        await hre.network.provider.request({method: "hardhat_impersonateAccount", params: [user3Address]});
        await deployer.sendTransaction({to: user3Address, value: BN.from("1000000000000000000")});
        const user3 = await ethers.getSigner(user3Address);
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
          {"symbol":"yGUSD","address":"0xec0d8d3ed5477106c6d4ea27d90a60e594693c90","uimpl":"0xc42B14e49744538e3C239f8ae48A1Eaaf35e68a0"}, // gusd is proxy
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
            await uToken.connect(user3).approve(yvault.address, constants.MaxUint256);
            await yvault.connect(user3).deposit(uAmount);
            expect(await uToken.balanceOf(user3.address)).to.be.equal(0);
            const aAmount = await yvault.balanceOf(user3.address);
            expect(aAmount).to.be.gt(0);
            // create policy
            let coverLimit = 10000;
            let blocks = threeDays;
            let quote = BN.from(await product.getQuote(user3.address, yAddress, coverLimit, blocks));
            quote = quote.mul(10001).div(10000);
            await product.connect(user3).buyPolicy(user3.address, yAddress, coverLimit, blocks, { value: quote });
            let policyID = (await policyManager.totalPolicyCount()).toNumber();
            // sign swap
            let amountOut = 10000;
            let digest = getSubmitClaimDigest("Solace.fi-YearnV2Product", product.address, chainId, policyID, amountOut, deadline);
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
          console.log("supported vaults:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,''));
          console.log("unsupported vaults:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,''));
        }
        expect(`${success}/${yvaults.length} supported vaults`).to.equal(`${yvaults.length}/${yvaults.length} supported vaults`);
      });
    });
  })
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

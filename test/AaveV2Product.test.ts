import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Contract, utils, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { expectClose } from "./utilities/chai_extensions";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, AaveV2Product, ExchangeQuoter, ExchangeQuoterManual, Treasury, Weth9, ClaimsEscrow, Registry, Vault } from "../typechain";
import { getDomainSeparator, sign } from "./utilities/signature";
import { ECDSASignature } from "ethereumjs-util";

const EXCHANGE_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("AaveV2ProductExchange(uint256 policyID,address tokenIn,uint256 amountIn,address tokenOut,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;
const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const toBytes32 = (bn: BN) => {
  return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
};

const setStorageAt = async (address: string, index: BigNumberish, value: string) => {
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
    tokenIn: string,
    amountIn: BigNumberish,
    tokenOut: string,
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
                ['bytes32', 'uint256', 'address', 'uint256', 'address', 'uint256','uint256'],
                [EXCHANGE_TYPEHASH, policyID, tokenIn, amountIn, tokenOut, amountOut, deadline]
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
    let quoter: ExchangeQuoter;
    let quoter2: ExchangeQuoterManual;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let alink: Contract;
    let link: Contract;
    let lendingPool: Contract;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const AAVE_DATA_PROVIDER = "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const maxCoverPerUser = BN.from("10000000000000000000"); // 10 Ether in wei
    const cancelFee = BN.from("100000000000000000"); // 0.1 Ether in wei
    const price = 11044; // 2.60%/yr

    const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
    const aWETH_ADDRESS = "0x030ba81f1c18d280636f32af80b9aad02cf0854e";
    const USER1 = "0xd85e821b874cff4880031b96601dc73bfe92f48c";
    const BALANCE1 = BN.from("49630710460431870110");

    const aUSDT_ADDRESS = "0x3ed3b47dd13ec9a98b44e6204a523e766b225811";
    const USER2 = "0x2edce9a8e7991b9fd6074aece928d5a9040ed98d";
    const BALANCE2 = BN.from("159423625168150219");

    const aLINK_ADDRESS = "0xa06bC25B5805d5F8d82847D191Cb4Af5A3e873E0"; // proxy
    //const aLINK_PROXY_ADDRESS = "0xa06bC25B5805d5F8d82847D191Cb4Af5A3e873E0"; // proxy
    //const aLINK_IMPL_ADDRESS = "0x37Fe4e17A70945b42D1753690b698C3f22B48C87"; // implementation
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
      registry = (await deployContract(
        deployer,
        artifacts.Registry,
        [
          deployer.address
        ]
      )) as Registry;

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

      // deploy Aave V2 Product
      product = (await deployContract(
        deployer,
        artifacts.AaveV2Product,
        [
          deployer.address,
          policyManager.address,
          registry.address,
          LENDING_POOL_ADDRESS,
          maxCoverAmount,
          maxCoverPerUser,
          minPeriod,
          maxPeriod,
          cancelFee,
          price,
          quoter.address,
          AAVE_DATA_PROVIDER
        ]
      )) as unknown as AaveV2Product;

      product2 = (await deployContract(
        deployer,
        artifacts.AaveV2Product,
        [
          deployer.address,
          policyManager.address,
          treasury.address,
          LENDING_POOL_ADDRESS,
          maxCoverAmount,
          maxCoverPerUser,
          minPeriod,
          maxPeriod,
          cancelFee,
          price,
          quoter.address,
          AAVE_DATA_PROVIDER
        ]
      )) as unknown as AaveV2Product;

      // fetch contracts
      alink = await ethers.getContractAt(artifacts.ERC20.abi, aLINK_ADDRESS);
      link = await ethers.getContractAt(artifacts.ERC20.abi, LINK_ADDRESS);
      lendingPool = await ethers.getContractAt(artifacts.LendingPool.abi, LENDING_POOL_ADDRESS);

      await registry.setVault(vault.address);
      await registry.setClaimsEscrow(claimsEscrow.address);
      await registry.setTreasury(treasury.address);
      await registry.setPolicyManager(policyManager.address);
      await product.connect(deployer).addSigner(paclasSigner.address);
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
        let coverLimit = 5000 // cover 50% of the position
        let blocks = BN.from(threeDays)
        let expectedPremium = BN.from("5303076154194467");
        let quote = BN.from(await product.getQuote(USER1, aWETH_ADDRESS, coverLimit, blocks));
        expectClose(quote, expectedPremium, BN.from("1000000000"))
      })
      it('can buyPolicy', async function () {
        expect(await policyManager.totalSupply()).to.equal(0);
        expect(await policyManager.balanceOf(USER1)).to.equal(0);
        // adding the owner product to the ProductManager
        (await policyManager.connect(deployer).addProduct(product.address));
        expect(await policyManager.productIsActive(product.address)).to.equal(true);

        let coverLimit = 500 // cover 5% of the position
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(USER1, aWETH_ADDRESS, coverLimit, blocks));
        quote = quote.mul(10001).div(10000);
        let tx = await product.buyPolicy(USER1, aWETH_ADDRESS, coverLimit, blocks, { value: quote });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(USER1)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let coverLimit = 500 // cover 5% of the position
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(USER1, aWETH_ADDRESS, coverLimit, blocks));
        quote = quote.mul(10001).div(10000);
        let tx = await product.buyPolicy(USER1, aWETH_ADDRESS, coverLimit, blocks, { value: quote });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
      });
    })

    describe("submitClaim", function () {
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
        await alink.connect(user).approve(product.address, constants.MaxUint256);
        let coverLimit = 10000;
        let blocks = threeDays;
        let quote = BN.from(await product.getQuote(user.address, aLINK_ADDRESS, coverLimit, blocks));
        quote = quote.mul(10001).div(10000);
        await product.connect(user).buyPolicy(user.address, aLINK_ADDRESS, coverLimit, blocks, { value: quote });
        // create another aLink position and policy
        expect(await link.balanceOf(user2.address)).to.equal(amountIn1);
        await link.connect(user2).approve(lendingPool.address, constants.MaxUint256);
        await lendingPool.connect(user2).deposit(LINK_ADDRESS, amountIn1, user2.address, 0);
        expect(await link.balanceOf(user2.address)).to.be.equal(0);
        expect(await alink.balanceOf(user2.address)).to.be.gte(amountIn1);
        await product.connect(user2).buyPolicy(user2.address, aLINK_ADDRESS, coverLimit, blocks, { value: quote });
      });
      it("cannot submit claim with expired signature", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, 0);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, 0, signature)).to.be.revertedWith("expired deadline");
      });
      it("cannot submit claim on someone elses policy", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID2, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(deployer).submitClaim(policyID2, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
      });
      it("cannot submit claim from wrong product", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product2.connect(user).submitClaim(policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline, signature)).to.be.revertedWith("wrong product");
      });
      it("cannot submit claim with forged signature", async function () {
        await expect(product.connect(user).submitClaim(policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline, "0x")).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline, "0xabcd")).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline, "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890")).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim from unauthorized signer", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(deployer.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with changed arguments", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, aUSDT_ADDRESS, amountIn1, ETH, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, aLINK_ADDRESS, 0, ETH, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, aLINK_ADDRESS, amountIn1, LINK_ADDRESS, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, aLINK_ADDRESS, amountIn1, ETH, "100000000000", deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline.sub(1), signature)).to.be.revertedWith("invalid signature");
      });
      it("can open a claim", async function () {
        // sign swap
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let userAlink1 = await alink.balanceOf(user.address);
        let userLink1 = await link.balanceOf(user.address);
        let tx1 = await product.connect(user).submitClaim(policyID1, aLINK_ADDRESS, amountIn1, ETH, amountOut1, deadline, signature);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID1);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID1, user.address, amountOut1);
        expect(await policyManager.exists(policyID1)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claims(policyID1)).amount).to.equal(amountOut1);
        let userAlink2 = await alink.balanceOf(user.address);
        expect(userAlink1.sub(userAlink2)).to.equal(amountIn1);
        let userLink2 = await link.balanceOf(user.address);
        expect(userLink2.sub(userLink1)).to.equal(amountIn1); // redeem value
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let userEth1 = await user.getBalance();
        let tx2 = await claimsEscrow.connect(user).withdrawClaimsPayout(policyID1);
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(tx2.gasPrice || 0);
        let userEth2 = await user.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut1);
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

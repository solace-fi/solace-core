import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, utils, constants, Contract } from "ethers";
import { ECDSASignature, ecsign } from 'ethereumjs-util';
import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { config as dotenv_config } from 'dotenv';
dotenv_config();

import { expectClose } from "./utilities/chai_extensions";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, CompoundProduct, ExchangeQuoter, ExchangeQuoterManual, Treasury, Weth9, ClaimsEscrow, Registry, Vault } from "../typechain";

const EXCHANGE_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("CompoundProductExchange(uint256 policyID,address tokenIn,uint256 amountIn,address tokenOut,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;
const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Returns the EIP712 hash which should be signed by the authorized signer
// in order to make a call to CompoundProduct.submitClaim()
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
  describe('CompoundProduct', () => {
    const [deployer, user, user2, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: CompoundProduct;
    let product2: CompoundProduct;
    let quoter: ExchangeQuoter;
    let quoter2: ExchangeQuoterManual;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let comptroller: Contract;
    let ceth: Contract;
    let cusdc: Contract;
    let usdc: Contract;
    let uniswapRouter: Contract;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const maxCoverPerUser = BN.from("10000000000000000000"); // 10 Ether in wei
    const cancelFee = BN.from("100000000000000000"); // 0.1 Ether in wei
    const price = 11044; // 2.60%/yr

    const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
    const COMPTROLLER_ADDRESS = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";

    const cETH_ADDRESS = "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5";
    const USER1 = "0xa0f75491720835b36edc92d06ddc468d201e9b73";
    const BALANCE1  = BN.from("16205226886284201139348");
    const BALANCE11 = BN.from("16205226886284201139348");
    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

    const cDAI_ADDRESS = "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643";
    const USER2 = "0xda3059e065781976845359154cc3aae1d0e99289";
    const BALANCE2  = BN.from("5225311707193538431924");
    const BALANCE12 = BN.from("4002346288470480898590");

    const cUSDC_ADDRESS = "0x39AA39c021dfbaE8faC545936693aC917d5E7563"
    const USER3 = "0x416f4d9d9a6c595e24aef284672ef3c98eda6bb0";
    const BALANCE3  = BN.from("17486774897559620002");
    const BALANCE13 = BN.from("2271845248250000000");
    const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

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
          weth.address,
          ZERO_ADDRESS
        ]
      )) as Treasury;

      // deploy Compound Product
      product = (await deployContract(
        deployer,
        artifacts.CompoundProduct,
        [
          deployer.address,
          policyManager.address,
          registry.address,
          COMPTROLLER_ADDRESS,
          maxCoverAmount,
          maxCoverPerUser,
          minPeriod,
          maxPeriod,
          cancelFee,
          price,
          quoter.address
        ]
      )) as CompoundProduct;

      product2 = (await deployContract(
        deployer,
        artifacts.CompoundProduct,
        [
          deployer.address,
          policyManager.address,
          registry.address,
          COMPTROLLER_ADDRESS,
          maxCoverAmount,
          maxCoverPerUser,
          minPeriod,
          maxPeriod,
          cancelFee,
          price,
          quoter.address
        ]
      )) as CompoundProduct;

      // fetch contracts
      comptroller = await ethers.getContractAt(artifacts.IComptrollerRinkeby.abi, COMPTROLLER_ADDRESS);
      ceth = await ethers.getContractAt(artifacts.ICETH.abi, cETH_ADDRESS);
      cusdc = await ethers.getContractAt(artifacts.ICERC20.abi, cUSDC_ADDRESS);
      usdc = await ethers.getContractAt(artifacts.ERC20.abi, USDC_ADDRESS);
      uniswapRouter = await ethers.getContractAt(artifacts.SwapRouter.abi, "0xE592427A0AEce92De3Edee1F18E0157C05861564");

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
      })

      it("no positions should have no value", async function () {
        expect(await product.appraisePosition(user.address, cETH_ADDRESS)).to.equal(0);
      })

      it("a position should have a value", async function () {
        expect(await product.appraisePosition(USER1, cETH_ADDRESS)).to.equal(BALANCE1);
        expect(await product.appraisePosition(USER2, cDAI_ADDRESS)).to.equal(BALANCE2);
        expect(await product.appraisePosition(USER3, cUSDC_ADDRESS)).to.equal(BALANCE3);
      })

      it("can change quoters", async function () {
        await expect(product.connect(user).setExchangeQuoter(quoter2.address)).to.be.revertedWith("!governance");
        await product.setExchangeQuoter(quoter2.address);
        expect(await product.appraisePosition(USER1, cETH_ADDRESS)).to.equal(BALANCE11);
        expect(await product.appraisePosition(USER2, cDAI_ADDRESS)).to.equal(BALANCE12);
        expect(await product.appraisePosition(USER3, cUSDC_ADDRESS)).to.equal(BALANCE13);
      })
    })

    describe('implementedFunctions', function () {
      it('can getQuote', async function () {
        let price = BN.from(await product.price());
        let coverLimit = 1 // cover 0.01% of the position
        let blocks = BN.from(threeDays)
        let expectedPremium = BN.from("346307967291657");
        let quote = BN.from(await product.getQuote(USER1, cETH_ADDRESS, coverLimit, blocks))
        expect(quote).to.equal(expectedPremium);
      })

      it('can buyPolicy', async function () {
        expect(await policyManager.totalSupply()).to.equal(0);
        expect(await policyManager.balanceOf(USER1)).to.equal(0);
        // adding the owner product to the ProductManager
        (await policyManager.connect(deployer).addProduct(product.address));
        expect(await policyManager.productIsActive(product.address)).to.equal(true);

        let coverLimit = 1 // cover 0.01% of the position
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(USER1, cETH_ADDRESS, coverLimit, blocks));
        let res = (await product.buyPolicy(USER1, cETH_ADDRESS, coverLimit, blocks, { value: quote }));
        let receipt = await res.wait()
        if(receipt.events) {
          var event = receipt.events.filter(event => event.event == "PolicyCreated")[0]
          if(event.args) {
            expect(event.args[0]).to.equal(1); // policyID
          }
        }
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(USER1)).to.equal(1);
      })

      it("can buy duplicate policy", async function () {
        let coverLimit = 1 // cover 0.01% of the position
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(USER1, cETH_ADDRESS, coverLimit, blocks));
        await product.buyPolicy(USER1, cETH_ADDRESS, coverLimit, blocks, { value: quote });
      })

      it("can get product name", async function () {
        expect(await product.name()).to.equal("Compound");
      });
    })

    describe("submitClaim", function () {
      let policyID1 = 3;
      let policyID2 = 4;
      let policyID3 = 5;
      let amountIn1 = 4989293;
      let amountOut1 = 5000000;
      let amountIn2 = 10000000;
      let amountOut2 = 50000000;
      let amountIn3 = 300000;
      let amountOut3 = 1000000;

      before(async function () {
        await deployer.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        // create a cETH position and policy
        await ceth.connect(user).mint({value: BN.from("1000000000000000")});
        expect(await ceth.balanceOf(user.address)).to.be.gte(amountIn1);
        await ceth.connect(user).approve(product.address, constants.MaxUint256);
        let coverLimit = 10000
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(user.address, cETH_ADDRESS, coverLimit, blocks));
        await product.connect(user).buyPolicy(user.address, cETH_ADDRESS, coverLimit, blocks, { value: quote });
        // create a cUSDC position and policy
        var ethIn = "1000000000000000000";
        await uniswapRouter.connect(user).exactInputSingle({
          tokenIn: WETH_ADDRESS,
          tokenOut: USDC_ADDRESS,
          fee: 3000,
          recipient: user.address,
          deadline: deadline,
          amountIn: ethIn,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0
        }, {value: ethIn});
        let usdcBalance = await usdc.balanceOf(user.address);
        expect(usdcBalance).to.be.gt(0);
        await usdc.connect(user).approve(cUSDC_ADDRESS, constants.MaxUint256)
        await cusdc.connect(user).mint(usdcBalance);
        expect(usdcBalance).to.be.gte(amountIn2);
        await cusdc.connect(user).approve(product.address, constants.MaxUint256);
        quote = BN.from(await product.getQuote(user.address, cUSDC_ADDRESS, coverLimit, blocks));
        await product.connect(user).buyPolicy(user.address, cUSDC_ADDRESS, coverLimit, blocks, { value: quote });
        // create another cUSDC position and policy
        var ethIn = "100000000000";
        await uniswapRouter.connect(user2).exactInputSingle({
          tokenIn: WETH_ADDRESS,
          tokenOut: USDC_ADDRESS,
          fee: 3000,
          recipient: user2.address,
          deadline: deadline,
          amountIn: ethIn,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0
        }, {value: ethIn});
        usdcBalance = await usdc.balanceOf(user2.address);
        expect(usdcBalance).to.be.gt(0);
        await usdc.connect(user2).approve(cUSDC_ADDRESS, constants.MaxUint256)
        await cusdc.connect(user2).mint(usdcBalance);
        let cusdcBalance = await cusdc.balanceOf(user2.address);
        expect(cusdcBalance).to.be.gte(amountIn3);
        await cusdc.connect(user2).approve(product.address, constants.MaxUint256);
        quote = BN.from(await product.getQuote(user2.address, cUSDC_ADDRESS, coverLimit, blocks));
        await product.connect(user2).buyPolicy(user2.address, cUSDC_ADDRESS, coverLimit, blocks, { value: quote });
      });
      it("cannot submit claim with expired signature", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-CompoundProduct", product.address, chainId, policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, 0);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, 0, signature)).to.be.revertedWith("expired deadline");
      });
      it("cannot submit claim on someone elses policy", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-CompoundProduct", product.address, chainId, policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(deployer).submitClaim(policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
      });
      it("cannot submit claim from wrong product", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-CompoundProduct", product.address, chainId, policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product2.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline, signature)).to.be.revertedWith("wrong product");
      });
      it("cannot submit claim with forged signature", async function () {
        await expect(product.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline, "0x")).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline, "0xabcd")).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline, "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890")).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim from unauthorized signer", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-CompoundProduct", product.address, chainId, policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(deployer.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with changed arguments", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-CompoundProduct", product.address, chainId, policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, cUSDC_ADDRESS, amountIn1, ETH, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn2, ETH, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn1, USDC_ADDRESS, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut2, deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline.sub(1), signature)).to.be.revertedWith("invalid signature");
      });
      it("can open a claim on a cETH position", async function () {
        // sign swap
        let digest = getSubmitClaimDigest("Solace.fi-CompoundProduct", product.address, chainId, policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let userCeth1 = await ceth.balanceOf(user.address);
        let userEth0 = await user.getBalance();
        let tx1 = await product.connect(user).submitClaim(policyID1, cETH_ADDRESS, amountIn1, ETH, amountOut1, deadline, signature);
        let receipt1 = await tx1.wait();
        let gasCost1 = receipt1.gasUsed.mul(tx1.gasPrice || 0);
        let userEth1 = await user.getBalance();
        expect(userEth1.sub(userEth0).add(gasCost1)).to.equal(999999896791746); // redeem value
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID1);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID1, user.address, amountOut1);
        expect(await policyManager.exists(policyID1)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claims(policyID1)).amount).to.equal(amountOut1);
        let userCeth2 = await ceth.balanceOf(user.address);
        expect(userCeth1.sub(userCeth2)).to.equal(amountIn1);
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let tx2 = await claimsEscrow.connect(user).withdrawClaimsPayout(policyID1);
        expect(await claimsEscrow.exists(policyID1)).to.be.false;
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(tx2.gasPrice || 0);
        let userEth2 = await user.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut1);
      });
      it("can open a claim on a cERC20 position", async function () {
        // sign swap
        let digest = getSubmitClaimDigest("Solace.fi-CompoundProduct", product.address, chainId, policyID2, cUSDC_ADDRESS, amountIn2, ETH, amountOut2, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let userCusdc1 = await cusdc.balanceOf(user.address);
        let userUsdc1 = await usdc.balanceOf(user.address);
        let tx1 = await product.connect(user).submitClaim(policyID2, cUSDC_ADDRESS, amountIn2, ETH, amountOut2, deadline, signature);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID2);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID2, user.address, amountOut2);
        expect(await policyManager.exists(policyID2)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claims(policyID2)).amount).to.equal(amountOut2);
        let userCusdc2 = await cusdc.balanceOf(user.address);
        expect(userCusdc1.sub(userCusdc2)).to.equal(amountIn2);
        let userUsdc2 = await usdc.balanceOf(user.address);
        expect(userUsdc2.sub(userUsdc1)).to.equal(2202); // redeem value
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let userEth1 = await user.getBalance();
        let tx2 = await claimsEscrow.connect(user).withdrawClaimsPayout(policyID2);
        expect(await claimsEscrow.exists(policyID2)).to.be.false;
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(tx2.gasPrice || 0);
        let userEth2 = await user.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut2);
      });
      it("can open another claim on a cERC20 position", async function () {
        // sign swap
        let digest = getSubmitClaimDigest("Solace.fi-CompoundProduct", product.address, chainId, policyID3, cUSDC_ADDRESS, amountIn3, ETH, amountOut3, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let userCusdc1 = await cusdc.balanceOf(user2.address);
        let userUsdc1 = await usdc.balanceOf(user2.address);
        let tx1 = await product.connect(user2).submitClaim(policyID3, cUSDC_ADDRESS, amountIn3, ETH, amountOut3, deadline, signature);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID3);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID3, user2.address, amountOut3);
        expect(await policyManager.exists(policyID3)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claims(policyID3)).amount).to.equal(amountOut3);
        let userCusdc2 = await cusdc.balanceOf(user2.address);
        expect(userCusdc1.sub(userCusdc2)).to.equal(amountIn3);
        let userUsdc2 = await usdc.balanceOf(user2.address);
        expect(userUsdc2.sub(userUsdc1)).to.equal(66); // redeem value
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let userEth1 = await user2.getBalance();
        let tx2 = await claimsEscrow.connect(user2).withdrawClaimsPayout(policyID3);
        expect(await claimsEscrow.exists(policyID3)).to.be.false;
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(tx2.gasPrice || 0);
        let userEth2 = await user2.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut3);
      });
    })

    describe("covered platform", function () {
      it("starts as comptroller", async function () {
        expect(await product.coveredPlatform()).to.equal(COMPTROLLER_ADDRESS);
        expect(await product.comptroller()).to.equal(COMPTROLLER_ADDRESS);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(user).setCoveredPlatform(user.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(deployer).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.comptroller()).to.equal(treasury.address);
        await product.connect(deployer).setCoveredPlatform(COMPTROLLER_ADDRESS);
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

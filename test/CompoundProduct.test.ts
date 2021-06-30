import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, utils, constants } from "ethers";
import { ECDSASignature, ecsign } from 'ethereumjs-util';
import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { config as dotenv_config } from 'dotenv';
dotenv_config();

import { expectClose } from "./utilities/chai_extensions";

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, CompoundProduct, CompoundProductRinkeby, ExchangeQuoter, ExchangeQuoterManual, Treasury, Weth9, ClaimsEscrow, Registry, Vault } from "../typechain";

const EXCHANGE_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("CompoundProductExchange(uint256 policyId,address tokenIn,uint256 amountIn,address tokenOut,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;
const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Returns the EIP712 hash which should be signed by the authorized signer
// in order to make a call to CompoundProduct.submitClaim()
function getSubmitClaimDigest(
    name: string,
    address: string,
    chainId: number,
    policyId: BigNumberish,
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
                [EXCHANGE_TYPEHASH, policyId, tokenIn, amountIn, tokenOut, amountOut, deadline]
            )
            ),
        ]
        )
    )
}

if(process.env.FORK_NETWORK === "mainnet"){
  describe('CompoundProduct', () => {
    const [deployer, user, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: CompoundProduct;
    let quoter: ExchangeQuoter;
    let quoter2: ExchangeQuoterManual;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const maxCoverPerUser = BN.from("10000000000000000000"); // 10 Ether in wei
    const cancelFee = BN.from("100000000000000000"); // 0.1 Ether in wei
    const price = 11044; // 2.60%/yr

    const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
    const COMPTROLLER = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";

    const cETH = "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5";
    const USER1 = "0xa0f75491720835b36edc92d06ddc468d201e9b73";
    const BALANCE1  = BN.from("16205226886284201139348");
    const BALANCE11 = BN.from("16205226886284201139348");

    const cDAI = "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643";
    const USER2 = "0xda3059e065781976845359154cc3aae1d0e99289";
    const BALANCE2  = BN.from("5225311707193538431924");
    const BALANCE12 = BN.from("4002346288470480898590");

    const cUSDC = "0x39AA39c021dfbaE8faC545936693aC917d5E7563"
    const USER3 = "0x416f4d9d9a6c595e24aef284672ef3c98eda6bb0";
    const BALANCE3  = BN.from("17486774897559620002");
    const BALANCE13 = BN.from("2271845248250000000");

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

      // deploy Compound Product
      product = (await deployContract(
        deployer,
        artifacts.CompoundProduct,
        [
          policyManager.address,
          registry.address,
          COMPTROLLER,
          maxCoverAmount,
          maxCoverPerUser,
          minPeriod,
          maxPeriod,
          cancelFee,
          price,
          quoter.address
        ]
      )) as CompoundProduct;

      await registry.setVault(vault.address);
      await registry.setClaimsEscrow(claimsEscrow.address);
      await registry.setTreasury(treasury.address);
      await registry.setPolicyManager(policyManager.address);
    })

    describe("appraisePosition", function () {
      it("reverts if invalid pool or token", async function () {
        await expect(product.appraisePosition(user.address, ZERO_ADDRESS)).to.be.reverted;
        await expect(product.appraisePosition(user.address, user.address)).to.be.reverted;
      })

      it("no positions should have no value", async function () {
        expect(await product.appraisePosition(user.address, cETH)).to.equal(0);
      })

      it("a position should have a value", async function () {
        expect(await product.appraisePosition(USER1, cETH)).to.equal(BALANCE1);
        expect(await product.appraisePosition(USER2, cDAI)).to.equal(BALANCE2);
        expect(await product.appraisePosition(USER3, cUSDC)).to.equal(BALANCE3);
      })

      it("can change quoters", async function () {
        await expect(product.connect(user).setExchangeQuoter(quoter2.address)).to.be.revertedWith("!governance");
        await product.setExchangeQuoter(quoter2.address);
        expect(await product.appraisePosition(USER1, cETH)).to.equal(BALANCE11);
        expect(await product.appraisePosition(USER2, cDAI)).to.equal(BALANCE12);
        expect(await product.appraisePosition(USER3, cUSDC)).to.equal(BALANCE13);
      })
    })

    describe('implementedFunctions', function () {
      it('can getQuote', async function () {
        let price = BN.from(await product.price());
        let coverLimit = 1 // cover 0.01% of the position
        let blocks = BN.from(threeDays)
        let expectedPremium = BN.from("346307967291657");
        let quote = BN.from(await product.getQuote(USER1, cETH, coverLimit, blocks))
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
        let quote = BN.from(await product.getQuote(USER1, cETH, coverLimit, blocks));
        let res = (await product.buyPolicy(USER1, cETH, coverLimit, blocks, { value: quote }));
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
        let quote = BN.from(await product.getQuote(USER1, cETH, coverLimit, blocks));
        await product.buyPolicy(USER1, cETH, coverLimit, blocks, { value: quote });
      })
    })

    describe("submitClaim", function () {
      it("non governance cannot add signers", async function () {
        await expect(product.connect(user).addSigner(user.address)).to.be.revertedWith("!governance");
      })

      it("governance can add signers", async function () {
        await product.connect(deployer).addSigner(paclasSigner.address);
      })

      it("can open a claim", async function () {
        // create a new position
        let cEthContract = await ethers.getContractAt(artifacts.ICETH.abi, cETH);
        await cEthContract.connect(user).mint({value: 1000000000000000});
        await cEthContract.connect(user).approve(product.address, constants.MaxUint256);
        // buy a policy
        let coverLimit = 10000
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(user.address, cETH, coverLimit, blocks));
        await product.connect(user).buyPolicy(user.address, cETH, coverLimit, blocks, { value: quote });
        let policyId = 3;

        let userEth1 = await user.getBalance();
        let userCeth1 = await cEthContract.balanceOf(user.address);
        let amountIn = 1000;
        let amountOut = 5000;
        let digest = getSubmitClaimDigest("Solace.fi-CompoundProduct", product.address, chainId, policyId, cETH, amountIn, ETH, amountOut, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        let tx1 = await product.connect(user).submitClaim(policyId, cETH, amountIn, ETH, amountOut, deadline, signature);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyId);
        let userEth2 = await user.getBalance();
        let userCeth2 = await cEthContract.balanceOf(user.address);
        expect(userCeth1.sub(userCeth2)).to.equal(amountIn);
      })
    })
  })
  /*
  interface Balances {
    userEth: BN,
    userCeth: BN
  }

  async function getBalances(user: Wallet): Promise<Balances> {
    return {
      userEth: await user.getBalance(),
      userCeth: await ceth.balanceOf(user.address)
    }
  }

  function getBalancesDiff(balances1: Balances, balances2: Balances) : Balances {
    return {
      userEth: balances1.userEth.sub(balances2.userEth),
      userCeth: balances1.userCeth.sub(balances2.userCeth)
    }
  }
  */
}

else if(process.env.FORK_NETWORK === "rinkeby"){
  describe('CompoundProduct', () => {
    const [deployer, user, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: CompoundProductRinkeby;
    let quoter2: ExchangeQuoterManual;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45100; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const maxCoverPerUser = BN.from("10000000000000000000"); // 10 Ether in wei
    const cancelFee = BN.from("100000000000000000"); // 0.1 Ether in wei
    const price = 11044; // 2.60%/yr

    // rinkeby
    const TREASURY = "0xBE89BC18af93Cb31c020a826C10B90b8BdcDC483";
    const COMPTROLLER = "0x2EAa9D77AE4D8f9cdD9FAAcd44016E746485bddb";
    const cETH = "0xd6801a1DfFCd0a410336Ef88DeF4320D6DF1883e";
    const USER1 = "0x0fb78424e5021404093aA0cFcf50B176B30a3c1d";
    const BALANCE1 = "1236588650796795918";


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

      // deploy manual exchange quoter
      quoter2 = (await deployContract(
        deployer,
        artifacts.ExchangeQuoterManual,
        [
          deployer.address
        ]
      )) as ExchangeQuoterManual;
      await expect(quoter2.connect(user).setRates([],[])).to.be.revertedWith("!governance");
      await quoter2.setRates([
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359",
        "0xc00e94cb662c3520282e6f5717214004a7f26888",
        "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
        "0x514910771af9ca656af840dff83e8264ecf986ca",
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
        "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "0x1985365e9f78359a9b6ad760e32412f4a445e862",
        "0x0d8775f648430679a709e98d2b0cb6250d2887ef",
        "0xe41d2489571d322189246dafa5ebde1f4699f498",
        "0x0000000000085d4780b73119b644ae5ecd22b376",
        "0x6b175474e89094c44da98b954eedeac495271d0f",
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
      ],[
        "1000000000000000000",
        "5214879005539865",
        "131044789678131649",
        "9259278326749300",
        "9246653217422099",
        "15405738054265288944",
        "420072999319953",
        "12449913804491249",
        "281485209795972",
        "372925580282399",
        "419446558886231",
        "205364954059859",
        "50000000000000"
      ]);

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

      // deploy Compound Product
      product = (await deployContract(
        deployer,
        artifacts.CompoundProductRinkeby,
        [
          policyManager.address,
          registry.address,
          COMPTROLLER,
          maxCoverAmount,
          maxCoverPerUser,
          minPeriod,
          maxPeriod,
          cancelFee,
          price,
          quoter2.address
        ]
      )) as CompoundProductRinkeby;

      await registry.setVault(vault.address);
      await registry.setClaimsEscrow(claimsEscrow.address);
      await registry.setTreasury(treasury.address);
      await registry.setPolicyManager(policyManager.address);
    })

    describe("appraisePosition", function () {
      it("reverts if invalid pool or token", async function () {
        await expect(product.appraisePosition(user.address, ZERO_ADDRESS)).to.be.reverted;
        await expect(product.appraisePosition(user.address, user.address)).to.be.reverted;
      })

      it("no positions should have no value", async function () {
        expect(await product.appraisePosition(user.address, cETH)).to.equal(0);
      })

      it("a position should have a value", async function () {
        expect(await product.appraisePosition(USER1, cETH)).to.equal(BALANCE1);
      })

      /*
      it("can change quoters", async function () {
        await expect(product.connect(user).setExchangeQuoter(quoter2.address)).to.be.revertedWith("!governance");
        await product.setExchangeQuoter(quoter2.address);
        expect(await product.appraisePosition(USER1, cETH)).to.equal(BALANCE11);
        expect(await product.appraisePosition(USER2, cDAI)).to.equal(BALANCE12);
        expect(await product.appraisePosition(USER3, cUSDC)).to.equal(BALANCE13);
      })
      */
    })

    describe('implementedFunctions', function () {
      it('can getQuote', async function () {
        let price = BN.from(await product.price());
        let coverLimit = 5000 // cover 50% of the position
        let blocks = BN.from(threeDays)
        let expectedPremium = BN.from("133673718330036");
        let quote = BN.from(await product.getQuote(USER1, cETH, coverLimit, blocks))
        expect(quote).to.equal(expectedPremium);
      })
      it('can buyPolicy', async function () {
        expect(await policyManager.totalSupply()).to.equal(0);
        expect(await policyManager.balanceOf(USER1)).to.equal(0);
        // adding the owner product to the ProductManager
        (await policyManager.connect(deployer).addProduct(product.address)); // when using { value: quote } below it defaults to send from the first account
        // position contract set
        expect(await policyManager.productIsActive(product.address)).to.equal(true);

        let coverLimit = 5000 // cover 50% of the position
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(USER1, cETH, coverLimit, blocks));
        let res = (await product.buyPolicy(USER1, cETH, coverLimit, blocks, { value: quote }));
        let receipt = await res.wait()
        if(receipt.events) {
          var event = receipt.events.filter(event => event.event == "PolicyCreated")[0]
          if(event.args) {
            expect(event.args[0]).to.equal(1); // policyID
          }
        }
        //expect(receipt.logs[0].topics[3]).to.equal('0x0000000000000000000000000000000000000000000000000000000000000000') // the last element in the logs array is the policyID, in this case policyID = 0
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(USER1)).to.equal(1);
        //console.log(await policyManager.tokenURI(0));
      })
    })

    describe("submitClaim", function () {
      it("non governance cannot add signers", async function () {
        await expect(product.connect(user).addSigner(user.address)).to.be.revertedWith("!governance");
      })

      it("governance can add signers", async function () {
        await product.connect(deployer).addSigner(paclasSigner.address);
      })

      it("can open a claim", async function () {
        // create a new position
        let cEthContract = await ethers.getContractAt(artifacts.ICETH.abi, cETH);
        await cEthContract.connect(user).mint({value: 1000000000000000});
        await cEthContract.connect(user).approve(product.address, constants.MaxUint256);
        // buy a policy
        let coverLimit = 10000
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(user.address, cETH, coverLimit, blocks));
        await product.connect(user).buyPolicy(user.address, cETH, coverLimit, blocks, { value: quote });
        let policyId = 2;

        let userEth1 = await user.getBalance();
        let userCeth1 = await cEthContract.balanceOf(user.address);
        let amountIn = 1000;
        let amountOut = 5000;
        let digest = getSubmitClaimDigest("Solace.fi-CompoundProduct", product.address, chainId, policyId, cETH, amountIn, ETH, amountOut, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        let tx1 = await product.connect(user).submitClaim(policyId, cETH, amountIn, ETH, amountOut, deadline, signature);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyId);
        let userEth2 = await user.getBalance();
        let userCeth2 = await cEthContract.balanceOf(user.address);
        expect(userCeth1.sub(userCeth2)).to.equal(amountIn);
      })
    })
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

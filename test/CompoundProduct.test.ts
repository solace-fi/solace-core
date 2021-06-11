import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { expectClose } from "./utilities/chai_extensions";

import CompoundProductArtifact from '../artifacts/contracts/products/CompoundProduct.sol/CompoundProduct.json';
import ExchangeQuoterArtifact from "../artifacts/contracts/ExchangeQuoter.sol/ExchangeQuoter.json";
import ExchangeQuoterManualArtifact from "../artifacts/contracts/ExchangeQuoterManual.sol/ExchangeQuoterManual.json";
import { CompoundProduct, ExchangeQuoter, ExchangeQuoterManual } from "../typechain";


describe('CompoundProduct', () => {
  const [deployer, user] = provider.getWallets();

  let product: CompoundProduct;
  let quoter: ExchangeQuoter;
  let quoter2: ExchangeQuoterManual;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
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
    // deploy exchange quoter
    quoter = (await deployContract(
      deployer,
      ExchangeQuoterArtifact,
      [
        ONE_SPLIT_VIEW
      ]
    )) as ExchangeQuoter;

    // deploy Compound Product
    product = (await deployContract(
      deployer,
      CompoundProductArtifact,
      [
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        0,
        0,
        0,
        0,
        0,
        COMPTROLLER,
        quoter.address
      ]
    )) as CompoundProduct;
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
      // TODO: verify math
      expect(await product.appraisePosition(USER1, cETH)).to.equal(BALANCE1);
      expect(await product.appraisePosition(USER2, cDAI)).to.equal(BALANCE2);
      expect(await product.appraisePosition(USER3, cUSDC)).to.equal(BALANCE3);
    })

    it("can change quoters", async function () {
      // deploy manual exchange quoter
      quoter2 = (await deployContract(
        deployer,
        ExchangeQuoterManualArtifact,
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
      await expect(product.connect(user).setExchangeQuoter(quoter2.address)).to.be.revertedWith("!governance");
      await product.setExchangeQuoter(quoter2.address);
      expect(await product.appraisePosition(USER1, cETH)).to.equal(BALANCE11);
      expect(await product.appraisePosition(USER2, cDAI)).to.equal(BALANCE12);
      expect(await product.appraisePosition(USER3, cUSDC)).to.equal(BALANCE13);
    })
  })
})

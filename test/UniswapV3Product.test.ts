import hardhat from "hardhat"
const hre = hardhat;
import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, Contract, constants, utils} from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, UniswapV3Product, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { encodeAddresses } from "./utilities/positionDescription";

const DOMAIN_NAME = "Solace.fi-UniswapV3Product";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("UniswapV3ProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("InvalidType(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

if(process.env.FORK_NETWORK === "mainnet"){
  describe("UniswapV3Product", function () {
    const [deployer, governor, policyholder1, policyholder2, policyholder3, depositor, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: UniswapV3Product;
    let product2: UniswapV3Product;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let riskManager: RiskManager;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const maxCoverPerUser = BN.from("10000000000000000000"); // 10 Ether in wei
    const cancelFee = BN.from("100000000000000000"); // 0.1 Ether in wei
    const price = 11044; // 2.60%/yr

    const coverAmount = BN.from("10000000000000000000"); // 10 eth
    const blocks = BN.from(threeDays);
    const expectedPremium = BN.from("2137014000000000");

    const UNISWAP_V3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    const REAL_USER = "0x5dcd83cf2dd90a4c7e1c189e74ec7dc072ad78e1";
    const COOLDOWN_PERIOD = 3600; // one hour

    const uniPools = [
      {
         "id":0,
         "address":"0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801",
         "name":"UNI/WETH"
      },
      {
         "id":1,
         "address":"0x6c6Bc977E13Df9b0de53b251522280BB72383700",
         "name":"DAI/USDC"
      },
      {
         "id":2,
         "address":"0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387",
         "name":"USDC/WETH"
      },
      {
         "id":3,
         "address":"0xCBCdF9626bC03E24f779434178A73a0B4bad62eD",
         "name":"WBTC/WETH"
      },
      {
         "id":6,
         "address":"0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8",
         "name":"DAI/WETH"
      },
      {
         "id":7,
         "address":"0x7858E59e0C01EA06Df3aF3D20aC7B0003275D4Bf",
         "name":"USDC/USDT"
      },
      {
         "id":9,
         "address":"0xF83d5AaaB14507A53f97D3C18BDB52C4A62Efc40",
         "name":"SOCKS/WETH"
      },
      {
         "id":10,
         "address":"0xD1D5A4c0eA98971894772Dcd6D2f1dc71083C44E",
         "name":"LQTY/WETH"
      },
      {
         "id":16,
         "address":"0x6f48ECa74B38d2936B02ab603FF4e36A6C0E3A77",
         "name":"DAI/USDT"
      },
      {
         "id":18,
         "address":"0xff2bDF3044C601679dEde16f5D4a460B35cebfeE",
         "name":"POOL/WETH"
      },
      {
         "id":23,
         "address":"0x04916039B1f59D9745Bf6E0a21f191D1e0A84287",
         "name":"YFI/WETH"
      },
      {
         "id":25,
         "address":"0x5598931BfBb43EEC686fa4b5b92B5152ebADC2f6",
         "name":"COMP/WETH"
      },
      {
         "id":32,
         "address":"0xDc7B403e2e967EaF6c97d79316D285B8A112fDa7",
         "name":"FEI/WETH"
      },
      {
         "id":35,
         "address":"0xbB2e5C2FF298FD96E166f90c8ABAcAF714Df14F8",
         "name":"DAI/FEI"
      },
      {
         "id":41,
         "address":"0x0dc9877F6024CCf16a470a74176C9260beb83AB6",
         "name":"RAI/WETH"
      },
      {
         "id":102,
         "address":"0x151CcB92bc1eD5c6D0F9Adb5ceC4763cEb66AC7f",
         "name":"ETH2x-FLI/WETH"
      },
      {
         "id":126,
         "address":"0xcB0C5d9D92f4F2F80cce7aa271a1E148c226e19D",
         "name":"RAI/DAI"
      },
      {
         "id":127,
         "address":"0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36",
         "name":"WETH/USDT"
      },
      {
         "id":135,
         "address":"0x5aB53EE1d50eeF2C1DD3d5402789cd27bB52c1bB",
         "name":"AAVE/WETH"
      },
      {
         "id":137,
         "address":"0xa6Cc3C2531FdaA6Ae1A3CA84c2855806728693e8",
         "name":"LINK/WETH"
      },
      {
         "id":144,
         "address":"0x3FE55D440adb6e07fa8e69451f5511D983882487",
         "name":"🐟/WETH"
      },
      {
         "id":151,
         "address":"0x2efeC2097beede290B2eED63e2FAf5ECbBC528FC",
         "name":"WETH/TRU"
      },
      {
         "id":163,
         "address":"0x788f0399b9f012926e255D9F22ceea845b8f7a32",
         "name":"WETH/PUSH"
      },
      {
         "id":179,
         "address":"0x5447b274859457f11D7cc7131B378363bBee4E3A",
         "name":"NDX/WETH"
      },
      {
         "id":184,
         "address":"0x19E286157200418d6A1f7D1df834b82E65C920AA",
         "name":"SUSHI/WETH"
      },
      {
         "id":185,
         "address":"0xFAaCE66BD25abFF62718AbD6DB97560E414eC074",
         "name":"WETH/RARI"
      },
      {
         "id":186,
         "address":"0x82bd0E16516F828A0616038002E152AA6F27AEdc",
         "name":"cDAI/WETH"
      },
      {
         "id":189,
         "address":"0x32A2c4C25BABEdC810fa466ab0F0C742Df3A3555",
         "name":"CFi/WETH"
      },
      {
         "id":194,
         "address":"0xeFbd546647FDA46067225bD0221e08bA91071584",
         "name":"RVP/WETH"
      },
      {
         "id":216,
         "address":"0x3482296547783CB714c49E13717cD163b2951ba8",
         "name":"Subs/DAI"
      },
      {
         "id":221,
         "address":"0xAE614a7a56cB79c04Df2aeBA6f5dAB80A39CA78E",
         "name":"BAT/WETH"
      },
      {
         "id":223,
         "address":"0x2552018fA2768fD0Af10d32a4C38586A9BadE6CE",
         "name":"BIRD/USDC"
      },
      {
         "id":225,
         "address":"0x07AA6584385cCA15C2c6e13A5599fFc2D177E33b",
         "name":"FLUX/WETH"
      },
      {
         "id":227,
         "address":"0x3139bbbA7f4B9125595cB4eBeefdaC1fCe7Ab5f1",
         "name":"RUNE/WETH"
      },
      {
         "id":232,
         "address":"0x7DdC2C3d12A9212112e5f99602AB16C338ec1116",
         "name":"AGI/WETH"
      },
      {
         "id":233,
         "address":"0x3CEC6746Ebd7658F58E5d786e0999118Fea2905C",
         "name":"NFTX/WETH"
      },
      {
         "id":236,
         "address":"0x85498E26aa6b5C7C8aC32ee8e872D95fb98640c4",
         "name":"WETH/BANANA"
      },
      {
         "id":239,
         "address":"0x5EB5dC3d8C74413834f1Ca65C3412f48cD1C67A6",
         "name":"wSIENNA/WETH"
      },
      {
         "id":244,
         "address":"0x35815D67f717e7BcE9cc8519bDc80323ECf7d260",
         "name":"BNT/WETH"
      },
      {
         "id":246,
         "address":"0x4628a0A564DEBFc8798eb55DB5c91f2200486c24",
         "name":"RNDR/WETH"
      },
      {
         "id":257,
         "address":"0x2356b745747Ed77191844c025EdDc894fCe5F5F6",
         "name":"UNI-V3/WETH"
      },
      {
         "id":273,
         "address":"0xEDe8dd046586d22625Ae7fF2708F879eF7bdb8CF",
         "name":"SNX/WETH"
      },
      {
         "id":278,
         "address":"0xBfA7b27ac817D57F938541E0e86dbEC32a03CE53",
         "name":"WETH/WOA"
      },
      {
         "id":282,
         "address":"0xdceaf5d0E5E0dB9596A47C0c4120654e80B1d706",
         "name":"AAVE/USDC"
      },
      {
         "id":283,
         "address":"0x2F62f2B4c5fcd7570a709DeC05D68EA19c82A9ec",
         "name":"SHIB/WETH"
      },
      {
         "id":287,
         "address":"0xB2cd930798eFa9B6CB042F073A2CcEa5012E7AbF",
         "name":"WETH/DOGE"
      },
      {
         "id":290,
         "address":"0xF15054BC50c39ad15FDC67f2AedD7c2c945ca5f6",
         "name":"USDC/COMP"
      },
      {
         "id":293,
         "address":"0x28aF48a3468Bc4A00221cd35e10B746B9F945B14",
         "name":"CHONK/WETH"
      },
      {
         "id":294,
         "address":"0xc3881FBB90daf3066dA30016d578eD024027317c",
         "name":"GLQ/WETH"
      },
      {
         "id":296,
         "address":"0xc2cEAA15E6120D51daac0c90540922695Fcb0fC7",
         "name":"WETH/MNDCC"
      },
      {
         "id":301,
         "address":"0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35",
         "name":"WBTC/USDC"
      },
      {
         "id":306,
         "address":"0x632E675672F2657F227da8D9bB3fE9177838e726",
         "name":"RPL/WETH"
      },
      {
         "id":307,
         "address":"0xC9c3D642cFEfC60858655D4549CB5AcD5495E90E",
         "name":"REPv2/USDC"
      },
      {
         "id":318,
         "address":"0x57aF956d3E2cCa3B86f3D8C6772C03ddca3eAacB",
         "name":"PENDLE/WETH"
      },
      {
         "id":322,
         "address":"0x7F54B107fB1552292D8f2eB0C95C9Ae14aF1A181",
         "name":"WETH/VGT"
      },
      {
         "id":329,
         "address":"0xbd5fDda17bC27bB90E37Df7A838b1bFC0dC997F5",
         "name":"USDC/EURS"
      },
      {
         "id":333,
         "address":"0xb6873431c2c0e6502143148CaE4FAb419a325826",
         "name":"renDOGE/WETH"
      },
      {
         "id":335,
         "address":"0x45F199B8aF62ab2847f56D0d2866ea20DA0C9BBc",
         "name":"BANK/WETH"
      },
      {
         "id":337,
         "address":"0x9Db9e0e53058C89e5B94e29621a205198648425B",
         "name":"WBTC/USDT"
      },
      {
         "id":338,
         "address":"0xD340B57AAcDD10F96FC1CF10e15921936F41E29c",
         "name":"wstETH/WETH"
      },
      {
         "id":343,
         "address":"0x13236638051F7643C0006F92b72789684Dc92477",
         "name":"WUSD/USDC"
      },
      {
         "id":344,
         "address":"0x44f6A8B9FF94AC5DbBAfB305B185e940561c5c7F",
         "name":"YAXIS/WETH"
      },
      {
         "id":347,
         "address":"0x391E8501b626C623d39474AfcA6f9e46c2686649",
         "name":"WBTC/DAI"
      },
      {
         "id":353,
         "address":"0x9663f2CA0454acCad3e094448Ea6f77443880454",
         "name":"LUSD/WETH"
      },
      {
         "id":354,
         "address":"0xB13B2113dc40E8c2064F6D49577250d9f6131c28",
         "name":"WETH/ZCX"
      },
      {
         "id":355,
         "address":"0x1c83F897788C1BB0880dE4801422f691F34406B6",
         "name":"WETH/PDEX"
      },
      {
         "id":358,
         "address":"0xD94FdB60194FefA7Ef8B416f8bA99278Ab3E00dC",
         "name":"DINU/WETH"
      },
      {
         "id":367,
         "address":"0x64652315D86f5dfAE30885FBD29D1da05b63ADD7",
         "name":"FTM/WETH"
      },
      {
         "id":369,
         "address":"0x564aC0f88DE8b7754EE4C0403a26A386C6Bf89F5",
         "name":"WETH/MEME"
      },
      {
         "id":376,
         "address":"0x6b1C477B4c67958915b194Ae8b007Bf078dadb81",
         "name":"⚗️/WETH"
      },
      {
         "id":382,
         "address":"0xDC2c21F1B54dDaF39e944689a8f90cb844135cc9",
         "name":"BAL/WETH"
      },
      {
         "id":383,
         "address":"0xF5381D47148ee3606448df3764f39Da0e7b25985",
         "name":"POLS/WETH"
      },
      {
         "id":385,
         "address":"0xB853Cf2383D2d07c3C62c7841Ec164fD3a05a676",
         "name":"WETH/XGT"
      },
      {
         "id":392,
         "address":"0xA424cea71C4Aea3d11877240B2F221C027c0E0Be",
         "name":"ALEPH/WETH"
      },
      {
         "id":398,
         "address":"0x8661aE7918C0115Af9e3691662f605e9c550dDc9",
         "name":"MANA/WETH"
      },
      {
         "id":408,
         "address":"0x9e0905249CeEFfFB9605E034b534544684A58BE6",
         "name":"HEX/WETH"
      },
      {
         "id":410,
         "address":"0xb97909512d2711b69710B4cA0da10A3a7E624805",
         "name":"WBTC/DIGG"
      },
      {
         "id":417,
         "address":"0x5b7E3E37a1aa6369386e5939053779abd3597508",
         "name":"WETH/RIO"
      },
      {
         "id":421,
         "address":"0x5494d3a61369460147d754f3562b769218E90E96",
         "name":"LPT/WETH"
      },
      {
         "id":434,
         "address":"0xD390B185603A730b00c546a951CE961b44F5f899",
         "name":"DRC/WETH"
      },
      {
         "id":446,
         "address":"0xBd233D685eDE81E00faaEFEbD55150C76778a34e",
         "name":"WETH/DAM"
      },
      {
         "id":452,
         "address":"0xC1dF8037881df17Dc88998824b9aeA81c71bbB1b",
         "name":"FORTH/WETH"
      },
      {
         "id":483,
         "address":"0x903D26296a9269f9CFc08d6e5f640436B6d2F8F5",
         "name":"ARMOR/DAI"
      },
      {
         "id":489,
         "address":"0x6aD1A683E09843c32D0092400613d6a590F3A949",
         "name":"WETH/rUSD"
      },
      {
         "id":497,
         "address":"0xD626e123Da3A2161cCAAD13F28a12fDA472752aF",
         "name":"RIO/rUSD"
      },
      {
         "id":498,
         "address":"0x695b30d636e4F232d443af6a93dF95AFD2FF485C",
         "name":"WETH/BEPRO"
      },
      {
         "id":503,
         "address":"0xE845469aAe04f8823202b011A848cf199420B4C1",
         "name":"UNI/USDC"
      },
      {
         "id":508,
         "address":"0x4E57F830B0b4A82321071ead6FfD1Df1575a16e2",
         "name":"WETH/AMP"
      },
      {
         "id":522,
         "address":"0xa2f6EB84CF53A326152de0255f87828C647d9b95",
         "name":"Auction/WETH"
      },
      {
         "id":525,
         "address":"0x919Fa96e88d67499339577Fa202345436bcDaf79",
         "name":"WETH/CRV"
      },
      {
         "id":542,
         "address":"0x7eAc602913B707A6115f384fC4CFD7c5a68F538E",
         "name":"⚗️/USDC"
      },
      {
         "id":545,
         "address":"0x9D9590Cd131A03A31942F1A198554d37D164E994",
         "name":"PYRENEES/WETH"
      },
      {
         "id":548,
         "address":"0xc4580c566202F5343883D0c6a378a9de245C9399",
         "name":"OCC/USDC"
      },
      {
         "id":549,
         "address":"0xB2d26108582AC26d665f8A00eF0E5b94c50e67AA",
         "name":"SOX/WETH"
      },
      {
         "id":554,
         "address":"0xb66c491e2356Bf32b7E3EA14af7F60B3eD171A22",
         "name":"QNT/USDC"
      },
      {
         "id":559,
         "address":"0x157Dfa656Fdf0D18E1bA94075a53600D81cB3a97",
         "name":"UMA/WETH"
      },
      {
         "id":562,
         "address":"0xe0e1B825474ae06e7E932e214a735640c9Bc3e71",
         "name":"WETH/VAL"
      },
      {
         "id":564,
         "address":"0x48783a921E9fE6E9F48dE8966B98A427D2CcBef0",
         "name":"PROS/WETH"
      },
      {
         "id":571,
         "address":"0x46add4B3F80672989b9A1eAF62caD5206F5E2164",
         "name":"WETH/GRT"
      },
      {
         "id":581,
         "address":"0x5654b1dd37Af02f327D98C04B72aCDF01ba2835c",
         "name":"IGG/WETH"
      },
      {
         "id":586,
         "address":"0x27878aE7f961a126755042eE8E5C074ea971511F",
         "name":"HUB/USDT"
      }
   ]

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

      // deploy Uniswap Product
      product = (await deployContract(
        deployer,
        artifacts.UniswapV3Product,
        [
          governor.address,
          policyManager.address,
          registry.address,
          UNISWAP_V3_FACTORY_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as UniswapV3Product;

       // deploy Uniswap Product
       product2 = (await deployContract(
        deployer,
        artifacts.UniswapV3Product,
        [
          governor.address,
          policyManager.address,
          registry.address,
          UNISWAP_V3_FACTORY_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as UniswapV3Product;
      
      await vault.connect(deployer).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product.address, 1, 11044, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as uniswapv3 factory address", async function () {
        expect(await product.coveredPlatform()).to.equal(UNISWAP_V3_FACTORY_ADDRESS);
        expect(await product.uniV2Factory()).to.equal(UNISWAP_V3_FACTORY_ADDRESS);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(policyholder1).setCoveredPlatform(policyholder1.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.uniV2Factory()).to.equal(treasury.address);
        await product.connect(governor).setCoveredPlatform(UNISWAP_V3_FACTORY_ADDRESS);
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
      it("cannot have non uniswapv3 pool", async function () {
        // would like to.be.false, to.be.reverted will work though
        await expect( product.isValidPositionDescription("REAL_USER")).to.be.reverted;
        await expect( product.isValidPositionDescription(REAL_USER)).to.be.reverted;
        await expect( product.isValidPositionDescription(encodeAddresses([REAL_USER]))).to.be.reverted;
        await expect( product.isValidPositionDescription(governor.address)).to.be.reverted;
        await expect( product.isValidPositionDescription(UNISWAP_V3_FACTORY_ADDRESS)).to.be.reverted;
        await expect( product.isValidPositionDescription(encodeAddresses([ZERO_ADDRESS]))).to.be.reverted;
        await expect( product.isValidPositionDescription(encodeAddresses([uniPools[0].address, ZERO_ADDRESS]))).to.be.reverted;
      });
      it("can be one uniswapv3 pool", async function() {
        for (var i = 0; i < uniPools.length/2; ++i) {
          expect(await product.isValidPositionDescription(encodeAddresses([uniPools[i].address]))).to.be.true;
        }
      });
      it("can be more uniswapv3 pool", async function () {
        for(var i = 0; i < uniPools.length/2; ++i) {
          // don't care about duplicates
          for(var j = 0; j < uniPools.length/2; ++j) {
            expect(await product.isValidPositionDescription(encodeAddresses([uniPools[i].address, uniPools[j].address]))).to.be.true;
          }
        }
      });
    });

    describe("implementedFunctions", function() {
      before(async function () {
        expect(await policyManager.totalSupply()).to.equal(0);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(0);
        // adding the owner product to the ProductManager
        (await policyManager.connect(governor).addProduct(product.address));
        expect(await policyManager.productIsActive(product.address)).to.equal(true);
      });
      it("can getQuote", async function () {
        let quote = BN.from(await product.getQuote(coverAmount, blocks));
        expect(quote).to.equal(expectedPremium);
      });
      it("cannot buy policy with invalid description", async function () {
        await expect(product.buyPolicy(REAL_USER, coverAmount, blocks, "0x1234567890123456789012345678901234567890", { value: expectedPremium })).to.be.reverted;
      });
      it("can buyPolicy", async function () {
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, uniPools[0].address, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, uniPools[0].address, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
        expect(await policyManager.totalSupply()).to.equal(2);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(2);
      });
      it("can buy policy that covers multiple positions", async function () {
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, encodeAddresses([uniPools[0].address, uniPools[1].address]), { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(3);
        expect(await policyManager.totalSupply()).to.equal(3);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(3);
      });
      it("can get product name", async function () {
        expect(await product.name()).to.equal("UniswapV3");
      });
    });

    describe("submitClaim", async function () {
      let policyID1: BN;
      let policyID2: BN;
      let amountOut1 = 500000;

      before(async function () {
        let policyCount = await policyManager.totalPolicyCount();
        policyID1 = policyCount.add(1);
        policyID2 = policyCount.add(2);
        await depositor.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, uniPools[0].address, { value: expectedPremium });
        await product.connect(policyholder2).buyPolicy(policyholder2.address, coverAmount, blocks, uniPools[1].address, { value: expectedPremium });
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
      it("should support sufficient uniswapv3 pools", async function () {
        let success = 0;
        let successList = [];
        let failList = [];
        const size = 50;
        for (let i = 0; i < size; i++) {
          const uniPoolAddress = uniPools[i].address;
          const symbol = uniPools[i].name;
          try {
            // create policy
            await product.connect(policyholder3).buyPolicy(policyholder3.address, coverAmount, blocks, uniPoolAddress, { value: expectedPremium });
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
            expect(userEth2.sub(userEth1).add(gasCost).toNumber()).to.equal(amountOut);
        
            ++success;
            successList.push(symbol);
            console.log(`\x1b[38;5;239m        ✓ ${symbol}\x1b[0m`);
          } catch (e: any) {
            console.log(`\x1b[31m        ✘ ${symbol}`);
            console.log("          " + e.stack.replace(/\n/g, "\n      "));
            console.log("\x1b[0m");
            failList.push(symbol);
          }
        }
        
        if (failList.length != 0) {
          console.log("supported uniswapv3 pools:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
          console.log("supported uniswapv3 pools:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
        }
        expect(`${success}/${size} supported uniswapv3 pools`).to.equal(`${size}/${size} supported uniswapv3 pools`);
      });
    });
  });
}

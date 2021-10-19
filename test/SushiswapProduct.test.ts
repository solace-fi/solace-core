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
import { PolicyManager, SushiswapProduct, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { encodeAddresses } from "./utilities/positionDescription";

const DOMAIN_NAME = "Solace.fi-SushiswapProduct";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("SushiswapProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("InvalidType(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

if(process.env.FORK_NETWORK === "mainnet"){
  describe("SushiswapProduct", function () {
    const [deployer, governor, policyholder1, policyholder2, policyholder3, depositor, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: SushiswapProduct;
    let product2: SushiswapProduct;
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

    const SUSHI_V2_FACTORY_ADDRESS = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac";
    const REAL_USER = "0x5dcd83cf2dd90a4c7e1c189e74ec7dc072ad78e1";
    const COOLDOWN_PERIOD = 3600; // one hour

    const slpTokens = 
      [
        {
           "id":0,
           "address":"0x06da0fd433C1A5d7a4faa01111c044910A184553",
           "description":"SushiSwap LP Token(SLP)-WETH/USDT",
           "symbol":"WETH/USDT"
        },
        {
           "id":1,
           "address":"0x397FF1542f962076d0BFE58eA045FfA2d347ACa0",
           "description":"SushiSwap LP Token(SLP)-USDC/WETH",
           "symbol":"USDC/WETH"
        },
        {
           "id":2,
           "address":"0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f",
           "description":"SushiSwap LP Token(SLP)-DAI/WETH",
           "symbol":"DAI/WETH"
        },
        {
           "id":3,
           "address":"0xF1F85b2C54a2bD284B1cf4141D64fD171Bd85539",
           "description":"SushiSwap LP Token(SLP)-sUSD/WETH",
           "symbol":"sUSD/WETH"
        },
        {
           "id":4,
           "address":"0x31503dcb60119A812feE820bb7042752019F2355",
           "description":"SushiSwap LP Token(SLP)-COMP/WETH",
           "symbol":"COMP/WETH"
        },
        {
           "id":5,
           "address":"0x5E63360E891BD60C69445970256C260b0A6A54c6",
           "description":"SushiSwap LP Token(SLP)-LEND/WETH",
           "symbol":"LEND/WETH"
        },
        {
           "id":6,
           "address":"0xA1d7b2d891e3A1f9ef4bBC5be20630C2FEB1c470",
           "description":"SushiSwap LP Token(SLP)-SNX/WETH",
           "symbol":"SNX/WETH"
        },
        {
           "id":7,
           "address":"0x001b6450083E531A5a7Bf310BD2c1Af4247E23D4",
           "description":"SushiSwap LP Token(SLP)-UMA/WETH",
           "symbol":"UMA/WETH"
        },
        {
           "id":8,
           "address":"0xC40D16476380e4037e6b1A2594cAF6a6cc8Da967",
           "description":"SushiSwap LP Token(SLP)-LINK/WETH",
           "symbol":"LINK/WETH"
        },
        {
           "id":9,
           "address":"0xA75F7c2F025f470355515482BdE9EFA8153536A8",
           "description":"SushiSwap LP Token(SLP)-BAND/WETH",
           "symbol":"BAND/WETH"
        },
        {
           "id":10,
           "address":"0xCb2286d9471cc185281c4f763d34A962ED212962",
           "description":"SushiSwap LP Token(SLP)-WETH/AMPL",
           "symbol":"WETH/AMPL"
        },
        {
           "id":11,
           "address":"0x088ee5007C98a9677165D78dD2109AE4a3D04d0C",
           "description":"SushiSwap LP Token(SLP)-YFI/WETH",
           "symbol":"YFI/WETH"
        },
        {
           "id":12,
           "address":"0x795065dCc9f64b5614C407a6EFDC400DA6221FB0",
           "description":"SushiSwap LP Token(SLP)-SUSHI/WETH",
           "symbol":"SUSHI/WETH"
        },
        {
           "id":13,
           "address":"0x611CDe65deA90918c0078ac0400A72B0D25B9bb1",
           "description":"SushiSwap LP Token(SLP)-REN/WETH",
           "symbol":"REN/WETH"
        },
        {
           "id":15,
           "address":"0x117d4288B3635021a3D612FE05a3Cbf5C717fEf2",
           "description":"SushiSwap LP Token(SLP)-SRM/WETH",
           "symbol":"SRM/WETH"
        },
        {
           "id":16,
           "address":"0x95b54C8Da12BB23F7A5F6E26C38D04aCC6F81820",
           "description":"SushiSwap LP Token(SLP)-YAMv2/WETH",
           "symbol":"YAMv2/WETH"
        },
        {
           "id":17,
           "address":"0x58Dc5a51fE44589BEb22E8CE67720B5BC5378009",
           "description":"SushiSwap LP Token(SLP)-WETH/CRV",
           "symbol":"WETH/CRV"
        },
        {
           "id":18,
           "address":"0xDafd66636E2561b0284EDdE37e42d192F2844D40",
           "description":"SushiSwap LP Token(SLP)-UNI/WETH",
           "symbol":"UNI/WETH"
        },
        {
           "id":19,
           "address":"0x36e2FCCCc59e5747Ff63a03ea2e5C0c2C14911e7",
           "description":"SushiSwap LP Token(SLP)-xSUSHI/WETH",
           "symbol":"xSUSHI/WETH"
        },
        {
           "id":20,
           "address":"0x0Cfe7968e7c34A51217a7C9b9dc1690F416E027e",
           "description":"SushiSwap LP Token(SLP)-cDAI/DAI",
           "symbol":"cDAI/DAI"
        },
        {
           "id":21,
           "address":"0xCEfF51756c56CeFFCA006cD410B03FFC46dd3a58",
           "description":"SushiSwap LP Token(SLP)-WBTC/WETH",
           "symbol":"WBTC/WETH"
        },
        {
           "id":22,
           "address":"0xf169CeA51EB51774cF107c88309717ddA20be167",
           "description":"SushiSwap LP Token(SLP)-CREAM/WETH",
           "symbol":"CREAM/WETH"
        },
        {
           "id":23,
           "address":"0x17b3C19Bd640a59E832AB73eCcF716CB47419846",
           "description":"SushiSwap LP Token(SLP)-WETH/MEME",
           "symbol":"WETH/MEME"
        },
        {
           "id":24,
           "address":"0xFcff3b04C499A57778ae2CF05584ab24278A7FCb",
           "description":"SushiSwap LP Token(SLP)-wNXM/WETH",
           "symbol":"wNXM/WETH"
        },
        {
           "id":25,
           "address":"0x382c4a5147Fd4090F7BE3A9Ff398F95638F5D39E",
           "description":"SushiSwap LP Token(SLP)-yyDAI+yUSDC+yUSDT+yTUSD/WETH",
           "symbol":"yyDAI+yUSDC+yUSDT+yTUSD/WETH"
        },
        {
           "id":26,
           "address":"0x2024324a99231509a3715172d4F4f4E751b38d4d",
           "description":"SushiSwap LP Token(SLP)-WBTC/yyDAI+yUSDC+yUSDT+yTUSD",
           "symbol":"WBTC/yyDAI+yUSDC+yUSDT+yTUSD"
        },
        {
           "id":27,
           "address":"0x0be88ac4b5C81700acF3a606a52a31C261a24A35",
           "description":"SushiSwap LP Token(SLP)-CRO/WETH",
           "symbol":"CRO/WETH"
        },
        {
           "id":28,
           "address":"0x518d6CE2D7A689A591Bf46433443C31615b206C5",
           "description":"SushiSwap LP Token(SLP)-WBTC/renBTC",
           "symbol":"WBTC/renBTC"
        },
        {
           "id":31,
           "address":"0x6463Bd6026A2E7bFab5851b62969A92f7cca0eB6",
           "description":"SushiSwap LP Token(SLP)-HEGIC/WETH",
           "symbol":"HEGIC/WETH"
        },
        {
           "id":32,
           "address":"0x2Dbc7dD86C6cd87b525BD54Ea73EBeeBbc307F68",
           "description":"SushiSwap LP Token(SLP)-WBTC/TBTC",
           "symbol":"WBTC/TBTC"
        },
        {
           "id":34,
           "address":"0x68C6d02D44E16F1c20088731Ab032f849100D70f",
           "description":"SushiSwap LP Token(SLP)-CORE/WETH",
           "symbol":"CORE/WETH"
        },
        {
           "id":35,
           "address":"0x269Db91Fc3c7fCC275C2E6f22e5552504512811c",
           "description":"SushiSwap LP Token(SLP)-PICKLE/WETH",
           "symbol":"PICKLE/WETH"
        },
        {
           "id":36,
           "address":"0x742c15d71eA7444964BC39b0eD729B3729ADc361",
           "description":"SushiSwap LP Token(SLP)-WETH/OMG",
           "symbol":"WETH/OMG"
        },
        {
           "id":37,
           "address":"0xD75EA151a61d06868E31F8988D28DFE5E9df57B4",
           "description":"SushiSwap LP Token(SLP)-AAVE/WETH",
           "symbol":"AAVE/WETH"
        },
        {
           "id":38,
           "address":"0x15e86E6f65EF7EA1dbb72A5E51a07926fB1c82E3",
           "description":"SushiSwap LP Token(SLP)-WETH/AMP",
           "symbol":"WETH/AMP"
        },
        {
           "id":39,
           "address":"0xd597924b16Cc1904d808285bC9044fd51CEEEaD7",
           "description":"SushiSwap LP Token(SLP)-xSUSHI/USDC",
           "symbol":"xSUSHI/USDC"
        },
        {
           "id":40,
           "address":"0x5a2943B25ce0678Dc0b351928D2DB331A55D94eA",
           "description":"SushiSwap LP Token(SLP)-GHST/WETH",
           "symbol":"GHST/WETH"
        },
        {
           "id":41,
           "address":"0x53aaBCcAE8C1713a6a150D9981D2ee867D0720e8",
           "description":"SushiSwap LP Token(SLP)-WETH/RARI",
           "symbol":"WETH/RARI"
        },
        {
           "id":42,
           "address":"0x34b13F8CD184F55d0Bd4Dd1fe6C07D46f245c7eD",
           "description":"SushiSwap LP Token(SLP)-DPI/WETH",
           "symbol":"DPI/WETH"
        },
        {
           "id":43,
           "address":"0xbcEdc25CbB0EA44E03E41dC2d00D54Fe6d4646Db",
           "description":"SushiSwap LP Token(SLP)-TBTC/VBTC",
           "symbol":"TBTC/VBTC"
        },
        {
           "id":44,
           "address":"0x0F82E57804D0B1F6FAb2370A43dcFAd3c7cB239c",
           "description":"SushiSwap LP Token(SLP)-YAM/WETH",
           "symbol":"YAM/WETH"
        },
        {
           "id":46,
           "address":"0x69b39B89f9274a16e8A19B78E5eB47a4d91dAc9E",
           "description":"SushiSwap LP Token(SLP)-FARM/WETH",
           "symbol":"FARM/WETH"
        },
        {
           "id":47,
           "address":"0x0289B9CD5859476Ce325aCa04309D36adDCEbDAA",
           "description":"SushiSwap LP Token(SLP)-WETH/renBTC",
           "symbol":"WETH/renBTC"
        },
        {
           "id":48,
           "address":"0x97f34c8E5992EB985c5F740e7EE8c7e48a1de76a",
           "description":"SushiSwap LP Token(SLP)-DOUGH/WETH",
           "symbol":"DOUGH/WETH"
        },
        {
           "id":49,
           "address":"0x9Fc5b87b74B9BD239879491056752EB90188106D",
           "description":"SushiSwap LP Token(SLP)-STAKE/WETH",
           "symbol":"STAKE/WETH"
        },
        {
           "id":50,
           "address":"0x6f58A1Aa0248A9F794d13Dc78E74Fc75140956D7",
           "description":"SushiSwap LP Token(SLP)-RSR/WETH",
           "symbol":"RSR/WETH"
        },
        {
           "id":51,
           "address":"0xEe6d78755e06C31AE7A5EA2b29b35C073dfc00A9",
           "description":"SushiSwap LP Token(SLP)-TBTC/WETH",
           "symbol":"TBTC/WETH"
        },
        {
           "id":52,
           "address":"0x4F871F310AD0E8a170db0021c0ce066859d37469",
           "description":"SushiSwap LP Token(SLP)-AUDIO/WETH",
           "symbol":"AUDIO/WETH"
        },
        {
           "id":53,
           "address":"0x364248b2f1f57C5402d244b2D469A35B4C0e9dAB",
           "description":"SushiSwap LP Token(SLP)-AKRO/WETH",
           "symbol":"AKRO/WETH"
        },
        {
           "id":54,
           "address":"0xD7c2A4aa31E1bF08dc7Ff44C9980fa8573E10C1B",
           "description":"SushiSwap LP Token(SLP)-WETH/HEZ",
           "symbol":"WETH/HEZ"
        },
        {
           "id":55,
           "address":"0x033ecD066376aFec5E6383BC9F1F15bE4C62dc89",
           "description":"SushiSwap LP Token(SLP)-YAX/WETH",
           "symbol":"YAX/WETH"
        },
        {
           "id":56,
           "address":"0xe4455FdEc181561e9Ffe909Dde46AAEaeDC55283",
           "description":"SushiSwap LP Token(SLP)-OUSD/USDT",
           "symbol":"OUSD/USDT"
        },
        {
           "id":57,
           "address":"0x0bff31d8179Da718A7ee3669853cF9978c90a24a",
           "description":"SushiSwap LP Token(SLP)-WETH/SURF",
           "symbol":"WETH/SURF"
        },
        {
           "id":58,
           "address":"0xaf988afF99d3d0cb870812C325C588D8D8CB7De8",
           "description":"SushiSwap LP Token(SLP)-KP3R/WETH",
           "symbol":"KP3R/WETH"
        },
        {
           "id":59,
           "address":"0xC5Fa164247d2F8D68804139457146eFBde8370F6",
           "description":"SushiSwap LP Token(SLP)-WETH/SEEN",
           "symbol":"WETH/SEEN"
        },
        {
           "id":60,
           "address":"0x35a0d9579B1E886702375364Fe9c540f97E4517B",
           "description":"SushiSwap LP Token(SLP)-WETH/AXS",
           "symbol":"WETH/AXS"
        },
        {
           "id":63,
           "address":"0xDFf71165a646BE71fCfbaa6206342FAa503AeD5D",
           "description":"SushiSwap LP Token(SLP)-ESD/WETH",
           "symbol":"ESD/WETH"
        },
        {
           "id":64,
           "address":"0x378b4c5f2a8a0796A8d4c798Ef737cF00Ae8e667",
           "description":"SushiSwap LP Token(SLP)-ANT/WETH",
           "symbol":"ANT/WETH"
        },
        {
           "id":65,
           "address":"0xEF4F1D5007B4FF88c1A56261fec00264AF6001Fb",
           "description":"SushiSwap LP Token(SLP)-PNK/WETH",
           "symbol":"PNK/WETH"
        },
        {
           "id":66,
           "address":"0x1C580CC549d03171B13b55074Dc1658F60641C73",
           "description":"SushiSwap LP Token(SLP)-CVP/WETH",
           "symbol":"CVP/WETH"
        },
        {
           "id":67,
           "address":"0xf45D97F9D457661783146D63DD13DA20ce9bf847",
           "description":"SushiSwap LP Token(SLP)-YETI/WETH",
           "symbol":"YETI/WETH"
        },
        {
           "id":68,
           "address":"0x4441eb3076f828D5176f4Fe74d7c775542daE106",
           "description":"SushiSwap LP Token(SLP)-ARCH/WETH",
           "symbol":"ARCH/WETH"
        },
        {
           "id":69,
           "address":"0xFb3cD0B8A5371fe93ef92E3988D30Df7931E2820",
           "description":"SushiSwap LP Token(SLP)-WETH/INJ",
           "symbol":"WETH/INJ"
        },
        {
           "id":70,
           "address":"0x44D34985826578e5ba24ec78c93bE968549BB918",
           "description":"SushiSwap LP Token(SLP)-BOR/WETH",
           "symbol":"BOR/WETH"
        },
        {
           "id":71,
           "address":"0x23a9292830Fc80dB7f563eDb28D2fe6fB47f8624",
           "description":"SushiSwap LP Token(SLP)-SFI/WETH",
           "symbol":"SFI/WETH"
        },
        {
           "id":72,
           "address":"0xb12aa722a3A4566645F079B6F10c89A3205b6c2c",
           "description":"SushiSwap LP Token(SLP)-DFD/WETH",
           "symbol":"DFD/WETH"
        },
        {
           "id":73,
           "address":"0x110492b31c59716AC47337E616804E3E3AdC0b4a",
           "description":"SushiSwap LP Token(SLP)-WBTC/BADGER",
           "symbol":"WBTC/BADGER"
        },
        {
           "id":74,
           "address":"0x9360b76f8f5F932AC33D46A3CE82ad6C52A713E5",
           "description":"SushiSwap LP Token(SLP)-zLOT/WETH",
           "symbol":"zLOT/WETH"
        },
        {
           "id":75,
           "address":"0xA73DF646512C82550C2b3C0324c4EEdEE53b400C",
           "description":"SushiSwap LP Token(SLP)-INDEX/WETH",
           "symbol":"INDEX/WETH"
        },
        {
           "id":76,
           "address":"0xadeAa96A81eBBa4e3A5525A008Ee107385d588C3",
           "description":"SushiSwap LP Token(SLP)-SWAG/WETH",
           "symbol":"SWAG/WETH"
        },
        {
           "id":77,
           "address":"0xF1360C4ae1cead17B588ec1111983d2791B760d3",
           "description":"SushiSwap LP Token(SLP)-JRT/WETH",
           "symbol":"JRT/WETH"
        },
        {
           "id":78,
           "address":"0x0040a2CEBc65894BC2cFb57565f9ACfa33Fab137",
           "description":"SushiSwap LP Token(SLP)-WETH/UWL",
           "symbol":"WETH/UWL"
        },
        {
           "id":79,
           "address":"0x9cD028B1287803250B1e226F0180EB725428d069",
           "description":"SushiSwap LP Token(SLP)-ICHI/WETH",
           "symbol":"ICHI/WETH"
        },
        {
           "id":80,
           "address":"0x67e475577B4036EE4f0F12fa2d538Ed18CEF48e3",
           "description":"SushiSwap LP Token(SLP)-$ROPE/WETH",
           "symbol":"$ROPE/WETH"
        },
        {
           "id":81,
           "address":"0x53E9fB796b2feb4B3184AFDf601C2A2797548d88",
           "description":"SushiSwap LP Token(SLP)-oBTC/WETH",
           "symbol":"oBTC/WETH"
        },
        {
           "id":82,
           "address":"0xE5f06db4F3473E7E35490F1F98017728496fe81E",
           "description":"SushiSwap LP Token(SLP)-mbBASED/WETH",
           "symbol":"mbBASED/WETH"
        },
        {
           "id":83,
           "address":"0x26d8151e631608570F3c28bec769C3AfEE0d73a3",
           "description":"SushiSwap LP Token(SLP)-USDC/DSD",
           "symbol":"USDC/DSD"
        },
        {
           "id":84,
           "address":"0xaB3F8E0214D862Bf7965d3CeC7431d7C1A85cb34",
           "description":"SushiSwap LP Token(SLP)-nTrump/DAI",
           "symbol":"nTrump/DAI"
        },
        {
           "id":85,
           "address":"0x8B00eE8606CC70c2dce68dea0CEfe632CCA0fB7b",
           "description":"SushiSwap LP Token(SLP)-UST/WETH",
           "symbol":"UST/WETH"
        },
        {
           "id":86,
           "address":"0xaa500101C73065f755Ba9b902d643705EF2523E3",
           "description":"SushiSwap LP Token(SLP)-WETH/FNX",
           "symbol":"WETH/FNX"
        },
        {
           "id":87,
           "address":"0xeB1B57D4f7d4557B032B66c422bc94a8E4Af859e",
           "description":"SushiSwap LP Token(SLP)-WETH/BCP",
           "symbol":"WETH/BCP"
        },
        {
           "id":88,
           "address":"0x5F30aAc9A472F6c33D5284f9D340C0d57eF33697",
           "description":"SushiSwap LP Token(SLP)-YPIE/WETH",
           "symbol":"YPIE/WETH"
        },
        {
           "id":89,
           "address":"0x83E5e791F4aB29d1B0941Bc4D00f3D6027d1dae5",
           "description":"SushiSwap LP Token(SLP)-DEFI+L/WETH",
           "symbol":"DEFI+L/WETH"
        },
        {
           "id":90,
           "address":"0xD8B8B575c943f3d63638c9563B464D204ED8B710",
           "description":"SushiSwap LP Token(SLP)-BASE/WETH",
           "symbol":"BASE/WETH"
        },
        {
           "id":91,
           "address":"0xc2B0F2A7F736d3b908BdDE8608177c8Fc28C1690",
           "description":"SushiSwap LP Token(SLP)-DDX/USDC",
           "symbol":"DDX/USDC"
        },
        {
           "id":92,
           "address":"0xB2C29e311916a346304f83AA44527092D5bd4f0F",
           "description":"SushiSwap LP Token(SLP)-MPH/WETH",
           "symbol":"MPH/WETH"
        },
        {
           "id":93,
           "address":"0x98c2f9D752e044DC2e1F1743bF0b76A7096eCeb2",
           "description":"SushiSwap LP Token(SLP)-USDT/FRONT",
           "symbol":"USDT/FRONT"
        },
        {
           "id":94,
           "address":"0x8C2e6A4af15C94cF4a86Cd3C067159F08571d780",
           "description":"SushiSwap LP Token(SLP)-WETH/UOP",
           "symbol":"WETH/UOP"
        },
        {
           "id":95,
           "address":"0xfCEAAf9792139BF714a694f868A215493461446D",
           "description":"SushiSwap LP Token(SLP)-TRU/WETH",
           "symbol":"TRU/WETH"
        },
        {
           "id":96,
           "address":"0xf55C33D94150d93c2cfb833bcCA30bE388b14964",
           "description":"SushiSwap LP Token(SLP)-ALPHA/WETH",
           "symbol":"ALPHA/WETH"
        },
        {
           "id":97,
           "address":"0xcA658217CE94dFB2156a49a8fAd0Ff752CaC39C2",
           "description":"SushiSwap LP Token(SLP)-ALPA/WETH",
           "symbol":"ALPA/WETH"
        },
        {
           "id":98,
           "address":"0x71817445D11f42506F2D7F54417c935be90Ca731",
           "description":"SushiSwap LP Token(SLP)-WETH/CRETH2",
           "symbol":"WETH/CRETH2"
        },
        {
           "id":99,
           "address":"0xb1D38026062Ac10FEDA072CA0E9b7E35f1f5795a",
           "description":"SushiSwap LP Token(SLP)-DUSD/WETH",
           "symbol":"DUSD/WETH"
        },
        {
           "id":100,
           "address":"0x201e6a9E75df132a8598720433Af35fe8d73e94D",
           "description":"SushiSwap LP Token(SLP)-ANT/WETH",
           "symbol":"ANT/WETH"
        },
        {
           "id":101,
           "address":"0x66Ae32178640813F3c32a9929520BFE4Fef5D167",
           "description":"SushiSwap LP Token(SLP)-COVER/WETH",
           "symbol":"COVER/WETH"
        },
        {
           "id":103,
           "address":"0x9a13867048e01c663ce8Ce2fE0cDAE69Ff9F35E3",
           "description":"SushiSwap LP Token(SLP)-WBTC/DIGG",
           "symbol":"WBTC/DIGG"
        },
        {
           "id":104,
           "address":"0x31d64f9403E82243e71C2af9D8F56C7DBe10C178",
           "description":"SushiSwap LP Token(SLP)-NFTX/WETH",
           "symbol":"NFTX/WETH"
        },
        {
           "id":105,
           "address":"0xA8AEC03d5Cf2824fD984ee249493d6D4D6740E61",
           "description":"SushiSwap LP Token(SLP)-API3/WETH",
           "symbol":"API3/WETH"
        },
        {
           "id":106,
           "address":"0x8Cd7DADc8E11c8706763E0DE7332f5Ea91E04E35",
           "description":"SushiSwap LP Token(SLP)-WETH/COMBO",
           "symbol":"WETH/COMBO"
        },
        {
           "id":107,
           "address":"0x51F5953659e7d63CF0EF60B8674eF819c225169e",
           "description":"SushiSwap LP Token(SLP)-HBTC/CREAM",
           "symbol":"HBTC/CREAM"
        },
        {
           "id":108,
           "address":"0x54bcf4948e32A8706C286416e3ced37284F17fc9",
           "description":"SushiSwap LP Token(SLP)-Mars/USDT",
           "symbol":"Mars/USDT"
        },
        {
           "id":109,
           "address":"0xC558F600B34A5f69dD2f0D06Cb8A88d829B7420a",
           "description":"SushiSwap LP Token(SLP)-LDO/WETH",
           "symbol":"LDO/WETH"
        },
        {
           "id":110,
           "address":"0x87bF6386f7611aFa452c642C2835a305a692607d",
           "description":"SushiSwap LP Token(SLP)-BAC/BAB",
           "symbol":"BAC/BAB"
        },
        {
           "id":111,
           "address":"0xBE1E98685fB293144325440C16f69954Ffcb790C",
           "description":"SushiSwap LP Token(SLP)-WETH/pWING",
           "symbol":"WETH/pWING"
        },
        {
           "id":112,
           "address":"0x760166FA4f227dA29ecAC3BeC348f5fA853a1f3C",
           "description":"SushiSwap LP Token(SLP)-TUSD/WETH",
           "symbol":"TUSD/WETH"
        },
        {
           "id":113,
           "address":"0x7B98e476De2c50b6fa284DBd410Dd516f9a72b30",
           "description":"SushiSwap LP Token(SLP)-ALEPH/WETH",
           "symbol":"ALEPH/WETH"
        },
        {
           "id":114,
           "address":"0x02C6260cE42Ea5cD055911ed0D4857eCD4583740",
           "description":"SushiSwap LP Token(SLP)-SPANK/WETH",
           "symbol":"SPANK/WETH"
        },
        {
           "id":115,
           "address":"0x663242D053057f317A773D7c262B700616d0b9A0",
           "description":"SushiSwap LP Token(SLP)-MTA/WETH",
           "symbol":"MTA/WETH"
        },
        {
           "id":116,
           "address":"0x0Eee7f7319013df1f24F5eaF83004fCf9cF49245",
           "description":"SushiSwap LP Token(SLP)-BAO/WETH",
           "symbol":"BAO/WETH"
        },
        {
           "id":117,
           "address":"0x18A797C7C70c1Bf22fDee1c09062aBA709caCf04",
           "description":"SushiSwap LP Token(SLP)-WETH/RGT",
           "symbol":"WETH/RGT"
        },
        {
           "id":118,
           "address":"0xA7f11E026a0Af768D285360a855F2BDEd3047530",
           "description":"SushiSwap LP Token(SLP)-IDLE/WETH",
           "symbol":"IDLE/WETH"
        },
        {
           "id":119,
           "address":"0x2ee59d346e41478B9DC2762527fACF2082022A29",
           "description":"SushiSwap LP Token(SLP)-USDT/aETHc",
           "symbol":"USDT/aETHc"
        },
        {
           "id":120,
           "address":"0x22DEF8cF4E481417cb014D9dc64975BA12E3a184",
           "description":"SushiSwap LP Token(SLP)-SDT/WETH",
           "symbol":"SDT/WETH"
        },
        {
           "id":121,
           "address":"0x41328fdBA556c8C969418ccCcB077B7B8D932aA5",
           "description":"SushiSwap LP Token(SLP)-GNO/WETH",
           "symbol":"GNO/WETH"
        },
        {
           "id":122,
           "address":"0xFa8C3F98dEBF3d0a192e2EdF9182352332Def35c",
           "description":"SushiSwap LP Token(SLP)-BAC/WETH",
           "symbol":"BAC/WETH"
        },
        {
           "id":123,
           "address":"0xfa5bc40c3BD5aFA8bC2fe6b84562fEE16FB2Df5F",
           "description":"SushiSwap LP Token(SLP)-WETH/aETHc",
           "symbol":"WETH/aETHc"
        },
        {
           "id":127,
           "address":"0x17A2194D55f52Fd0C711e0e42B41975494bb109B",
           "description":"SushiSwap LP Token(SLP)-ARMOR/WETH",
           "symbol":"ARMOR/WETH"
        },
        {
           "id":128,
           "address":"0x46ACb1187a6d83e26c0bB46A57Ffeaf23Ad7851E",
           "description":"SushiSwap LP Token(SLP)-WETH/ASSY",
           "symbol":"WETH/ASSY"
        },
        {
           "id":129,
           "address":"0xf79a07cd3488BBaFB86dF1bAd09a6168D935c017",
           "description":"SushiSwap LP Token(SLP)-ALPHA/ibETHv2",
           "symbol":"ALPHA/ibETHv2"
        },
        {
           "id":130,
           "address":"0xb46736888247C68C995B156CA86426ff32e27Cc9",
           "description":"SushiSwap LP Token(SLP)-renDOGE/WETH",
           "symbol":"renDOGE/WETH"
        },
        {
           "id":131,
           "address":"0x0C48aE092A7D35bE0e8AD0e122A02351BA51FeDd",
           "description":"SushiSwap LP Token(SLP)-NCT/WETH",
           "symbol":"NCT/WETH"
        },
        {
           "id":132,
           "address":"0x10B47177E92Ef9D5C6059055d92DdF6290848991",
           "description":"SushiSwap LP Token(SLP)-WETH/yveCRV-DAO",
           "symbol":"WETH/yveCRV-DAO"
        },
        {
           "id":133,
           "address":"0xb270176bA6075196dF88B855c3Ec7776871Fdb33",
           "description":"SushiSwap LP Token(SLP)-TORN/WETH",
           "symbol":"TORN/WETH"
        },
        {
           "id":134,
           "address":"0xf5A434FbAA1C00b33Ea141122603C43dE86cc9FE",
           "description":"SushiSwap LP Token(SLP)-mBTC/WETH",
           "symbol":"mBTC/WETH"
        },
        {
           "id":135,
           "address":"0x132eEb05d5CB6829Bd34F552cDe0b6b708eF5014",
           "description":"SushiSwap LP Token(SLP)-VSP/WETH",
           "symbol":"VSP/WETH"
        },
        {
           "id":136,
           "address":"0xBbfd9B37ec6ea1cA612AB4ADef6d8c6ece1a4134",
           "description":"SushiSwap LP Token(SLP)-WETH/YLD",
           "symbol":"WETH/YLD"
        },
        {
           "id":137,
           "address":"0x1C615074c281c5d88ACc6914D408d7E71Eb894EE",
           "description":"SushiSwap LP Token(SLP)-WETH/stETH",
           "symbol":"WETH/stETH"
        },
        {
           "id":138,
           "address":"0x96F5b7C2bE10dC7dE02Fa8858A8f1Bd19C2fA72A",
           "description":"SushiSwap LP Token(SLP)-DAO/WETH",
           "symbol":"DAO/WETH"
        },
        {
           "id":139,
           "address":"0x7B504a15ef05F4EED1C07208C5815c49022A0C19",
           "description":"SushiSwap LP Token(SLP)-WETH/GRT",
           "symbol":"WETH/GRT"
        },
        {
           "id":140,
           "address":"0x0E26A21013f2F8C0362cFae608b4e69a249D5EFc",
           "description":"SushiSwap LP Token(SLP)-FTM/WETH",
           "symbol":"FTM/WETH"
        },
        {
           "id":141,
           "address":"0xEc78bD3b23aC867FcC028f2db405A1d9A0A2f712",
           "description":"SushiSwap LP Token(SLP)-WETH/ANY",
           "symbol":"WETH/ANY"
        },
        {
           "id":142,
           "address":"0x092493a22375DE1B17583D924aBf9e8bf884491C",
           "description":"SushiSwap LP Token(SLP)-PUNK/WETH",
           "symbol":"PUNK/WETH"
        },
        {
           "id":143,
           "address":"0xfd38565Ef22299D491055F0c508F62DD9a669F0F",
           "description":"SushiSwap LP Token(SLP)-MASK/WETH",
           "symbol":"MASK/WETH"
        },
        {
           "id":144,
           "address":"0x0267BD35789a5ce247Fff6CB1D597597e003cc43",
           "description":"SushiSwap LP Token(SLP)-PUNK-BASIC/WETH",
           "symbol":"PUNK-BASIC/WETH"
        },
        {
           "id":145,
           "address":"0xCA2Ae9C5C491F497DC5625fEaef4572076C946C5",
           "description":"SushiSwap LP Token(SLP)-PUNK-FEMALE/WETH",
           "symbol":"PUNK-FEMALE/WETH"
        },
        {
           "id":146,
           "address":"0x608f8af5fd49b5a5421f53f79920C45b96bdA83F",
           "description":"SushiSwap LP Token(SLP)-PUNK-ATTR-4/WETH",
           "symbol":"PUNK-ATTR-4/WETH"
        },
        {
           "id":147,
           "address":"0xd54A895623552853F8D673981CC32EB8f3929dFB",
           "description":"SushiSwap LP Token(SLP)-PUNK-ATTR-5/WETH",
           "symbol":"PUNK-ATTR-5/WETH"
        },
        {
           "id":148,
           "address":"0x0E7E8Dde18e4016ccc15F12301a47eF7B87Bdafa",
           "description":"SushiSwap LP Token(SLP)-WETH/PUNK-ZOMBIE",
           "symbol":"WETH/PUNK-ZOMBIE"
        },
        {
           "id":149,
           "address":"0xF39fF863730268C9bb867b3a69d031d1C1614b31",
           "description":"SushiSwap LP Token(SLP)-XFT/WETH",
           "symbol":"XFT/WETH"
        },
        {
           "id":150,
           "address":"0x0BC5AE46c32D99C434b7383183ACa16DD6E9BdC8",
           "description":"SushiSwap LP Token(SLP)-WETH/ZRX",
           "symbol":"WETH/ZRX"
        },
        {
           "id":151,
           "address":"0x3cf1Cf47Bc87C23cD9410549BD8a75E82C1c73cF",
           "description":"SushiSwap LP Token(SLP)-USDN/WETH",
           "symbol":"USDN/WETH"
        },
        {
           "id":152,
           "address":"0xA3DfbF2933FF3d96177bde4928D0F5840eE55600",
           "description":"SushiSwap LP Token(SLP)-DERI/USDT",
           "symbol":"DERI/USDT"
        },
        {
           "id":153,
           "address":"0x93E2F3a8277E0360081547D711446e4a1F83546D",
           "description":"SushiSwap LP Token(SLP)-PREMIA/WETH",
           "symbol":"PREMIA/WETH"
        },
        {
           "id":154,
           "address":"0x938625591ADb4e865b882377e2c965F9f9b85E34",
           "description":"SushiSwap LP Token(SLP)-BANK/WETH",
           "symbol":"BANK/WETH"
        },
        {
           "id":155,
           "address":"0x38A0469520534fC70c9C0b9DE4B8649e36A2aE3E",
           "description":"SushiSwap LP Token(SLP)-LINA/WETH",
           "symbol":"LINA/WETH"
        },
        {
           "id":156,
           "address":"0x8486c538DcBD6A707c5b3f730B6413286FE8c854",
           "description":"SushiSwap LP Token(SLP)-PERP/WETH",
           "symbol":"PERP/WETH"
        },
        {
           "id":157,
           "address":"0x9c86BC3C72Ab97c2234CBA8c6c7069009465AE86",
           "description":"SushiSwap LP Token(SLP)-WSCRT/WETH",
           "symbol":"WSCRT/WETH"
        },
        {
           "id":158,
           "address":"0xB0484fB3aC155AaF7d024b20f1a569ddD6332c32",
           "description":"SushiSwap LP Token(SLP)-USDP/WETH",
           "symbol":"USDP/WETH"
        },
        {
           "id":159,
           "address":"0xFe308FE2Eb938F772807AEc2E87Fc762d47c40E0",
           "description":"SushiSwap LP Token(SLP)-USDP/DUCK",
           "symbol":"USDP/DUCK"
        },
        {
           "id":160,
           "address":"0xD3c41c080a73181e108E0526475a690F3616a859",
           "description":"SushiSwap LP Token(SLP)-DEXTF/WETH",
           "symbol":"DEXTF/WETH"
        },
        {
           "id":162,
           "address":"0x1803a3386d44f65746403060aB0137682F554484",
           "description":"SushiSwap LP Token(SLP)-oneVBTC/WETH",
           "symbol":"oneVBTC/WETH"
        },
        {
           "id":163,
           "address":"0x05Cc2e064e0B48e46015EAd9961F1391d74E5F83",
           "description":"SushiSwap LP Token(SLP)-$TRDL/WETH",
           "symbol":"$TRDL/WETH"
        },
        {
           "id":164,
           "address":"0x75382c52b6F90B3f8014BfcadAC2386513F1e3bC",
           "description":"SushiSwap LP Token(SLP)-RLC/WETH",
           "symbol":"RLC/WETH"
        },
        {
           "id":165,
           "address":"0xF9440fEDC72A0B8030861DcDac39A75b544E7A3c",
           "description":"SushiSwap LP Token(SLP)-bDIGG/WETH",
           "symbol":"bDIGG/WETH"
        },
        {
           "id":166,
           "address":"0x0a54d4b378C8dBfC7bC93BE50C85DebAFdb87439",
           "description":"SushiSwap LP Token(SLP)-bBADGER/WETH",
           "symbol":"bBADGER/WETH"
        },
        {
           "id":167,
           "address":"0x87B6f3A2DC6E541A9ce40E58f517953782Ae614E",
           "description":"SushiSwap LP Token(SLP)-YLA/USDC",
           "symbol":"YLA/USDC"
        },
        {
           "id":168,
           "address":"0x90825ADd1AD30d7DCeFEa12c6704A192be6eE94E",
           "description":"SushiSwap LP Token(SLP)-PUNK-BASIC/NFTX",
           "symbol":"PUNK-BASIC/NFTX"
        },
        {
           "id":169,
           "address":"0x31fa985bB0C282a814E7f3f0Dce88B2A44197F60",
           "description":"SushiSwap LP Token(SLP)-MASK/USDC",
           "symbol":"MASK/USDC"
        },
        {
           "id":170,
           "address":"0xf13eEF1C6485348B9C9FA0d5Df2d89AccC5b0147",
           "description":"SushiSwap LP Token(SLP)-WETH/ROOK",
           "symbol":"WETH/ROOK"
        },
        {
           "id":171,
           "address":"0x5e496B7D72362ADd1EEA7D4903Ee2732cD00587d",
           "description":"SushiSwap LP Token(SLP)-SX/WETH",
           "symbol":"SX/WETH"
        },
        {
           "id":172,
           "address":"0xBE71372995E8e920E4E72a29a51463677A302E8d",
           "description":"SushiSwap LP Token(SLP)-DFX/WETH",
           "symbol":"DFX/WETH"
        },
        {
           "id":173,
           "address":"0x328dFd0139e26cB0FEF7B0742B49b0fe4325F821",
           "description":"SushiSwap LP Token(SLP)-INV/WETH",
           "symbol":"INV/WETH"
        },
        {
           "id":174,
           "address":"0xB5c40E038c997c2946B24dC179F7CdcD279d8847",
           "description":"SushiSwap LP Token(SLP)-stFIRO/stETH",
           "symbol":"stFIRO/stETH"
        },
        {
           "id":175,
           "address":"0xeE35E548C7457FcDd51aE95eD09108be660Ea374",
           "description":"SushiSwap LP Token(SLP)-OCEAN/WETH",
           "symbol":"OCEAN/WETH"
        },
        {
           "id":176,
           "address":"0xf5ca27927Ffb16BD8C870Dcb49750146CCe8217c",
           "description":"SushiSwap LP Token(SLP)-WOO/USDC",
           "symbol":"WOO/USDC"
        },
        {
           "id":177,
           "address":"0x91A48c69Ec3f3cE855FE5054F82D2bef8Fd66C43",
           "description":"SushiSwap LP Token(SLP)-pONT/pWING",
           "symbol":"pONT/pWING"
        },
        {
           "id":178,
           "address":"0xa1f967F25AE32bD3435E45EA8657De16Ce5A4Ae6",
           "description":"SushiSwap LP Token(SLP)-DNT/WETH",
           "symbol":"DNT/WETH"
        },
        {
           "id":179,
           "address":"0x9E48FaDf799E0513d2EF4631478ea186741fA617",
           "description":"SushiSwap LP Token(SLP)-AERGO/WETH",
           "symbol":"AERGO/WETH"
        },
        {
           "id":180,
           "address":"0x7835cB043e8d53a5b361D489956d6c30808349da",
           "description":"SushiSwap LP Token(SLP)-WBTC/POLY",
           "symbol":"WBTC/POLY"
        },
        {
           "id":181,
           "address":"0xc7FF546c6CbC87Ad9f6F557db5A0df5c742cA440",
           "description":"SushiSwap LP Token(SLP)-EGT/WETH",
           "symbol":"EGT/WETH"
        },
        {
           "id":182,
           "address":"0x033f4A33823595A6dD9dF0672Fd94DE32C65c415",
           "description":"SushiSwap LP Token(SLP)-stZEN/stETH",
           "symbol":"stZEN/stETH"
        },
        {
           "id":183,
           "address":"0xA872D244B8948DFD6Cb7Bd19f79E7C1bfb7DB4a0",
           "description":"SushiSwap LP Token(SLP)-MUST/WETH",
           "symbol":"MUST/WETH"
        },
        {
           "id":184,
           "address":"0x750d711277Fd27D1EC5256F13f5110E097713a95",
           "description":"SushiSwap LP Token(SLP)-MARK/WETH",
           "symbol":"MARK/WETH"
        },
        {
           "id":185,
           "address":"0x34d7d7Aaf50AD4944B70B320aCB24C95fa2def7c",
           "description":"SushiSwap LP Token(SLP)-OHM/DAI",
           "symbol":"OHM/DAI"
        },
        {
           "id":186,
           "address":"0x577959C519c24eE6ADd28AD96D3531bC6878BA34",
           "description":"SushiSwap LP Token(SLP)-POOL/WETH",
           "symbol":"POOL/WETH"
        },
        {
           "id":187,
           "address":"0x662511a91734AEa8b06EF770D6Ed51cC539772d0",
           "description":"SushiSwap LP Token(SLP)-WETH/YLD",
           "symbol":"WETH/YLD"
        },
        {
           "id":188,
           "address":"0xa30911e072A0C88D55B5D0A0984B66b0D04569d0",
           "description":"SushiSwap LP Token(SLP)-BZRX/WETH",
           "symbol":"BZRX/WETH"
        },
        {
           "id":230,
           "address":"0x9461173740D27311b176476FA27e94C681b1Ea6b",
           "description":"SushiSwap LP Token(SLP)-yvBOOST/WETH",
           "symbol":"yvBOOST/WETH"
        },
        {
           "id":231,
           "address":"0x0C365789DbBb94A29F8720dc465554c587e897dB",
           "description":"SushiSwap LP Token(SLP)-AXS/WETH",
           "symbol":"AXS/WETH"
        },
        {
           "id":232,
           "address":"0x8d782C5806607E9AAFB2AC38c1DA3838Edf8BD03",
           "description":"SushiSwap LP Token(SLP)-BDI/WETH",
           "symbol":"BDI/WETH"
        },
        {
           "id":233,
           "address":"0x34D25a4749867eF8b62A0CD1e2d7B4F7aF167E01",
           "description":"SushiSwap LP Token(SLP)-BASK/WETH",
           "symbol":"BASK/WETH"
        },
        {
           "id":234,
           "address":"0x164FE0239d703379Bddde3c80e4d4800A1cd452B",
           "description":"SushiSwap LP Token(SLP)-BTC2x-FLI/WBTC",
           "symbol":"BTC2x-FLI/WBTC"
        },
        {
           "id":235,
           "address":"0x18d98D452072Ac2EB7b74ce3DB723374360539f1",
           "description":"SushiSwap LP Token(SLP)-WBTC/ibBTC",
           "symbol":"WBTC/ibBTC"
        },
        {
           "id":236,
           "address":"0x4Fb3CAe84a1264b8BB1911e8915F56660eC8178E",
           "description":"SushiSwap LP Token(SLP)-ZIG/WETH",
           "symbol":"ZIG/WETH"
        },
        {
           "id":237,
           "address":"0x41848373dec2867ef3924E47B2eBD0EE645a54F9",
           "description":"SushiSwap LP Token(SLP)-MM/WETH",
           "symbol":"MM/WETH"
        },
        {
           "id":238,
           "address":"0x37922C69b08BABcCEaE735A31235c81f1d1e8E43",
           "description":"SushiSwap LP Token(SLP)-PENDLE/WETH",
           "symbol":"PENDLE/WETH"
        },
        {
           "id":239,
           "address":"0x69ab811953499Eb253c5a69aE06275A42b97c9aE",
           "description":"SushiSwap LP Token(SLP)-PMON/WETH",
           "symbol":"PMON/WETH"
        },
        {
           "id":240,
           "address":"0x1bEC4db6c3Bc499F3DbF289F5499C30d541FEc97",
           "description":"SushiSwap LP Token(SLP)-MANA/WETH",
           "symbol":"MANA/WETH"
        },
        {
           "id":241,
           "address":"0x8F9ef75CD6E610Dd8Acf8611c344573032fB9c3d",
           "description":"SushiSwap LP Token(SLP)-WASABI/WETH",
           "symbol":"WASABI/WETH"
        },
        {
           "id":242,
           "address":"0xC79FAEed130816B38E5996b79B1b3b6568cc599F",
           "description":"SushiSwap LP Token(SLP)-DRC/WETH",
           "symbol":"DRC/WETH"
        },
        {
           "id":243,
           "address":"0xd3dA6236aEcb6b55F571249c011B8EEC340a418E",
           "description":"SushiSwap LP Token(SLP)-WETH/$DG",
           "symbol":"WETH/$DG"
        },
        {
           "id":244,
           "address":"0x6a091a3406E0073C3CD6340122143009aDac0EDa",
           "description":"SushiSwap LP Token(SLP)-ILV/WETH",
           "symbol":"ILV/WETH"
        },
        {
           "id":251,
           "address":"0x804Be24f625C7E23eDd9Fa68e4582590c57ad2B3",
           "description":"SushiSwap LP Token(SLP)-BLO/WETH",
           "symbol":"BLO/WETH"
        },
        {
           "id":252,
           "address":"0x3bFcA4FB8054fA42DA3E77749b21450a1290beED",
           "description":"SushiSwap LP Token(SLP)-LDN/WETH",
           "symbol":"LDN/WETH"
        },
        {
           "id":253,
           "address":"0x9AC60b8B33092C2c0B4CA5Af0DEC2bcb84657E12",
           "description":"SushiSwap LP Token(SLP)-WETH/WOOFY",
           "symbol":"WETH/WOOFY"
        },
        {
           "id":254,
           "address":"0x0780B42B3c4cAF41933CFC0040d2853363De20A7",
           "description":"SushiSwap LP Token(SLP)-YFI/WOOFY",
           "symbol":"YFI/WOOFY"
        },
        {
           "id":255,
           "address":"0x82EbCD936C9E938704b65027850E42393F8BC4d4",
           "description":"SushiSwap LP Token(SLP)-NAOS/WETH",
           "symbol":"NAOS/WETH"
        },
        {
           "id":256,
           "address":"0x7229d526d5fD693720B88Eb7129058dB5D497BCe",
           "description":"SushiSwap LP Token(SLP)-UMB/WETH",
           "symbol":"UMB/WETH"
        },
        {
           "id":257,
           "address":"0x87b918e76c92818DB0c76a4E174447aeE6E6D23f",
           "description":"SushiSwap LP Token(SLP)-MOVE/WETH",
           "symbol":"MOVE/WETH"
        },
        {
           "id":258,
           "address":"0xe73ad09925201F21b607ccADA9A371C12A2f49C3",
           "description":"SushiSwap LP Token(SLP)-LEV/WETH",
           "symbol":"LEV/WETH"
        },
        {
           "id":259,
           "address":"0x2F8AC927aa94293461C75406e90Ec0cCFb2748d9",
           "description":"SushiSwap LP Token(SLP)-WETH/MLN",
           "symbol":"WETH/MLN"
        },
        {
           "id":260,
           "address":"0xb1EECFea192907fC4bF9c4CE99aC07186075FC51",
           "description":"SushiSwap LP Token(SLP)-RULER/WETH",
           "symbol":"RULER/WETH"
        },
        {
           "id":268,
           "address":"0x57024267e8272618f9c5037D373043a8646507e5",
           "description":"SushiSwap LP Token(SLP)-BPT/WETH",
           "symbol":"BPT/WETH"
        },
        {
           "id":269,
           "address":"0x6469B34a2a4723163C4902dbBdEa728D20693C12",
           "description":"SushiSwap LP Token(SLP)-NEAR/WETH",
           "symbol":"NEAR/WETH"
        },
        {
           "id":270,
           "address":"0x2c51eaa1BCc7b013C3f1D5985cDcB3c56DC3fbc1",
           "description":"SushiSwap LP Token(SLP)-BANK/WETH",
           "symbol":"BANK/WETH"
        },
        {
           "id":271,
           "address":"0x0589e281D35ee1Acf6D4fd32f1fbA60EFfb5281B",
           "description":"SushiSwap LP Token(SLP)-alUSD/WETH",
           "symbol":"alUSD/WETH"
        },
        {
           "id":272,
           "address":"0xD45Afa3649e57a961C001b935deD1c79D81A9d23",
           "description":"SushiSwap LP Token(SLP)-USDC/SAK3",
           "symbol":"USDC/SAK3"
        },
        {
           "id":273,
           "address":"0x613C836DF6695c10f0f4900528B6931441Ac5d5a",
           "description":"SushiSwap LP Token(SLP)-BOND/WETH",
           "symbol":"BOND/WETH"
        },
        {
           "id":274,
           "address":"0x0BB6e2a9858A089437EC678dA05E559Ffe0Af5b2",
           "description":"SushiSwap LP Token(SLP)-bb_cDAI/DAI",
           "symbol":"bb_cDAI/DAI"
        },
        {
           "id":275,
           "address":"0xA914a9b9E03b6aF84F9c6bd2e0e8d27D405695Db",
           "description":"SushiSwap LP Token(SLP)-WETH/FOLD",
           "symbol":"WETH/FOLD"
        },
        {
           "id":276,
           "address":"0x8911fce375a8414B1b578BE66eE691A8D2D4DBf7",
           "description":"SushiSwap LP Token(SLP)-NDX/WETH",
           "symbol":"NDX/WETH"
        },
        {
           "id":277,
           "address":"0xe8eB0f7B866A85DA49401D04FfFcfC1aBbF24Dfd",
           "description":"SushiSwap LP Token(SLP)-DEGEN/WETH",
           "symbol":"DEGEN/WETH"
        },
        {
           "id":278,
           "address":"0x986627dB5E4AAE987f580feB63D475992e5aC0AE",
           "description":"SushiSwap LP Token(SLP)-WETH/1ONE",
           "symbol":"WETH/1ONE"
        },
        {
           "id":279,
           "address":"0x17890DeB188F2dE6C3e966e053dA1C9a111Ed4A5",
           "description":"SushiSwap LP Token(SLP)-USDC/CQT",
           "symbol":"USDC/CQT"
        },
        {
           "id":280,
           "address":"0xe93b1b5E1dAdCE8152A69470C1b31463aF260296",
           "description":"SushiSwap LP Token(SLP)-USDT/DVF",
           "symbol":"USDT/DVF"
        },
        {
           "id":281,
           "address":"0x1241F4a348162d99379A23E73926Cf0bfCBf131e",
           "description":"SushiSwap LP Token(SLP)-ANKR/WETH",
           "symbol":"ANKR/WETH"
        },
        {
           "id":282,
           "address":"0x0652687E87a4b8b5370b05bc298Ff00d205D9B5f",
           "description":"SushiSwap LP Token(SLP)-WETH/ONX",
           "symbol":"WETH/ONX"
        },
        {
           "id":283,
           "address":"0xa2D81bEdf22201A77044CDF3Ab4d9dC1FfBc391B",
           "description":"SushiSwap LP Token(SLP)-ibEUR/WETH",
           "symbol":"ibEUR/WETH"
        },
        {
           "id":284,
           "address":"0x82DBc2673e9640343D263a3c55DE49021AD39aE2",
           "description":"SushiSwap LP Token(SLP)-EDEN/WETH",
           "symbol":"EDEN/WETH"
        },
        {
           "id":285,
           "address":"0xdBaa04796CB5C05D02B8A41B702d9b67c13c9fa9",
           "description":"SushiSwap LP Token(SLP)-TOWER/WETH",
           "symbol":"TOWER/WETH"
        },
        {
           "id":286,
           "address":"0x8775aE5e83BC5D926b6277579c2B0d40c7D9b528",
           "description":"SushiSwap LP Token(SLP)-DPI/FEI",
           "symbol":"DPI/FEI"
        },
        {
           "id":287,
           "address":"0xBBBdB106A806173d1eEa1640961533fF3114d69A",
           "description":"SushiSwap LP Token(SLP)-XYZ/USDC",
           "symbol":"XYZ/USDC"
        },
        {
           "id":288,
           "address":"0xb90047676cC13e68632c55cB5b7cBd8A4C5A0A8E",
           "description":"SushiSwap LP Token(SLP)-VUSD/WETH",
           "symbol":"VUSD/WETH"
        },
        {
           "id":289,
           "address":"0xada8B1613ce6Fe75f3549Fa4eB2A993ca1220A7c",
           "description":"SushiSwap LP Token(SLP)-PIXEL/WETH",
           "symbol":"PIXEL/WETH"
        },
        {
           "id":290,
           "address":"0x8597fa0773888107E2867D36dd87Fe5bAFeAb328",
           "description":"SushiSwap LP Token(SLP)-WETH/SLP",
           "symbol":"WETH/SLP"
        },
        {
           "id":291,
           "address":"0xb124C4e18A282143D362a066736FD60d22393Ef4",
           "description":"SushiSwap LP Token(SLP)-PENDLE/OT-SLP-29DEC2022",
           "symbol":"PENDLE/OT-SLP-29DEC2022"
        },
        {
           "id":292,
           "address":"0xc96F20099d96b37D7Ede66fF9E4DE59b9B1065b1",
           "description":"SushiSwap LP Token(SLP)-DOG/WETH",
           "symbol":"DOG/WETH"
        },
        {
           "id":293,
           "address":"0x77337FF10206480739a768124A18f3aA8C089153",
           "description":"SushiSwap LP Token(SLP)-WETH/ID",
           "symbol":"WETH/ID"
        },
        {
           "id":294,
           "address":"0xeEFA3b448768dD561Af4F743C9e925987A1F8D09",
           "description":"SushiSwap LP Token(SLP)-WETH/NFD",
           "symbol":"WETH/NFD"
        },
        {
           "id":295,
           "address":"0x279Ca79d5fb2490721512C8Ae4767E249D75F41B",
           "description":"SushiSwap LP Token(SLP)-LUSD/WETH",
           "symbol":"LUSD/WETH"
        },
        {
           "id":296,
           "address":"0x0d15e893cf50724382368CAFEd222CF131B55307",
           "description":"SushiSwap LP Token(SLP)-AGLD/WETH",
           "symbol":"AGLD/WETH"
        },
        {
           "id":297,
           "address":"0x1cB9E12b35199BEE15d9eE13696B87bb777776dd",
           "description":"SushiSwap LP Token(SLP)-BGLD/WETH",
           "symbol":"BGLD/WETH"
        },
        {
           "id":298,
           "address":"0xb5De0C3753b6E1B4dBA616Db82767F17513E6d4E",
           "description":"SushiSwap LP Token(SLP)-SPELL/WETH",
           "symbol":"SPELL/WETH"
        },
        {
           "id":300,
           "address":"0x9cEE2ad771B57555C93F55D8bAbc3c8a221E3b74",
           "description":"SushiSwap LP Token(SLP)-WETH/renFIL",
           "symbol":"WETH/renFIL"
        },
        {
           "id":301,
           "address":"0x53813285cc60b13fCd2105C6472a47af01f8Ac84",
           "description":"SushiSwap LP Token(SLP)-BMI/WETH",
           "symbol":"BMI/WETH"
        },
        {
           "id":302,
           "address":"0xc926990039045611eb1DE520C1E249Fd0d20a8eA",
           "description":"SushiSwap LP Token(SLP)-REVV/WETH",
           "symbol":"REVV/WETH"
        },
        {
           "id":303,
           "address":"0x400043e27415773e4a509c53ac5d7D3c036f6D92",
           "description":"SushiSwap LP Token(SLP)-KAE/WETH",
           "symbol":"KAE/WETH"
        },
        {
           "id":304,
           "address":"0x0beC54c89a7d9F15C4e7fAA8d47ADEdF374462eD",
           "description":"SushiSwap LP Token(SLP)-BiFi/WETH",
           "symbol":"BiFi/WETH"
        },
        {
           "id":305,
           "address":"0x4A86C01d67965f8cB3d0AAA2c655705E64097C31",
           "description":"SushiSwap LP Token(SLP)-SYN/WETH",
           "symbol":"SYN/WETH"
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

      // deploy Sushiswap Product
      product = (await deployContract(
        deployer,
        artifacts.SushiswapProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          SUSHI_V2_FACTORY_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as SushiswapProduct;

       // deploy Sushiswap Product
       product2 = (await deployContract(
        deployer,
        artifacts.SushiswapProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          SUSHI_V2_FACTORY_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as SushiswapProduct;
      
      await vault.connect(deployer).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product.address, 1, 11044, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as sushiswap v2 factory address", async function () {
        expect(await product.coveredPlatform()).to.equal(SUSHI_V2_FACTORY_ADDRESS);
        expect(await product.sushiV2Factory()).to.equal(SUSHI_V2_FACTORY_ADDRESS);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(policyholder1).setCoveredPlatform(policyholder1.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.sushiV2Factory()).to.equal(treasury.address);
        await product.connect(governor).setCoveredPlatform(SUSHI_V2_FACTORY_ADDRESS);
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
      it("cannot have non slp tokens", async function () {
        // would like to.be.false, to.be.reverted will work though
        await expect( product.isValidPositionDescription("REAL_USER")).to.be.reverted;
        await expect( product.isValidPositionDescription(REAL_USER)).to.be.reverted;
        await expect( product.isValidPositionDescription(encodeAddresses([REAL_USER]))).to.be.reverted;
        await expect( product.isValidPositionDescription(governor.address)).to.be.reverted;
        await expect( product.isValidPositionDescription(SUSHI_V2_FACTORY_ADDRESS)).to.be.reverted;
        await expect( product.isValidPositionDescription(encodeAddresses([ZERO_ADDRESS]))).to.be.reverted;
        await expect( product.isValidPositionDescription(encodeAddresses([slpTokens[0].address, ZERO_ADDRESS]))).to.be.reverted;
      });
      it("can be one slp token", async function() {
       
        for (var i = 0; i < slpTokens.length/2; ++i) {
          let status = await product.isValidPositionDescription(encodeAddresses([slpTokens[i].address]));
          if (!status) {
            console.log("Bad position: ", slpTokens[i].address);
          }
          expect(await product.isValidPositionDescription(encodeAddresses([slpTokens[i].address]))).to.be.true;
        }
      });
      it("can be more slp tokens", async function () {
        for(var i = 0; i < slpTokens.length/2; ++i) {
          // don't care about duplicates
          for(var j = 0; j < slpTokens.length/2; ++j) {
            expect(await product.isValidPositionDescription(encodeAddresses([slpTokens[i].address, slpTokens[j].address]))).to.be.true;
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
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, slpTokens[0].address, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, slpTokens[0].address, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
        expect(await policyManager.totalSupply()).to.equal(2);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(2);
      });
      it("can buy policy that covers multiple positions", async function () {
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, encodeAddresses([slpTokens[0].address, slpTokens[1].address]), { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(3);
        expect(await policyManager.totalSupply()).to.equal(3);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(3);
      });
      it("can get product name", async function () {
        expect(await product.name()).to.equal("Sushiswap");
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
        await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, slpTokens[0].address, { value: expectedPremium });
        await product.connect(policyholder2).buyPolicy(policyholder2.address, coverAmount, blocks, slpTokens[1].address, { value: expectedPremium });
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
      it("should support sufficient sushiswap slp tokens", async function () {
        let success = 0;
        let successList = [];
        let failList = [];
        const size = 50;
        for (let i = 0; i < size; i++) {
          const lpTokenAddress = slpTokens[i].address;
          const symbol = slpTokens[i].symbol;
          try {
            // create policy
            await product.connect(policyholder3).buyPolicy(policyholder3.address, coverAmount, blocks, lpTokenAddress, { value: expectedPremium });
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
          console.log("supported slp tokens:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
          console.log("unsupported slp tokens:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
        }
        expect(`${success}/${size} supported slp tokens`).to.equal(`${size}/${size} supported slp tokens`);
      });
    });
  });
}

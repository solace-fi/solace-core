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
import { PolicyManager, UniswapV2Product, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { encodeAddresses } from "./utilities/positionDescription";

const DOMAIN_NAME = "Solace.fi-UniswapV2Product";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("UniswapV2ProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("InvalidType(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

if(process.env.FORK_NETWORK === "mainnet"){
  describe("UniswapV2Product", function () {
    const [deployer, governor, policyholder1, policyholder2, policyholder3, depositor, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: UniswapV2Product;
    let product2: UniswapV2Product;
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

    const UNISWAP_V2_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
    const REAL_USER = "0x5dcd83cf2dd90a4c7e1c189e74ec7dc072ad78e1";
    const COOLDOWN_PERIOD = 3600; // one hour

    const uniTokens = [
      {
         "id":0,
         "address":"0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
         "description":"Uniswap V2(UNI-V2)-USDC/WETH",
         "symbol":"USDC/WETH"
      },
      {
         "id":1,
         "address":"0x3139Ffc91B99aa94DA8A2dc13f1fC36F9BDc98eE",
         "description":"Uniswap V2(UNI-V2)-USDP/USDC",
         "symbol":"USDP/USDC"
      },
      {
         "id":2,
         "address":"0x12EDE161c702D1494612d19f05992f43aa6A26FB",
         "description":"Uniswap V2(UNI-V2)-CHAI/WETH",
         "symbol":"CHAI/WETH"
      },
      {
         "id":3,
         "address":"0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11",
         "description":"Uniswap V2(UNI-V2)-DAI/WETH",
         "symbol":"DAI/WETH"
      },
      {
         "id":4,
         "address":"0x07F068ca326a469Fc1d87d85d448990C8cBa7dF9",
         "description":"Uniswap V2(UNI-V2)-REN/USDC",
         "symbol":"REN/USDC"
      },
      {
         "id":5,
         "address":"0xAE461cA67B15dc8dc81CE7615e0320dA1A9aB8D5",
         "description":"Uniswap V2(UNI-V2)-DAI/USDC",
         "symbol":"DAI/USDC"
      },
      {
         "id":6,
         "address":"0xCe407CD7b95B39d3B4d53065E711e713dd5C5999",
         "description":"Uniswap V2(UNI-V2)-WETH/HAY",
         "symbol":"WETH/HAY"
      },
      {
         "id":7,
         "address":"0x33C2d48Bc95FB7D0199C5C693e7a9F527145a9Af",
         "description":"Uniswap V2(UNI-V2)-BNT/DAI",
         "symbol":"BNT/DAI"
      },
      {
         "id":8,
         "address":"0xB6909B960DbbE7392D405429eB2b3649752b4838",
         "description":"Uniswap V2(UNI-V2)-BAT/WETH",
         "symbol":"BAT/WETH"
      },
      {
         "id":9,
         "address":"0x30EB5E15476E6a80F4F3cd8479749b4881DAB1b8",
         "description":"Uniswap V2(UNI-V2)-cUSDC/cDAI",
         "symbol":"cUSDC/cDAI"
      },
      {
         "id":10,
         "address":"0xBb2b8038a1640196FbE3e38816F3e67Cba72D940",
         "description":"Uniswap V2(UNI-V2)-WBTC/WETH",
         "symbol":"WBTC/WETH"
      },
      {
         "id":11,
         "address":"0x9896BD979f9DA57857322Cc15e154222C4658a5a",
         "description":"Uniswap V2(UNI-V2)-cDAI/WETH",
         "symbol":"cDAI/WETH"
      },
      {
         "id":12,
         "address":"0x598E740cda7C525080d3FCb9Fa7C4E1bd0044B34",
         "description":"Uniswap V2(UNI-V2)-sETH/WETH",
         "symbol":"sETH/WETH"
      },
      {
         "id":13,
         "address":"0x43AE24960e5534731Fc831386c07755A2dc33D47",
         "description":"Uniswap V2(UNI-V2)-SNX/WETH",
         "symbol":"SNX/WETH"
      },
      {
         "id":14,
         "address":"0x231F3381D10478BfC2cA552195b9d8B15968B60c",
         "description":"Uniswap V2(UNI-V2)-XBASE/WETH",
         "symbol":"XBASE/WETH"
      },
      {
         "id":15,
         "address":"0x3b0F0fe3Be830826D833a67cD1d7C80edF3Fb49b",
         "description":"Uniswap V2(UNI-V2)-EBASE/WETH",
         "symbol":"EBASE/WETH"
      },
      {
         "id":16,
         "address":"0x67660E35fee501d0876B9493bb5eC90E10675957",
         "description":"Uniswap V2(UNI-V2)-ADX/WETH",
         "symbol":"ADX/WETH"
      },
      {
         "id":17,
         "address":"0x260E069deAd76baAC587B5141bB606Ef8b9Bab6c",
         "description":"Uniswap V2(UNI-V2)-SHUF/WETH",
         "symbol":"SHUF/WETH"
      },
      {
         "id":18,
         "address":"0x5D27dF1a6E03254E4f1218607D8E073667ffae2F",
         "description":"Uniswap V2(UNI-V2)-SNGLS/WETH",
         "symbol":"SNGLS/WETH"
      },
      {
         "id":19,
         "address":"0xB784CED6994c928170B417BBd052A096c6fB17E2",
         "description":"Uniswap V2(UNI-V2)-NMR/WETH",
         "symbol":"NMR/WETH"
      },
      {
         "id":20,
         "address":"0xa2107FA5B38d9bbd2C461D6EDf11B11A50F6b974",
         "description":"Uniswap V2(UNI-V2)-LINK/WETH",
         "symbol":"LINK/WETH"
      },
      {
         "id":21,
         "address":"0xECD65D5FF4D2c6511091FC8Fe8765a237dBF1195",
         "description":"Uniswap V2(UNI-V2)-ADX/DAI",
         "symbol":"ADX/DAI"
      },
      {
         "id":22,
         "address":"0x718Dd8B743ea19d71BDb4Cb48BB984b73a65cE06",
         "description":"Uniswap V2(UNI-V2)-WETH/DONUT",
         "symbol":"WETH/DONUT"
      },
      {
         "id":23,
         "address":"0x55D5c232D921B9eAA6b37b5845E439aCD04b4DBa",
         "description":"Uniswap V2(UNI-V2)-HEX/WETH",
         "symbol":"HEX/WETH"
      },
      {
         "id":24,
         "address":"0xa5E79baEe540f000ef6F23D067cd3AC22c7d9Fe6",
         "description":"Uniswap V2(UNI-V2)-CEL/WETH",
         "symbol":"CEL/WETH"
      },
      {
         "id":26,
         "address":"0x392D008A7133544D88C6ceeb999880a8ba71Aa3e",
         "description":"Uniswap V2(UNI-V2)-ANT/USDC",
         "symbol":"ANT/USDC"
      },
      {
         "id":27,
         "address":"0x99731C13ef1aaB58e48FA9a96deFEFdf1b8DE164",
         "description":"Uniswap V2(UNI-V2)-FMXT/WETH",
         "symbol":"FMXT/WETH"
      },
      {
         "id":28,
         "address":"0xad3B5027d090b7bc120Dc264906ca4642b0fb9F3",
         "description":"Uniswap V2(UNI-V2)-Dap/WETH",
         "symbol":"Dap/WETH"
      },
      {
         "id":29,
         "address":"0xF49144E61C05120f1b167E4B4F59cf0a5d77903F",
         "description":"Uniswap V2(UNI-V2)-1UP/WETH",
         "symbol":"1UP/WETH"
      },
      {
         "id":30,
         "address":"0xc5be99A02C6857f9Eac67BbCE58DF5572498F40c",
         "description":"Uniswap V2(UNI-V2)-WETH/AMPL",
         "symbol":"WETH/AMPL"
      },
      {
         "id":31,
         "address":"0x0865b9C7Cd9aa9F0e9F61E96C11e524145b70550",
         "description":"Uniswap V2(UNI-V2)-sUSD/USDC",
         "symbol":"sUSD/USDC"
      },
      {
         "id":32,
         "address":"0xC5A788F63e5D9cF2C324621EEd51A98F85AE373b",
         "description":"Uniswap V2(UNI-V2)-DZAR/WETH",
         "symbol":"DZAR/WETH"
      },
      {
         "id":33,
         "address":"0x8AeC9fa239417C8Eb778728c175f2B5C36CB1cCf",
         "description":"Uniswap V2(UNI-V2)-RCLE/WETH",
         "symbol":"RCLE/WETH"
      },
      {
         "id":34,
         "address":"0x0FFC70bE6e2d841e109653ddb3034961591679d6",
         "description":"Uniswap V2(UNI-V2)-WETH/ANJ",
         "symbol":"WETH/ANJ"
      },
      {
         "id":35,
         "address":"0x70EA56e46266f0137BAc6B75710e3546f47C855D",
         "description":"Uniswap V2(UNI-V2)-RPL/WETH",
         "symbol":"RPL/WETH"
      },
      {
         "id":36,
         "address":"0x596A92F8d8b8906fae8e3Dad346284f354830E1a",
         "description":"Uniswap V2(UNI-V2)-AMN/WETH",
         "symbol":"AMN/WETH"
      },
      {
         "id":38,
         "address":"0x8a982c9430c5bA14F3Ecfa4A910704D0ab474D04",
         "description":"Uniswap V2(UNI-V2)-XBASE/EBASE",
         "symbol":"XBASE/EBASE"
      },
      {
         "id":39,
         "address":"0xD6054455Ca2e1AEf02178E0462D9ab953bEA4e23",
         "description":"Uniswap V2(UNI-V2)-XDATA/WETH",
         "symbol":"XDATA/WETH"
      },
      {
         "id":40,
         "address":"0x6AeEbC2f5c979FD5C4361C2d288E55Ac6b7e39Bb",
         "description":"Uniswap V2(UNI-V2)-PAR/WETH",
         "symbol":"PAR/WETH"
      },
      {
         "id":41,
         "address":"0x878B76a1A0dA1BE6f7b02E1aBb5EE47380817362",
         "description":"Uniswap V2(UNI-V2)-DZAR/USDC",
         "symbol":"DZAR/USDC"
      },
      {
         "id":42,
         "address":"0x0fcdB10c62a177292b59c1DD6D3A8A7c42d9dfb1",
         "description":"Uniswap V2(UNI-V2)-GST2/LEND",
         "symbol":"GST2/LEND"
      },
      {
         "id":43,
         "address":"0x06d5b7380C65c889abd82D3Df8aC118AF31156a1",
         "description":"Uniswap V2(UNI-V2)-WINGS/WETH",
         "symbol":"WINGS/WETH"
      },
      {
         "id":44,
         "address":"0xE0cc5aFc0FF2c76183416Fb8d1a29f6799FB2cdF",
         "description":"Uniswap V2(UNI-V2)-XIO/WETH",
         "symbol":"XIO/WETH"
      },
      {
         "id":45,
         "address":"0xB37c66831256cC83B53aB30F008d55Cb42aC7186",
         "description":"Uniswap V2(UNI-V2)-DAI/DZAR",
         "symbol":"DAI/DZAR"
      },
      {
         "id":46,
         "address":"0xde0D948e7b1C16dBEB96db12d5a865FFA9167e60",
         "description":"Uniswap V2(UNI-V2)-NMR/DAI",
         "symbol":"NMR/DAI"
      },
      {
         "id":47,
         "address":"0x4d12ad9C1DBdD0654157B483e93B7370911e3373",
         "description":"Uniswap V2(UNI-V2)-sUSD/DZAR",
         "symbol":"sUSD/DZAR"
      },
      {
         "id":48,
         "address":"0xF6DCdce0ac3001B2f67F750bc64ea5beB37B5824",
         "description":"Uniswap V2(UNI-V2)-HEX/USDC",
         "symbol":"HEX/USDC"
      },
      {
         "id":49,
         "address":"0x86DFae20051E175F84D0aD29a6d20e5e07135B92",
         "description":"Uniswap V2(UNI-V2)-MANU/WETH",
         "symbol":"MANU/WETH"
      },
      {
         "id":50,
         "address":"0xc6F348dd3B91a56D117ec0071C1e9b83C0996De4",
         "description":"Uniswap V2(UNI-V2)-WETH/ZRX",
         "symbol":"WETH/ZRX"
      },
      {
         "id":51,
         "address":"0x5B7aD60A92e725597e4A28444d498d1999cF66b6",
         "description":"Uniswap V2(UNI-V2)-DYT/WETH",
         "symbol":"DYT/WETH"
      },
      {
         "id":52,
         "address":"0x919B599ecB6C9a474a046d1252b2F41f8047dECB",
         "description":"Uniswap V2(UNI-V2)-WETH/PARETO",
         "symbol":"WETH/PARETO"
      },
      {
         "id":53,
         "address":"0x2b79b3c3c7b35463a28A76e0D332aAB3E20AA337",
         "description":"Uniswap V2(UNI-V2)-sUSD/aSUSD",
         "symbol":"sUSD/aSUSD"
      },
      {
         "id":54,
         "address":"0x2084C8115D97a12114A70A27198C3591B6df7D3E",
         "description":"Uniswap V2(UNI-V2)-WETH/MFT",
         "symbol":"WETH/MFT"
      },
      {
         "id":55,
         "address":"0xc12c4c3E0008B838F75189BFb39283467cf6e5b3",
         "description":"Uniswap V2(UNI-V2)-0xBTC/WETH",
         "symbol":"0xBTC/WETH"
      },
      {
         "id":56,
         "address":"0xf80758aB42C3B07dA84053Fd88804bCB6BAA4b5c",
         "description":"Uniswap V2(UNI-V2)-sUSD/WETH",
         "symbol":"sUSD/WETH"
      },
      {
         "id":57,
         "address":"0xf56B0A6e25a8d20944F0db7D4D7d9e4b1f10E03f",
         "description":"Uniswap V2(UNI-V2)-LCM/ITALIA",
         "symbol":"LCM/ITALIA"
      },
      {
         "id":59,
         "address":"0x095739e9Ea7B0d11CeE1c1134FB76549B610f4F3",
         "description":"Uniswap V2(UNI-V2)-DAI/0xBTC",
         "symbol":"DAI/0xBTC"
      },
      {
         "id":60,
         "address":"0x77000fCF90C82C02A031F8EDfC88A0398207F687",
         "description":"Uniswap V2(UNI-V2)-THR/DAI",
         "symbol":"THR/DAI"
      },
      {
         "id":61,
         "address":"0x01962144D41415cCA072900Fe87Bbe2992A99F10",
         "description":"Uniswap V2(UNI-V2)-XOR/WETH",
         "symbol":"XOR/WETH"
      },
      {
         "id":62,
         "address":"0x0B38B0C900cd6b5a61D0281a2a821570664aA821",
         "description":"Uniswap V2(UNI-V2)-SHUF/LINK",
         "symbol":"SHUF/LINK"
      },
      {
         "id":63,
         "address":"0x9B533F1cEaa5ceb7e5b8994ef16499E47A66312D",
         "description":"Uniswap V2(UNI-V2)-OXT/WETH",
         "symbol":"OXT/WETH"
      },
      {
         "id":64,
         "address":"0xACb9D43E5C69c7a10a08ad789947886E28Fd5001",
         "description":"Uniswap V2(UNI-V2)-USDC/MFT",
         "symbol":"USDC/MFT"
      },
      {
         "id":65,
         "address":"0x8a01BA64FBc7B12ee13F817DFa862881feC531b8",
         "description":"Uniswap V2(UNI-V2)-WBTC/LINK",
         "symbol":"WBTC/LINK"
      },
      {
         "id":66,
         "address":"0x1f9119d778d0B631f9B3b8974010ea2B750e4d33",
         "description":"Uniswap V2(UNI-V2)-SHUF/0xBTC",
         "symbol":"SHUF/0xBTC"
      },
      {
         "id":67,
         "address":"0xf641eafB5bCE9568c4Ff1079C58F36a7E8A6Cd8d",
         "description":"Uniswap V2(UNI-V2)-DZAR/USDT",
         "symbol":"DZAR/USDT"
      },
      {
         "id":68,
         "address":"0xA99F7Bc92c932A2533909633AB19cD7F04805059",
         "description":"Uniswap V2(UNI-V2)-USDC/0xBTC",
         "symbol":"USDC/0xBTC"
      },
      {
         "id":69,
         "address":"0xa86B8938ed9017693c5883e1b20741b8f735Bf2b",
         "description":"Uniswap V2(UNI-V2)-WETH/CER",
         "symbol":"WETH/CER"
      },
      {
         "id":70,
         "address":"0x598e7A017dAce2534Bc3F7496124C89425b1E165",
         "description":"Uniswap V2(UNI-V2)-USDP/WETH",
         "symbol":"USDP/WETH"
      },
      {
         "id":71,
         "address":"0x85000F8C1877b2CD729f65a62A5f66Ab64Dd952e",
         "description":"Uniswap V2(UNI-V2)-TENX/WETH",
         "symbol":"TENX/WETH"
      },
      {
         "id":72,
         "address":"0x343FD171caf4F0287aE6b87D75A8964Dc44516Ab",
         "description":"Uniswap V2(UNI-V2)-PNK/WETH",
         "symbol":"PNK/WETH"
      },
      {
         "id":73,
         "address":"0xEb10676a236e97E214787e6A72Af44C93639BA61",
         "description":"Uniswap V2(UNI-V2)-AfroX/WETH",
         "symbol":"AfroX/WETH"
      },
      {
         "id":74,
         "address":"0x3203d789bfdB222bfdd629B8de7C5Dc38e8241eC",
         "description":"Uniswap V2(UNI-V2)-ISLA/WETH",
         "symbol":"ISLA/WETH"
      },
      {
         "id":75,
         "address":"0xB27dE0bA2abFbFdf15667a939f041b52118aF5Ba",
         "description":"Uniswap V2(UNI-V2)-UBT/WETH",
         "symbol":"UBT/WETH"
      },
      {
         "id":76,
         "address":"0x11b1f53204d03E5529F09EB3091939e4Fd8c9CF3",
         "description":"Uniswap V2(UNI-V2)-MANA/WETH",
         "symbol":"MANA/WETH"
      },
      {
         "id":77,
         "address":"0xD82DeE36521826E8a38aBB7d3dBd80f0214E870b",
         "description":"Uniswap V2(UNI-V2)-DAI/ETHMNY",
         "symbol":"DAI/ETHMNY"
      },
      {
         "id":78,
         "address":"0x1c9052e823b5f4611EF7D5fB4153995b040ccbf5",
         "description":"Uniswap V2(UNI-V2)-DXD/WETH",
         "symbol":"DXD/WETH"
      },
      {
         "id":79,
         "address":"0xf49C43Ae0fAf37217bDcB00DF478cF793eDd6687",
         "description":"Uniswap V2(UNI-V2)-WETH/KNC",
         "symbol":"WETH/KNC"
      },
      {
         "id":80,
         "address":"0x9f8D8Df26d5ab71b492DdCe9799f432E36C289DF",
         "description":"Uniswap V2(UNI-V2)-WBTC/pBTC",
         "symbol":"WBTC/pBTC"
      },
      {
         "id":81,
         "address":"0x7A0dC9150178816752c19c6C31B4254E752aC7e4",
         "description":"Uniswap V2(UNI-V2)-FREE/ETHMNY",
         "symbol":"FREE/ETHMNY"
      },
      {
         "id":82,
         "address":"0xDCc0C5Dd2717E606b692A7c76A49266cea73Da57",
         "description":"Uniswap V2(UNI-V2)-HEX/CER",
         "symbol":"HEX/CER"
      },
      {
         "id":83,
         "address":"0xb87f05a56B1D61887a7e00Bba7Ce4879174B9c26",
         "description":"Uniswap V2(UNI-V2)-SALT/USDC",
         "symbol":"SALT/USDC"
      },
      {
         "id":84,
         "address":"0x2b6A25f7C54F43C71C743e627F5663232586C39F",
         "description":"Uniswap V2(UNI-V2)-JRT/WETH",
         "symbol":"JRT/WETH"
      },
      {
         "id":85,
         "address":"0xd260b35DAB7B3e8c0FeD7eFb0b2feBf71e9438F4",
         "description":"Uniswap V2(UNI-V2)-USDC/PARETO",
         "symbol":"USDC/PARETO"
      },
      {
         "id":86,
         "address":"0x5a4C9B203e31D81598755964830DfE831cAdb199",
         "description":"Uniswap V2(UNI-V2)-TRXC/ETHMNY",
         "symbol":"TRXC/ETHMNY"
      },
      {
         "id":87,
         "address":"0x7Ba2c8af503d311958d20614F3eDE2a9C3464C7A",
         "description":"Uniswap V2(UNI-V2)-DAI/PARETO",
         "symbol":"DAI/PARETO"
      },
      {
         "id":88,
         "address":"0x08a564924C26D8289503bbaA18714B9C366dF9a5",
         "description":"Uniswap V2(UNI-V2)-DAI/AMPL",
         "symbol":"DAI/AMPL"
      },
      {
         "id":89,
         "address":"0x081c50fCa53D686F9c8564ee2FA9002a8D1Cb916",
         "description":"Uniswap V2(UNI-V2)-XDATA/USDC",
         "symbol":"XDATA/USDC"
      },
      {
         "id":90,
         "address":"0x302Ac87B1b5ef18485971ED0115a17403Ea30911",
         "description":"Uniswap V2(UNI-V2)-FXC/WETH",
         "symbol":"FXC/WETH"
      },
      {
         "id":91,
         "address":"0x2bCDC753b4bB03847df75368aE3ef9A14Ee53401",
         "description":"Uniswap V2(UNI-V2)-WETH/VGT",
         "symbol":"WETH/VGT"
      },
      {
         "id":92,
         "address":"0xec2D2240D02A8cf63C3fA0B7d2C5a3169a319496",
         "description":"Uniswap V2(UNI-V2)-REP/WETH",
         "symbol":"REP/WETH"
      },
      {
         "id":93,
         "address":"0x6d57a53A45343187905aaD6AD8eD532D105697c1",
         "description":"Uniswap V2(UNI-V2)-RLC/WETH",
         "symbol":"RLC/WETH"
      },
      {
         "id":94,
         "address":"0x5deD80C16A966156F555455B55b9b156AE70408a",
         "description":"Uniswap V2(UNI-V2)-ANT/ANJ",
         "symbol":"ANT/ANJ"
      },
      {
         "id":95,
         "address":"0xfb7A3112c96Bbcfe4bbf3e8627b0dE6f49E5142A",
         "description":"Uniswap V2(UNI-V2)-WETH/SHIP",
         "symbol":"WETH/SHIP"
      },
      {
         "id":96,
         "address":"0xAAC52B03898359a9a948DAC6027334d75c8C64E9",
         "description":"Uniswap V2(UNI-V2)-ITALIA/POL",
         "symbol":"ITALIA/POL"
      },
      {
         "id":97,
         "address":"0xf1f27Db872b7F6E8B873C97F785fe4f9a6C92161",
         "description":"Uniswap V2(UNI-V2)-TUSD/USDC",
         "symbol":"TUSD/USDC"
      },
      {
         "id":99,
         "address":"0x70C60656c04072f955e59f180f53D2cF2573A0bD",
         "description":"Uniswap V2(UNI-V2)-DAI/POL",
         "symbol":"DAI/POL"
      },
      {
         "id":100,
         "address":"0x3fd4Cf9303c4BC9E13772618828712C8EaC7Dd2F",
         "description":"Uniswap V2(UNI-V2)-BNT/WETH",
         "symbol":"BNT/WETH"
      },
      {
         "id":101,
         "address":"0xbb07f405Aa4344d9563B32740d0f93e353A0Ab66",
         "description":"Uniswap V2(UNI-V2)-ITALIA/DAI",
         "symbol":"ITALIA/DAI"
      },
      {
         "id":102,
         "address":"0xf0936E53D924d7F442A04c038082A46c77ECc8d8",
         "description":"Uniswap V2(UNI-V2)-WETH/RCN",
         "symbol":"WETH/RCN"
      },
      {
         "id":103,
         "address":"0xEA95eE0295170781146FC1457c720a5B32B95052",
         "description":"Uniswap V2(UNI-V2)-LCM/DAI",
         "symbol":"LCM/DAI"
      },
      {
         "id":104,
         "address":"0x8Bd1661Da98EBDd3BD080F0bE4e6d9bE8cE9858c",
         "description":"Uniswap V2(UNI-V2)-REN/WETH",
         "symbol":"REN/WETH"
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
        artifacts.UniswapV2Product,
        [
          governor.address,
          policyManager.address,
          registry.address,
          UNISWAP_V2_FACTORY_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as UniswapV2Product;

       // deploy Uniswap Product
       product2 = (await deployContract(
        deployer,
        artifacts.UniswapV2Product,
        [
          governor.address,
          policyManager.address,
          registry.address,
          UNISWAP_V2_FACTORY_ADDRESS,
          minPeriod,
          maxPeriod
        ]
      )) as UniswapV2Product;
      
      await vault.connect(deployer).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product.address, 1, 11044, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as uniswapv2 factory address", async function () {
        expect(await product.coveredPlatform()).to.equal(UNISWAP_V2_FACTORY_ADDRESS);
        expect(await product.uniV2Factory()).to.equal(UNISWAP_V2_FACTORY_ADDRESS);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(policyholder1).setCoveredPlatform(policyholder1.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.uniV2Factory()).to.equal(treasury.address);
        await product.connect(governor).setCoveredPlatform(UNISWAP_V2_FACTORY_ADDRESS);
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
      it("cannot have non uni lp tokens", async function () {
        // would like to.be.false, to.be.reverted will work though
        await expect( product.isValidPositionDescription("REAL_USER")).to.be.reverted;
        await expect( product.isValidPositionDescription(REAL_USER)).to.be.reverted;
        await expect( product.isValidPositionDescription(encodeAddresses([REAL_USER]))).to.be.reverted;
        await expect( product.isValidPositionDescription(governor.address)).to.be.reverted;
        await expect( product.isValidPositionDescription(UNISWAP_V2_FACTORY_ADDRESS)).to.be.reverted;
        await expect( product.isValidPositionDescription(encodeAddresses([ZERO_ADDRESS]))).to.be.reverted;
        await expect( product.isValidPositionDescription(encodeAddresses([uniTokens[0].address, ZERO_ADDRESS]))).to.be.reverted;
      });
      it("can be one uni lp token", async function() {
        for (var i = 0; i < uniTokens.length/2; ++i) {
          expect(await product.isValidPositionDescription(encodeAddresses([uniTokens[i].address]))).to.be.true;
        }
      });
      it("can be more uni lp tokens", async function () {
        for(var i = 0; i < uniTokens.length/2; ++i) {
          // don't care about duplicates
          for(var j = 0; j < uniTokens.length/2; ++j) {
            expect(await product.isValidPositionDescription(encodeAddresses([uniTokens[i].address, uniTokens[j].address]))).to.be.true;
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
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, uniTokens[0].address, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, uniTokens[0].address, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
        expect(await policyManager.totalSupply()).to.equal(2);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(2);
      });
      it("can buy policy that covers multiple positions", async function () {
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, encodeAddresses([uniTokens[0].address, uniTokens[1].address]), { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(3);
        expect(await policyManager.totalSupply()).to.equal(3);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(3);
      });
      it("can get product name", async function () {
        expect(await product.name()).to.equal("UniswapV2");
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
        await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, uniTokens[0].address, { value: expectedPremium });
        await product.connect(policyholder2).buyPolicy(policyholder2.address, coverAmount, blocks, uniTokens[1].address, { value: expectedPremium });
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
      it("should support sufficient uniswapv2 lp tokens", async function () {
        let success = 0;
        let successList = [];
        let failList = [];
        const size = 50;
        for (let i = 0; i < size; i++) {
          const lpTokenAddress = uniTokens[i].address;
          const symbol = uniTokens[i].symbol;
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
          console.log("supported uni lp tokens:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
          console.log("unsupported uni lp tokens:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
        }
        expect(`${success}/${size} supported uni lp tokens`).to.equal(`${size}/${size} supported uni lp tokens`);
      });
    });
  });
}

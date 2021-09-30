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
    const IYREGISTRY = "0x50c1a2eA0a861A967D9d0FFE2AE4012c2E053804";
    const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const YDAI_ADDRESS = "0xdA816459F1AB5631232FE5e97a05BBBb94970c95";
    const REAL_USER1 = "0x452269ae20f7df9fc93f2f92d1c5351b895a39b3";
    const COOLDOWN_PERIOD = 3600; // one hour

    var yvaults = [
      {
         "name":"YFI yVault",
         "symbol":"yvYFI",
         "address":"0xE14d13d8B3b85aF791b2AADD661cDBd5E6097Db1",
         "token":"0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e",
         "registered":true
      },
      {
         "name":"Curve stETH Pool yVault",
         "symbol":"yvCurve-stETH",
         "address":"0xdCD90C7f6324cfa40d7169ef80b12031770B4325",
         "token":"0x06325440D014e39736583c165C2963BA99fAf14E",
         "registered":true
      },
      {
         "name":"Curve sETH Pool yVault",
         "symbol":"yvCurve-sETH",
         "address":"0x986b4AFF588a109c09B50A03f42E4110E29D353F",
         "token":"0xA3D87FffcE63B53E0d54fAa1cc983B7eB0b74A9c",
         "registered":true
      },
      {
         "name":"WBTC yVault",
         "symbol":"yvWBTC",
         "address":"0xA696a63cc78DfFa1a63E9E50587C197387FF6C7E",
         "token":"0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
         "registered":true
      },
      {
         "name":"WETH yVault",
         "symbol":"yvWETH",
         "address":"0xa258C4606Ca8206D8aA700cE2143D7db854D168c",
         "token":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
         "registered":true
      },
      {
         "name":"1INCH yVault",
         "symbol":"yv1INCH",
         "address":"0xB8C3B7A2A618C552C23B1E4701109a9E756Bab67",
         "token":"0x111111111117dC0aa78b770fA6A738034120C302",
         "registered":true
      },
      {
         "name":"DAI yVault",
         "symbol":"yvDAI",
         "address":"0xdA816459F1AB5631232FE5e97a05BBBb94970c95",
         "token":"0x6B175474E89094C44Da98b954EedeAC495271d0F",
         "registered":true
      },
      // {
      //    "name":"HEGIC yVault",
      //    "symbol":"yvHEGIC",
      //    "address":"0xe11ba472F74869176652C35D30dB89854b5ae84D",
      //    "token":"0x584bC13c7D411c00c01A62e8019472dE68768430",
      //    "registered":true
      // },
      {
         "name":"USDC yVault",
         "symbol":"yvUSDC",
         "address":"0x5f18C75AbDAe578b483E5F43f12a39cF75b973a9",
         "token":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
         "registered":true,
         "blacklist": true
      },
      {
         "name":"Curve Iron Bank Pool yVault",
         "symbol":"yvCurve-IronBank",
         "address":"0x27b7b1ad7288079A66d12350c828D3C00A6F07d7",
         "token":"0x5282a4eF67D9C33135340fB3289cc1711c13638C",
         "registered":true
      },
      {
         "name":"Curve HBTC Pool yVault",
         "symbol":"yvCurve-HBTC",
         "address":"0x625b7DF2fa8aBe21B0A976736CDa4775523aeD1E",
         "token":"0xb19059ebb43466C323583928285a49f558E572Fd",
         "registered":true
      },
      {
         "name":"Yearn Compounding veCRV yVault",
         "symbol":"yvBOOST",
         "address":"0x9d409a0A012CFbA9B15F6D4B36Ac57A46966Ab9a",
         "token":"0xc5bDdf9843308380375a611c18B50Fb9341f502A",
         "registered":true
      },
      {
         "name":"Curve sBTC Pool yVault",
         "symbol":"yvCurve-sBTC",
         "address":"0x8414Db07a7F743dEbaFb402070AB01a4E0d2E45e",
         "token":"0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3",
         "registered":true
      },
      {
         "name":"Curve renBTC Pool yVault",
         "symbol":"yvCurve-renBTC",
         "address":"0x7047F90229a057C13BF847C0744D646CFb6c9E1A",
         "token":"0x49849C98ae39Fff122806C06791Fa73784FB3675",
         "registered":true
      },
      {
         "name":"Curve sAave Pool yVault",
         "symbol":"yvCurve-sAave",
         "address":"0xb4D1Be44BfF40ad6e506edf43156577a3f8672eC",
         "token":"0x02d341CcB60fAaf662bC0554d13778015d1b285C",
         "registered":true
      },
      {
         "name":"Curve oBTC Pool yVault",
         "symbol":"yvCurve-oBTC",
         "address":"0xe9Dc63083c464d6EDcCFf23444fF3CFc6886f6FB",
         "token":"0x2fE94ea3d5d4a175184081439753DE15AeF9d614",
         "registered":true
      },
      {
         "name":"Curve pBTC Pool yVault",
         "symbol":"yvCurve-pBTC",
         "address":"0x3c5DF3077BcF800640B5DAE8c91106575a4826E6",
         "token":"0xDE5331AC4B3630f94853Ff322B66407e0D6331E8",
         "registered":true
      },
      {
         "name":"Curve LUSD Pool yVault",
         "symbol":"yvCurve-LUSD",
         "address":"0x5fA5B62c8AF877CB37031e0a3B2f34A78e3C56A6",
         "token":"0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA",
         "registered":true
      },
      {
         "name":"Curve BBTC Pool yVault",
         "symbol":"yvCurve-BBTC",
         "address":"0x8fA3A9ecd9EFb07A8CE90A6eb014CF3c0E3B32Ef",
         "token":"0x410e3E86ef427e30B9235497143881f717d93c2A",
         "registered":true
      },
      {
         "name":"Curve tBTC Pool yVault",
         "symbol":"yvCurve-tBTC",
         "address":"0x23D3D0f1c697247d5e0a9efB37d8b0ED0C464f7f",
         "token":"0x64eda51d3Ad40D56b9dFc5554E06F94e1Dd786Fd",
         "registered":true
      },
      {
         "name":"USDT yVault",
         "symbol":"yvUSDT",
         "address":"0x7Da96a3891Add058AdA2E826306D812C638D87a7",
         "token":"0xdAC17F958D2ee523a2206206994597C13D831ec7",
         "registered":true
      },
      {
         "name":"Curve FRAX Pool yVault",
         "symbol":"yvCurve-FRAX",
         "address":"0xB4AdA607B9d6b2c9Ee07A275e9616B84AC560139",
         "token":"0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
         "registered":true
      },
      {
         "name":"UNI yVault",
         "symbol":"yvUNI",
         "address":"0xFBEB78a723b8087fD2ea7Ef1afEc93d35E8Bed42",
         "token":"0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
         "registered":true
      },
      {
         "name":"Curve yBUSD Pool yVault",
         "symbol":"yvCurve-yBUSD",
         "address":"0x8ee57c05741aA9DB947A744E713C15d4d19D8822",
         "token":"0x3B3Ac5386837Dc563660FB6a0937DFAa5924333B",
         "registered":true
      },
      {
         "name":"Curve Compound Pool yVault",
         "symbol":"yvCurve-Compound",
         "address":"0xD6Ea40597Be05c201845c0bFd2e96A60bACde267",
         "token":"0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2",
         "registered":true
      },
      {
         "name":"Curve GUSD Pool yVault",
         "symbol":"yvCurve-GUSD",
         "address":"0x2a38B9B0201Ca39B17B460eD2f11e4929559071E",
         "token":"0xD2967f45c4f384DEEa880F807Be904762a3DeA07",
         "registered":true
      },
      {
         "name":"Curve Y Pool yVault",
         "symbol":"yUSD",
         "address":"0x4B5BfD52124784745c1071dcB244C6688d2533d3",
         "token":"0xdF5e0e81Dff6FAF3A7e52BA697820c5e32D806A8",
         "registered":true
      },
      {
         "name":"Curve 3pool yVault",
         "symbol":"yvCurve-3pool",
         "address":"0x84E13785B5a27879921D6F685f041421C7F482dA",
         "token":"0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
         "registered":true
      },
      {
         "name":"Curve TUSD Pool yVault",
         "symbol":"yvCurve-TUSD",
         "address":"0xf8768814b88281DE4F532a3beEfA5b85B69b9324",
         "token":"0xEcd5e75AFb02eFa118AF914515D6521aaBd189F1",
         "registered":true
      },
      {
         "name":"Curve BUSD Pool yVault",
         "symbol":"yvCurve-BUSD",
         "address":"0x6Ede7F19df5df6EF23bD5B9CeDb651580Bdf56Ca",
         "token":"0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
         "registered":true
      },
      {
         "name":"Curve DUSD Pool yVault",
         "symbol":"yvCurve-DUSD",
         "address":"0x30FCf7c6cDfC46eC237783D94Fc78553E79d4E9C",
         "token":"0x3a664Ab939FD8482048609f652f9a0B0677337B9",
         "registered":true
      },
      {
         "name":"Curve UST Pool yVault",
         "symbol":"yvCurve-UST",
         "address":"0x1C6a9783F812b3Af3aBbf7de64c3cD7CC7D1af44",
         "token":"0x94e131324b6054c0D789b190b2dAC504e4361b53",
         "registered":true
      },
      {
         "name":"Curve mUSD Pool yVault",
         "symbol":"yvCurve-mUSD",
         "address":"0x8cc94ccd0f3841a468184aCA3Cc478D2148E1757",
         "token":"0x1AEf73d49Dedc4b1778d0706583995958Dc862e6",
         "registered":true
      },
      {
         "name":"sUSD yVault",
         "symbol":"yvsUSD",
         "address":"0xa5cA62D95D24A4a350983D5B8ac4EB8638887396",
         "token":"0x57Ab1ec28D129707052df4dF418D58a2D46d5f51",
         "uimpl": "0x967968963517AFDC9b8Ccc9AD6649bC507E83a7b",
         "registered":true
      },
      {
         "name":"SNX yVault",
         "symbol":"yvSNX",
         "address":"0xF29AE508698bDeF169B89834F76704C3B205aedf",
         "token":"0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
         'uimpl':"0x54f25546260C7539088982bcF4b7dC8EDEF19f21",
         "registered":true
      },
      {
         "name":"Curve sUSD Pool yVault",
         "symbol":"yvCurve-sUSD",
         "address":"0x5a770DbD3Ee6bAF2802D29a901Ef11501C44797A",
         "token":"0xC25a3A3b969415c80451098fa907EC722572917F",
         "registered":true
      },
      {
         "name":"Curve LINK Pool yVault",
         "symbol":"yvCurve-LINK",
         "address":"0xf2db9a7c0ACd427A680D640F02d90f6186E71725",
         "token":"0xcee60cFa923170e4f8204AE08B4fA6A3F5656F3a",
         "registered":true
      },
      {
         "name":"Curve USDN Pool yVault",
         "symbol":"yvCurve-USDN",
         "address":"0x3B96d491f067912D18563d56858Ba7d6EC67a6fa",
         "token":"0x4f3E8F405CF5aFC05D68142F3783bDfE13811522",
         "registered":true
      },
      {
         "name":"Curve USDP Pool yVault",
         "symbol":"yvCurve-USDP",
         "address":"0xC4dAf3b5e2A9e93861c3FBDd25f1e943B8D87417",
         "token":"0x7Eb40E450b9655f4B3cC4259BCC731c63ff55ae6",
         "registered":true
      },
      {
         "name":"Curve alUSD Pool yVault",
         "symbol":"yvCurve-alUSD",
         "address":"0xA74d4B67b3368E83797a35382AFB776bAAE4F5C8",
         "token":"0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
         "registered":true
      },
      {
         "name":"Curve rETH Pool yVault",
         "symbol":"yvCurve-rETH",
         "address":"0xBfedbcbe27171C418CDabC2477042554b1904857",
         "token":"0x53a901d48795C58f485cBB38df08FA96a24669D5",
         "registered":true
      },
      {
         "name":"Curve ankrETH Pool yVault",
         "symbol":"yvCurve-ankrETH",
         "address":"0x132d8D2C76Db3812403431fAcB00F3453Fc42125",
         "token":"0xaA17A236F2bAdc98DDc0Cf999AbB47D47Fc0A6Cf",
         "registered":true
      },
      {
         "name":"Curve Aave Pool yVault",
         "symbol":"yvCurve-Aave",
         "address":"0x39CAF13a104FF567f71fd2A4c68C026FDB6E740B",
         "token":"0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900",
         "registered":true
      },
      {
         "name":"Curve HUSD Pool yVault",
         "symbol":"yvCurve-HUSD",
         "address":"0x054AF22E1519b020516D72D749221c24756385C9",
         "token":"0x5B5CFE992AdAC0C9D48E05854B2d91C73a003858",
         "registered":true
      },
      {
         "name":"Curve EURS Pool yVault",
         "symbol":"yvCurve-EURS",
         "address":"0x25212Df29073FfFA7A67399AcEfC2dd75a831A1A",
         "token":"0x194eBd173F6cDacE046C53eACcE9B953F28411d1",
         "registered":true
      },
      {
         "name":"LINK yVault",
         "symbol":"yvLINK",
         "address":"0x671a912C10bba0CFA74Cfc2d6Fba9BA1ed9530B2",
         "token":"0x514910771AF9Ca656af840dff83E8264EcF986CA",
         "registered":true
      },
      {
         "name":"RAI yVault",
         "symbol":"yvRAI",
         "address":"0x873fB544277FD7b977B196a826459a69E27eA4ea",
         "token":"0x03ab458634910AaD20eF5f1C8ee96F1D6ac54919",
         "registered":true
      },
      {
         "name":"Curve triCrypto Pool yVault",
         "symbol":"yvCurve-triCrypto",
         "address":"0x3D980E50508CFd41a13837A60149927a11c03731",
         "token":"0xcA3d75aC011BF5aD07a98d02f18225F9bD9A6BDF",
         "registered":true
      },
      {
         "name":"Curve Pax Pool yVault",
         "symbol":"yvCurve-Pax",
         "address":"0x80bbeE2fa460dA291e796B9045e93d19eF948C6A",
         "token":"0xD905e2eaeBe188fc92179b6350807D8bd91Db0D8",
         "registered":true
      },
      {
         "name":"Curve USDT Pool yVault",
         "symbol":"yvCurve-USDT",
         "address":"0x28a5b95C101df3Ded0C0d9074DB80C438774B6a9",
         "token":"0x9fC689CCaDa600B6DF723D9E47D84d76664a1F23",
         "registered":true
      },
      {
         "name":"Curve USDK Pool yVault",
         "symbol":"yvCurve-USDK",
         "address":"0x3D27705c64213A5DcD9D26880c1BcFa72d5b6B0E",
         "token":"0x97E2768e8E73511cA874545DC5Ff8067eB19B787",
         "registered":true
      },
      {
         "name":"Curve RSV Pool yVault",
         "symbol":"yvCurve-RSV",
         "address":"0xC116dF49c02c5fD147DE25Baa105322ebF26Bd97",
         "token":"0xC2Ee6b0334C261ED60C72f6054450b61B8f18E35",
         "registered":true
      },
      {
         "name":"Curve 3Crypto Pool yVault",
         "symbol":"yvCurve-3Crypto",
         "address":"0xE537B5cc158EB71037D4125BDD7538421981E6AA",
         "token":"0xc4AD29ba4B3c580e6D59105FFf484999997675Ff",
         "registered":true
      },
      {
         "name":"AAVE yVault",
         "symbol":"yvAAVE",
         "address":"0xd9788f3931Ede4D5018184E198699dC6d66C1915",
         "token":"0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
         "registered":true
      },
      {
         "name":"COMP yVault",
         "symbol":"yvCOMP",
         "address":"0x4A3FE75762017DB0eD73a71C9A06db7768DB5e66",
         "token":"0xc00e94Cb662C3520282E6f5717214004A7f26888",
         "registered":true
      },
      {
         "name":"SUSHI yVault",
         "symbol":"yvSUSHI",
         "address":"0x6d765CbE5bC922694afE112C140b8878b9FB0390",
         "token":"0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
         "registered":true
      },
      {
         "name":"TUSD yVault",
         "symbol":"yvTUSD",
         "address":"0xFD0877d9095789cAF24c98F7CCe092fa8E120775",
         "token":"0x0000000000085d4780B73119b644AE5ecd22b376",
         "registered":true
      },
      {
         "name":"Curve EURT Pool yVault",
         "symbol":"yvCurve-EURT",
         "address":"0x0d4EA8536F9A13e4FBa16042a46c30f092b06aA5",
         "token":"0xFD5dB7463a3aB53fD211b4af195c5BCCC1A03890",
         "registered":true
      },
      {
         "name":"Curve MIM Pool yVault",
         "symbol":"yvCurve-MIM",
         "address":"0x2DfB14E32e2F8156ec15a2c21c3A6c053af52Be8",
         "token":"0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
         "registered":true
      },
      {
         "name":"Curve cvxCRV Pool yVault",
         "symbol":"yvCurve-cvxCRV",
         "address":"0x4560b99C904aAD03027B5178CCa81584744AC01f",
         "token":"0x9D0464996170c6B9e75eED71c68B99dDEDf279e8",
         "registered":true
      },
      {
         "name":"Curve ibEUR Pool yVault",
         "symbol":"yvCurve-ibEUR",
         "address":"0x67e019bfbd5a67207755D04467D6A70c0B75bF60",
         "token":"0x19b080FE1ffA0553469D20Ca36219F17Fcf03859",
         "registered":true
      },
      {
         "name":"Curve ibKRW Pool yVault",
         "symbol":"yvCurve-ibKRW",
         "address":"0x528D50dC9a333f01544177a924893FA1F5b9F748",
         "token":"0x8461A004b50d321CB22B7d034969cE6803911899",
         "registered":true
      },
      {
         "name":"Curve ibGBP Pool yVault",
         "symbol":"yvCurve-ibGBP",
         "address":"0x595a68a8c9D5C230001848B69b1947ee2A607164",
         "token":"0xD6Ac1CB9019137a896343Da59dDE6d097F710538",
         "registered":true
      },
      {
         "name":"Curve ibAUD Pool yVault",
         "symbol":"yvCurve-ibAUD",
         "address":"0x1b905331F7dE2748F4D6a0678e1521E20347643F",
         "token":"0x3F1B0278A9ee595635B61817630cC19DE792f506",
         "registered":true
      },
      {
         "name":"Curve ibCHF Pool yVault",
         "symbol":"yvCurve-ibCHF",
         "address":"0x490bD0886F221A5F79713D3E84404355A9293C50",
         "token":"0x9c2C8910F113181783c249d8F6Aa41b51Cde0f0c",
         "registered":true
      },
      {
         "name":"Curve ibJPY Pool yVault",
         "symbol":"yvCurve-ibJPY",
         "address":"0x59518884EeBFb03e90a18ADBAAAB770d4666471e",
         "token":"0x8818a9bb44Fbf33502bE7c15c500d0C783B73067",
         "registered":true
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
          maxPeriod
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
          maxPeriod
        ]
      )) as YearnV2Product;

      // fetch contracts
      dai = await ethers.getContractAt(artifacts.ERC20.abi, DAI_ADDRESS);
      ydai = await ethers.getContractAt(artifacts.YVault.abi, YDAI_ADDRESS);

      await vault.connect(depositor).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product.address, 1, 11044, 1);
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
      it("can be one yVault", async function() {
        for (var i = 0; i < yvaults.length; ++i) {
          expect(await product.isValidPositionDescription(encodeAddresses([yvaults[i].address]))).to.be.true;
        }
      });
      it("can be one or more yVaults", async function () {
        for(var i = 0; i < yvaults.length; ++i) {
          // don't care about duplicates
          for(var j = 0; j < yvaults.length; ++j) {
            expect(await product.isValidPositionDescription(encodeAddresses([yvaults[i].address, yvaults[j].address]))).to.be.true;
          }
        }
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
            const uimpl =  ((yvaults[i].uimpl || "") != "") ? yvaults[i].uimpl : uAddress;
            const blacklistAddress = uAddress;
            const isBlacklistable = yvaults[i].blacklist || false;
            // create position
            var value = toBytes32(uAmount).toString();
            for(var j = 0; j < 200; ++j) {
              try { // solidity rigged balanceOf
                var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[policyholder3.address,j]);
                await setStorageAt(uimpl, index, value);
                var uBalance = await uToken.balanceOf(policyholder3.address);
                if(uBalance.eq(uAmount)) break;
              } catch(e) { console.log(e)}
              try { // vyper rigged balanceOf
                var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[j,policyholder3.address]);
                await setStorageAt(uimpl, index, value);
                var uBalance = await uToken.balanceOf(policyholder3.address);
                if(uBalance.eq(uAmount)) break;
              } catch(e) { console.log(e) }
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

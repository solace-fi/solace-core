import hardhat from "hardhat"
const hre = hardhat;
import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, Wallet, Contract, constants, utils} from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, CurveProduct, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { sign, assembleSignature, getSubmitClaimDigest } from "./utilities/signature";
import { toBytes32, setStorageAt } from "./utilities/setStorage";
import { encodeAddresses } from "./utilities/positionDescription";
import { oneToken } from "./utilities/math";

const DOMAIN_NAME = "Solace.fi-CurveProduct";
const INVALID_DOMAIN = "Solace.fi-Invalid";
const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("CurveProductSubmitClaim(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));
const INVALID_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("InvalidType(uint256 policyID,address claimant,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

if(process.env.FORK_NETWORK === "mainnet"){
  describe("CurveProduct", function () {
    const [deployer, governor, policyholder1, policyholder2, policyholder3, depositor, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: CurveProduct;
    let product2: CurveProduct;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let riskManager: RiskManager;
    let lpToken: Contract;
    let dai: Contract;

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

    const ONE_SPLIT_VIEW = "0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E";
    const ADDRESS_PROVIDER = "0x0000000022D53366457F9d5E68Ec105046FC4383";
    const REAL_USER = "0x5dcd83cf2dd90a4c7e1c189e74ec7dc072ad78e1";
    const BALANCE = BN.from("72907407389975430");
    const LP_TOKEN_ADDR = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"; // Curve.fi DAI/USDC/USDT
    const LP_COIN_ADDR = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // DAI
    const COOLDOWN_PERIOD = 3600; // one hour

    const lpTokens = [
      {
         "name":"Curve.fi DAI/USDC/USDT",
         "symbol":"3Crv",
         "address":"0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"
      },
      {
         "name":"Curve.fi aDAI/aUSDC/aUSDT",
         "symbol":"a3CRV",
         "address":"0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900"
      },
      {
         "name":"Curve.fi ETH/aETH",
         "symbol":"ankrCRV",
         "address":"0xaA17A236F2bAdc98DDc0Cf999AbB47D47Fc0A6Cf"
      },
      {
         "name":"Curve.fi yDAI/yUSDC/yUSDT/yBUSD",
         "symbol":"yDAI+yUSDC+yUSDT+yBUSD",
         "address":"0x3B3Ac5386837Dc563660FB6a0937DFAa5924333B"
      },
      {
         "name":"Curve.fi cDAI/cUSDC",
         "symbol":"cDAI+cUSDC",
         "address":"0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2"
      },
      {
         "name":"Curve.fi EURS/sEUR",
         "symbol":"eursCRV",
         "address":"0x194eBd173F6cDacE046C53eACcE9B953F28411d1"
      },
      {
         "name":"Curve.fi hBTC/wBTC",
         "symbol":"hCRV",
         "address":"0xb19059ebb43466C323583928285a49f558E572Fd"
      },
      {
         "name":"Curve.fi cyDAI/cyUSDC/cyUSDT",
         "symbol":"ib3CRV",
         "address":"0x5282a4eF67D9C33135340fB3289cc1711c13638C"
      },
      {
         "name":"Curve.fi LINK/sLINK",
         "symbol":"linkCRV",
         "address":"0xcee60cFa923170e4f8204AE08B4fA6A3F5656F3a"
      },
      {
         "name":"Curve.fi DAI/USDC/USDT/PAX",
         "symbol":"ypaxCrv",
         "address":"0xD905e2eaeBe188fc92179b6350807D8bd91Db0D8"
      },
      {
         "name":"Curve.fi renBTC/wBTC",
         "symbol":"crvRenWBTC",
         "address":"0x49849C98ae39Fff122806C06791Fa73784FB3675"
      },
      {
         "name":"Curve.fi aDAI/aSUSD",
         "symbol":"saCRV",
         "address":"0x02d341CcB60fAaf662bC0554d13778015d1b285C"
      },
      {
         "name":"Curve.fi renBTC/wBTC/sBTC",
         "symbol":"crvRenWSBTC",
         "address":"0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3"
      },
      {
         "name":"Curve.fi ETH/sETH",
         "symbol":"eCRV",
         "address":"0xA3D87FffcE63B53E0d54fAa1cc983B7eB0b74A9c"
      },
      {
         "name":"Curve.fi ETH/stETH",
         "symbol":"steCRV",
         "address":"0x06325440D014e39736583c165C2963BA99fAf14E"
      },
      {
         "name":"Curve.fi DAI/USDC/USDT/sUSD",
         "symbol":"crvPlain3andSUSD",
         "address":"0xC25a3A3b969415c80451098fa907EC722572917F"
      },
      {
         "name":"Curve.fi cDAI/cUSDC/USDT",
         "symbol":"cDAI+cUSDC+USDT",
         "address":"0x9fC689CCaDa600B6DF723D9E47D84d76664a1F23"
      },
      {
         "name":"Curve.fi yDAI/yUSDC/yUSDT/yTUSD",
         "symbol":"yDAI+yUSDC+yUSDT+yTUSD",
         "address":"0xdF5e0e81Dff6FAF3A7e52BA697820c5e32D806A8"
      },
      {
         "name":"Curve.fi DUSD/3Crv",
         "symbol":"dusd3CRV",
         "address":"0x3a664Ab939FD8482048609f652f9a0B0677337B9"
      },
      {
         "name":"Curve.fi GUSD/3Crv",
         "symbol":"gusd3CRV",
         "address":"0xD2967f45c4f384DEEa880F807Be904762a3DeA07"
      },
      {
         "name":"Curve.fi HUSD/3Crv",
         "symbol":"husd3CRV",
         "address":"0x5B5CFE992AdAC0C9D48E05854B2d91C73a003858"
      },
      {
         "name":"Curve.fi LinkUSD/3Crv",
         "symbol":"LinkUSD3CRV",
         "address":"0x6D65b498cb23deAba52db31c93Da9BFFb340FB8F"
      },
      {
         "name":"Curve.fi MUSD/3Crv",
         "symbol":"musd3CRV",
         "address":"0x1AEf73d49Dedc4b1778d0706583995958Dc862e6"
      },
      {
         "name":"Curve.fi RSV/3Crv",
         "symbol":"rsv3CRV",
         "address":"0xC2Ee6b0334C261ED60C72f6054450b61B8f18E35"
      },
      {
         "name":"Curve.fi USDK/3Crv",
         "symbol":"usdk3CRV",
         "address":"0x97E2768e8E73511cA874545DC5Ff8067eB19B787"
      },
      {
         "name":"Curve.fi USDN/3Crv",
         "symbol":"usdn3CRV",
         "address":"0x4f3E8F405CF5aFC05D68142F3783bDfE13811522"
      },
      {
         "name":"Curve.fi USDP/3Crv",
         "symbol":"usdp3CRV",
         "address":"0x7Eb40E450b9655f4B3cC4259BCC731c63ff55ae6"
      },
      {
         "name":"Curve.fi UST/3Crv",
         "symbol":"ust3CRV",
         "address":"0x94e131324b6054c0D789b190b2dAC504e4361b53"
      },
      {
         "name":"Curve.fi bBTC/sbtcCRV",
         "symbol":"bBTC/sbtcCRV",
         "address":"0x410e3E86ef427e30B9235497143881f717d93c2A"
      },
      {
         "name":"Curve.fi oBTC/sbtcCRV",
         "symbol":"oBTC/sbtcCRV",
         "address":"0x2fE94ea3d5d4a175184081439753DE15AeF9d614"
      },
      {
         "name":"Curve.fi pBTC/sbtcCRV",
         "symbol":"pBTC/sbtcCRV",
         "address":"0xDE5331AC4B3630f94853Ff322B66407e0D6331E8"
      },
      {
         "name":"Curve.fi tBTC/sbtcCrv",
         "symbol":"tbtc/sbtcCrv",
         "address":"0x64eda51d3Ad40D56b9dFc5554E06F94e1Dd786Fd"
      },
      {
         "name":"Curve.fi Factory USD Metapool: TrueUSD",
         "symbol":"TUSD3CRV-f",
         "address":"0xEcd5e75AFb02eFa118AF914515D6521aaBd189F1"
      },
      {
         "name":"Curve.fi Factory USD Metapool: Liquity",
         "symbol":"LUSD3CRV-f",
         "address":"0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA"
      },
      {
         "name":"Curve.fi Factory USD Metapool: Frax",
         "symbol":"FRAX3CRV-f",
         "address":"0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B"
      },
      {
         "name":"Curve.fi Factory USD Metapool: Binance USD",
         "symbol":"BUSD3CRV-f",
         "address":"0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a"
      },
      {
         "name":"Curve.fi ETH/rETH",
         "symbol":"rCRV",
         "address":"0x53a901d48795C58f485cBB38df08FA96a24669D5"
      },
      {
         "name":"Curve.fi Factory USD Metapool: Alchemix USD",
         "symbol":"alUSD3CRV-f",
         "address":"0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c"
      },
      {
         "name":"Curve.fi USD-BTC-ETH",
         "symbol":"crvTricrypto",
         "address":"0xcA3d75aC011BF5aD07a98d02f18225F9bD9A6BDF"
      },
      {
         "name":"Curve.fi USD-BTC-ETH",
         "symbol":"crv3crypto",
         "address":"0xc4AD29ba4B3c580e6D59105FFf484999997675Ff"
      },
      {
         "name":"Curve.fi Factory Plain Pool: Euro Tether",
         "symbol":"EURT-f",
         "address":"0xFD5dB7463a3aB53fD211b4af195c5BCCC1A03890"
      },
      {
         "name":"Curve.fi Factory USD Metapool: Magic Internet Money 3Pool",
         "symbol":"MIM-3LP3CRV-f",
         "address":"0x5a6A4D54456819380173272A5E8E9B9904BdF41B"
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
      treasury = (await deployContract(deployer, artifacts.Treasury, [governor.address, registry.address])) as Treasury;
      await registry.connect(governor).setTreasury(treasury.address);
      policyManager = (await deployContract(deployer, artifacts.PolicyManager, [governor.address])) as PolicyManager;
      await registry.connect(governor).setPolicyManager(policyManager.address);
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [governor.address, registry.address])) as RiskManager;
      await registry.connect(governor).setRiskManager(riskManager.address);

      // deploy Curve Product
      product = (await deployContract(
        deployer,
        artifacts.CurveProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          ADDRESS_PROVIDER,
          minPeriod,
          maxPeriod
        ]
      )) as CurveProduct;

       // deploy Curve Product
       product2 = (await deployContract(
        deployer,
        artifacts.CurveProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          ADDRESS_PROVIDER,
          minPeriod,
          maxPeriod
        ]
      )) as CurveProduct;

      // fetch contracts
      dai = await ethers.getContractAt(artifacts.ERC20.abi, LP_COIN_ADDR);
      lpToken = await ethers.getContractAt(artifacts.CurveToken.abi, LP_TOKEN_ADDR);
      
      await vault.connect(deployer).depositEth({value:maxCoverAmount});
      await riskManager.connect(governor).addProduct(product.address, 1, 11044, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    });

    describe("covered platform", function () {
      it("starts as curve address provider", async function () {
        expect(await product.coveredPlatform()).to.equal(ADDRESS_PROVIDER);
        expect(await product.addressProvider()).to.equal(ADDRESS_PROVIDER);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(policyholder1).setCoveredPlatform(policyholder1.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.addressProvider()).to.equal(treasury.address);
        await product.connect(governor).setCoveredPlatform(ADDRESS_PROVIDER);
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
      it("cannot have non lp tokens", async function () {
        // would like to.be.false, to.be.reverted will work though
        await expect( product.isValidPositionDescription("REAL_USER")).to.be.reverted;
        expect(await product.isValidPositionDescription(REAL_USER)).to.be.false;
        expect(await product.isValidPositionDescription(encodeAddresses([REAL_USER]))).to.be.false;
        expect(await product.isValidPositionDescription(governor.address)).to.be.false;
        expect(await product.isValidPositionDescription(ADDRESS_PROVIDER)).to.be.false;
        expect(await product.isValidPositionDescription(encodeAddresses([ZERO_ADDRESS]))).to.be.false;
        expect(await product.isValidPositionDescription(encodeAddresses([lpTokens[0].address, ZERO_ADDRESS]))).to.be.false;
      });
      it("can be one lp token", async function() {
        for (var i = 0; i < lpTokens.length; ++i) {
          expect(await product.isValidPositionDescription(encodeAddresses([lpTokens[i].address]))).to.be.true;
        }
      });
      it("can be more lp tokens", async function () {
        for(var i = 0; i < lpTokens.length; ++i) {
          // don't care about duplicates
          for(var j = 0; j < lpTokens.length; ++j) {
            expect(await product.isValidPositionDescription(encodeAddresses([lpTokens[i].address, lpTokens[j].address]))).to.be.true;
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
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, lpTokens[0].address, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(1);
      });
      it("can buy duplicate policy", async function () {
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, lpTokens[0].address, { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(2);
        expect(await policyManager.totalSupply()).to.equal(2);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(2);
      });
      it("can buy policy that covers multiple positions", async function () {
        let tx = await product.buyPolicy(REAL_USER, coverAmount, blocks, encodeAddresses([lpTokens[0].address, lpTokens[1].address]), { value: expectedPremium });
        expect(tx).to.emit(product, "PolicyCreated").withArgs(3);
        expect(await policyManager.totalSupply()).to.equal(3);
        expect(await policyManager.balanceOf(REAL_USER)).to.equal(3);
      });
      it("can get product name", async function () {
        expect(await product.name()).to.equal("Curve");
      });
    });

    describe("submitClaim", async function () {
      let policyID1: BN;
      let policyID2: BN;
      let amountOut1 = 500000;
      let curveRegistry: Contract;

      before(async function () {
        let policyCount = await policyManager.totalPolicyCount();
        policyID1 = policyCount.add(1);
        policyID2 = policyCount.add(2);
        await depositor.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        await product.connect(policyholder1).buyPolicy(policyholder1.address, coverAmount, blocks, LP_TOKEN_ADDR, { value: expectedPremium });
        await product.connect(policyholder2).buyPolicy(policyholder2.address, coverAmount, blocks, LP_TOKEN_ADDR, { value: expectedPremium });

        // create registry
        const addressProvider = await ethers.getContractAt(artifacts.CurveAddressProvider.abi, ADDRESS_PROVIDER);
        const registryAddress = await addressProvider.get_registry();
        curveRegistry = await ethers.getContractAt(artifacts.CurveRegistry.abi, registryAddress)
        expect(curveRegistry).is.not.null;
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
      it("should support all curve lp tokens", async function () {
        let success = 0;
        let successList = [];
        let failList = [];
      
        for (let i = 0; i < lpTokens.length; i++) {
          const lpTokenAddress = lpTokens[i].address;
          const symbol = lpTokens[i].symbol;
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
          console.log("supported lp tokens:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
          console.log("unsupported lp tokens:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
        }
        expect(`${success}/${lpTokens.length} supported lp tokens`).to.equal(`${lpTokens.length}/${lpTokens.length} supported lp tokens`);
      });
    });
  });
}

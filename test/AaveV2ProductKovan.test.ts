import hardhat from "hardhat";
const hre = hardhat;
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
import { PolicyManager, AaveV2Product, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";
import { getDomainSeparator, sign } from "./utilities/signature";
import { ECDSASignature } from "ethereumjs-util";

const EXCHANGE_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("AaveV2ProductExchange(uint256 policyID,uint256 amountOut,uint256 deadline)"));

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
// in order to make a call to AaveV2Product.submitClaim()
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

if(process.env.FORK_NETWORK === "kovan"){
  describe('AaveV2ProductKovan', () => {
    const [deployer, user, user2, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: AaveV2Product;
    let product2: AaveV2Product;
    let weth: Weth9;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let riskManager: RiskManager;

    let alink: Contract;
    let link: Contract;
    let lendingPool: Contract;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const AAVE_DATA_PROVIDER = "0x3c73A5E5785cAC854D468F727c606C07488a29D6";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45150; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const maxCoverPerUser = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const price = 11044; // 2.60%/yr

    const aWETH_ADDRESS = "0x87b1f4cf9BD63f7BBD3eE1aD04E8F52540349347";
    const USER1 = "0xc2b74b547d02bafc93feb34bd964d42312ae70c3";
    const BALANCE1 = BN.from("608218702433845134");

    const aUSDT_ADDRESS = "0xFF3c8bc103682FA918c954E84F5056aB4DD5189d";
    const USER2 = "0xde6663fbb083c1bd0f2303f68276e2df2deb0a9d";
    const BALANCE2 = BN.from("4741389687192200000");

    const aLINK_ADDRESS = "0xeD9044cA8F7caCe8eACcD40367cF2bee39eD1b04";
    const LINK_ADDRESS = "0xad5ce863ae3e4e9394ab43d4ba0d80f419f61789";
    const LENDING_POOL_ADDRESS = "0xE0fBa4Fc209b4948668006B2bE61711b7f465bAe";

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

      // deploy risk manager contract
      riskManager = (await deployContract(deployer, artifacts.RiskManager, [deployer.address, registry.address])) as RiskManager;

      // deploy Aave V2 Product
      product = (await deployContract(
        deployer,
        artifacts.AaveV2Product,
        [
          deployer.address,
          policyManager.address,
          registry.address,
          AAVE_DATA_PROVIDER,
          minPeriod,
          maxPeriod,
          price,
          1
        ]
      )) as unknown as AaveV2Product;

      product2 = (await deployContract(
        deployer,
        artifacts.AaveV2Product,
        [
          deployer.address,
          policyManager.address,
          registry.address,
          AAVE_DATA_PROVIDER,
          minPeriod,
          maxPeriod,
          price,
          1
        ]
      )) as unknown as AaveV2Product;

      // fetch contracts
      alink = await ethers.getContractAt(artifacts.AToken.abi, aLINK_ADDRESS);
      link = await ethers.getContractAt(artifacts.ERC20.abi, LINK_ADDRESS);
      lendingPool = await ethers.getContractAt(artifacts.LendingPool.abi, LENDING_POOL_ADDRESS);

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
        let expectedPremium = BN.from("64988622087944");
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

    describe("submitClaim", async function () {
      let policyID1 = 3;
      let policyID2 = 4;
      let amountIn1 = BN.from(100000000000);
      let amountOut1 = 5000000000;
      before(async function () {
        await deployer.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        // create an aLink position and policy
        let index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[user.address,0]);
        await setStorageAt(LINK_ADDRESS,index,toBytes32(amountIn1.mul(2)).toString());
        await link.connect(user).transfer(user2.address, amountIn1);
        expect(await link.balanceOf(user.address)).to.equal(amountIn1);
        await link.connect(user).approve(lendingPool.address, constants.MaxUint256);
        await lendingPool.connect(user).deposit(LINK_ADDRESS, amountIn1, user.address, 0);
        expect(await link.balanceOf(user.address)).to.be.equal(0);
        expect(await alink.balanceOf(user.address)).to.be.gte(amountIn1);
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
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, amountOut1, 0);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, 0, signature)).to.be.revertedWith("expired deadline");
      });
      it("cannot submit claim on someone elses policy", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID2, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(deployer).submitClaim(policyID2, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
      });
      it("cannot submit claim from wrong product", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product2.connect(user).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("wrong product");
      });
      it("cannot submit claim with forged signature", async function () {
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, "0x")).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, "0xabcd")).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890")).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim from unauthorized signer", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(deployer.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with changed arguments", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(user).submitClaim(policyID1, "100000000000", deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(user).submitClaim(policyID1, amountOut1, deadline.sub(1), signature)).to.be.revertedWith("invalid signature");
      });
      it("can open a claim", async function () {
        // sign swap
        let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID1, amountOut1, deadline);
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
      it("should support all atokens", async function () {
        const user3Address = "0x688514032e2cD27fbCEc700E2b10aa8D34741956";
        await hre.network.provider.request({method: "hardhat_impersonateAccount", params: [user3Address]});
        await deployer.sendTransaction({to: user3Address, value: BN.from("1000000000000000000")});
        const user3 = await ethers.getSigner(user3Address);
        var atokens = [
          {"symbol":"aAAVE","address":"0x6d93ef8093F067f19d33C2360cE17b20a8c45CD7"},
          {"symbol":"aBAT","address":"0x28f92b4c8Bdab37AF6C4422927158560b4bB446e"},
          {"symbol":"aBUSD","address":"0xfe3E41Db9071458e39104711eF1Fa668bae44e85"},
          {"symbol":"aDAI","address":"0xdCf0aF9e59C002FA3AA091a46196b37530FD48a8"},
          {"symbol":"aENJ","address":"0x1d1F2Cb9ED46A8d5bf0254E5CE400514D62d55F0"},
          {"symbol":"aKNC","address":"0xdDdEC78e29f3b579402C42ca1fd633DE00D23940"},
          {"symbol":"aLINK","address":"0xeD9044cA8F7caCe8eACcD40367cF2bee39eD1b04"},
          {"symbol":"aMANA","address":"0xA288B1767C91Aa9d8A14a65dC6B2E7ce68c02DFd"},
          {"symbol":"aMKR","address":"0x9d9DaBEae6BcBa881404A9e499B13B2B3C1F329E"},
          {"symbol":"aREN","address":"0x01875ee883B32f5f961A92eC597DcEe2dB7589c1"},
          {"symbol":"aSNX","address":"0xAA74AdA92dE4AbC0371b75eeA7b1bd790a69C9e1"},
          {"symbol":"aSUSD","address":"0x9488fF6F29ff75bfdF8cd5a95C6aa679bc7Cd65c"},
          {"symbol":"aTUSD","address":"0x39914AdBe5fDbC2b9ADeedE8Bcd444b20B039204"},
          {"symbol":"aUSDC","address":"0xe12AFeC5aa12Cf614678f9bFeeB98cA9Bb95b5B0"},
          {"symbol":"aUSDT","address":"0xFF3c8bc103682FA918c954E84F5056aB4DD5189d"},
          {"symbol":"aWBTC","address":"0x62538022242513971478fcC7Fb27ae304AB5C29F"},
          {"symbol":"aWETH","address":"0x87b1f4cf9BD63f7BBD3eE1aD04E8F52540349347"},
          {"symbol":"aYFI","address":"0xF6c7282943Beac96f6C70252EF35501a6c1148Fe"},
          {"symbol":"aZRX","address":"0xf02D7C23948c9178C68f5294748EB778Ab5e5D9c","uimpl":""},
          {"symbol":"aUNI","address":"0x601FFc9b7309bdb0132a02a569FBd57d6D1740f2"},
          {"symbol":"aAMPL","address":"0xb8a16bbab34FA7A5C09Ec7679EAfb8fEC06897bc","uimpl":"0xcea5Db2E865213CDa8C0EAaD2e68Ccc54Dd88d27"}
        ];
        var success = 0;
        var successList = [];
        var failList = [];
        for(var i = 0; i < atokens.length; ++i){
          try {
            // fetch contracts
            const aAddress = atokens[i].address;
            const symbol = atokens[i].symbol;
            console.log(`        ${symbol}`);
            const aToken = await ethers.getContractAt(artifacts.AToken.abi, aAddress);
            const uAddress = await aToken.UNDERLYING_ASSET_ADDRESS();
            const uToken = await ethers.getContractAt(artifacts.ERC20.abi, uAddress);
            const decimals = await uToken.decimals();
            const uAmount = oneToken(decimals);
            const poolAddress = await aToken.POOL();
            const pool = await ethers.getContractAt(artifacts.LendingPool.abi, poolAddress);
            const uimpl = ((atokens[i].uimpl || "") != "") ? atokens[i].uimpl : uAddress;
            // create position

            for(var j = 0; j < 200; ++j) {
              try { // solidity rigged balanceOf
                var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[user3.address,j]);
                await setStorageAt(uimpl, index, toBytes32(uAmount).toString());
                var uBalance = await uToken.balanceOf(user3.address);
                if(uBalance.eq(uAmount)) break;
              } catch(e) { }
              try { // vyper rigged balanceOf
                var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[j,user3.address]);
                await setStorageAt(uimpl, index, toBytes32(uAmount).toString());
                var uBalance = await uToken.balanceOf(user3.address);
                if(uBalance.eq(uAmount)) break;
              } catch(e) { }
            }
            expect(await uToken.balanceOf(user3.address)).to.equal(uAmount);
            await uToken.connect(user3).approve(poolAddress, constants.MaxUint256);
            await pool.connect(user3).deposit(uAddress, uAmount, user3.address, 0);
            expect(await uToken.balanceOf(user3.address)).to.be.equal(0);
            const aAmount = await aToken.balanceOf(user3.address);
            expectClose(aAmount, uAmount, 100);
            // create policy
            let coverLimit = 10000;
            let blocks = threeDays;
            let quote = BN.from(await product.getQuote(user3.address, aAddress, coverLimit, blocks));
            quote = quote.mul(10001).div(10000);
            await product.connect(user3).buyPolicy(user3.address, aAddress, coverLimit, blocks, { value: quote });
            let policyID = (await policyManager.totalPolicyCount()).toNumber();
            // sign swap
            let amountOut = 10000;
            let digest = getSubmitClaimDigest("Solace.fi-AaveV2Product", product.address, chainId, policyID, amountOut, deadline);
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
          } catch(e) {
            console.error(e);
            failList.push(atokens[i].symbol);
          }
        }
        await hre.network.provider.request({method: "hardhat_stopImpersonatingAccount",params: [user3Address]});
        if(failList.length != 0) {
          console.log("supported vaults:", successList);
          console.log("unsupported vaults:", failList);
        }
        expect(`${success}/${atokens.length} supported atokens`).to.equal(`${atokens.length}/${atokens.length} supported atokens`);
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

function oneToken(decimals: number) {
  var s = "1";
  for(var i = 0; i < decimals; ++i) s += "0";
  return BN.from(s);
}

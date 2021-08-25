import { waffle, upgrades, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, utils, constants, Contract } from "ethers";
import { ECDSASignature, ecsign } from "ethereumjs-util";
import { getPermitDigest, sign, getDomainSeparator } from "./utilities/signature";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { config as dotenv_config } from "dotenv";
dotenv_config();

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { PolicyManager, WaaveProduct, ExchangeQuoterManual, Treasury, Weth9, ClaimsEscrow, Registry, Vault, RiskManager } from "../typechain";

const SUBMIT_CLAIM_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("WaaveProductSubmitClaim(uint256 policyID,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;

const toBytes32 = (bn: BN) => {
  return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
};

const setStorageAt = async (address: string, index: BigNumberish, value: string) => {
  await ethers.provider.send("hardhat_setStorageAt", [address, index, value]);
  await ethers.provider.send("evm_mine", []); // Just mines to the next block
};

// Returns the EIP712 hash which should be signed by the authorized signer
// in order to make a call to WaaveProduct.submitClaim()
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
        ["bytes1", "bytes1", "bytes32", "bytes32"],
        [
            "0x19",
            "0x01",
            DOMAIN_SEPARATOR,
            utils.keccak256(
            utils.defaultAbiCoder.encode(
                ["bytes32", "uint256", "uint256","uint256"],
                [SUBMIT_CLAIM_TYPEHASH, policyID, amountOut, deadline]
            )
            ),
        ]
        )
    )
}

if(process.env.FORK_NETWORK === "rinkeby"){
  describe("WaaveProduct", function () {
    const [deployer, governor, policyholder1, policyholder2, policyholder3, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: WaaveProduct;
    let product2: WaaveProduct;
    let quoter2: ExchangeQuoterManual;
    let treasury: Treasury;
    let claimsEscrow: ClaimsEscrow;
    let vault: Vault;
    let registry: Registry;
    let riskManager: RiskManager;

    let weth: Weth9;
    let waWeth: Contract;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45100; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const price = 11044; // 2.60%/yr

    const WAREGISTRY_ADDRESS        = "0x670Fc618C48964F806Cd655600541807ed83a9C5";
    const WETH_ADDRESS              = "0xc778417E063141139Fce010982780140Aa0cD5Ab";
    const WAWETH_ADDRESS            = "0x4e1A6cE8EdEd8c9C74CbF797c6aA0Fbc12D89F71";

    const USER1 = "0x0cdD2e13E5b612e8a34049a680cdd57Aca2952E4";
    const BALANCE1 = "600000000000000000";

    const COOLDOWN_PERIOD = 3600; // one hour

    before(async function () {
      artifacts = await import_artifacts();

      registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      weth = (await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS)) as Weth9;
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

      // deploy manual exchange quoter
      quoter2 = (await deployContract(deployer, artifacts.ExchangeQuoterManual, [governor.address])) as ExchangeQuoterManual;
      await quoter2.connect(governor).setRates(["0xbf7a7169562078c96f0ec1a8afd6ae50f12e5a99","0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea","0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","0x6e894660985207feb7cf89faf048998c71e8ee89","0x4dbcdf9b62e891a7cec5a2568c3f4faf9e8abe2b","0xd9ba894e0097f8cc2bbc9d24d308b98e36dc6d02","0x577d296678535e4903d59a4c929b718e1d575e0a","0xddea378a6ddc8afec82c36e9b0078826bf9e68b6","0xc778417E063141139Fce010982780140Aa0cD5Ab"],["264389616860428","445946382179077","1000000000000000000","10221603363836799","444641132530148","448496810835719","14864363968434576288","334585685516318","1000000000000000000"]);

      // deploy Waave Product
      product = (await deployContract(
        deployer,
        artifacts.WaaveProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          WAREGISTRY_ADDRESS,
          minPeriod,
          maxPeriod,
          price,
          1,
          quoter2.address
        ]
      )) as WaaveProduct;

      product2 = (await deployContract(
        deployer,
        artifacts.WaaveProduct,
        [
          governor.address,
          policyManager.address,
          registry.address,
          WAREGISTRY_ADDRESS,
          minPeriod,
          maxPeriod,
          price,
          1,
          quoter2.address
        ]
      )) as WaaveProduct;

      // fetch contracts
      waWeth = await ethers.getContractAt(artifacts.IWaToken.abi, WAWETH_ADDRESS);

      await vault.connect(deployer).depositEth({value: BN.from("1000000000000000000000")}); // 1000 eth
      await riskManager.connect(governor).addProduct(product.address, 1);
      await product.connect(governor).addSigner(paclasSigner.address);
    })

    describe("appraisePosition", function () {
      it("reverts if invalid pool or token", async function () {
        await expect(product.appraisePosition(policyholder1.address, ZERO_ADDRESS)).to.be.reverted;
        await expect(product.appraisePosition(policyholder1.address, policyholder1.address)).to.be.reverted;
      })

      it("no positions should have no value", async function () {
        expect(await product.appraisePosition(policyholder1.address, WAWETH_ADDRESS)).to.equal(0);
      })

      it("a position should have a value", async function () {
        expect(await product.appraisePosition(USER1, WAWETH_ADDRESS)).to.equal(BALANCE1);
      })
    })

    describe("implementedFunctions", function () {
      it("can getQuote", async function () {
        let price = BN.from(await product.price());
        let positionAmount = await product.appraisePosition(USER1, WAWETH_ADDRESS);
        let coverAmount = positionAmount.mul(5000).div(10000);
        let blocks = BN.from(threeDays);
        let expectedPremium = BN.from("64110420000000");
        let quote = BN.from(await product.getQuote(USER1, WAWETH_ADDRESS, coverAmount, blocks))
        expect(quote).to.equal(expectedPremium);
      })
      it("can buyPolicy", async function () {
        expect(await policyManager.totalSupply()).to.equal(0);
        expect(await policyManager.balanceOf(USER1)).to.equal(0);
        // adding the owner product to the ProductManager
        (await policyManager.connect(governor).addProduct(product.address));
        expect(await policyManager.productIsActive(product.address)).to.equal(true);

        let positionAmount = await product.appraisePosition(USER1, WAWETH_ADDRESS);
        let coverAmount = positionAmount.mul(5000).div(10000);
        let blocks = threeDays;
        let quote = BN.from(await product.getQuote(USER1, WAWETH_ADDRESS, coverAmount, blocks));
        let tx = (await product.buyPolicy(USER1, WAWETH_ADDRESS, coverAmount, blocks, { value: quote }));
        expect(tx).to.emit(policyManager, "PolicyCreated").withArgs(1);
        expect(await policyManager.totalSupply()).to.equal(1);
        expect(await policyManager.balanceOf(USER1)).to.equal(1);
      })
      it("can buy duplicate policy", async function () {
        let positionAmount = await product.appraisePosition(USER1, WAWETH_ADDRESS);
        let coverAmount = positionAmount.mul(5000).div(10000);
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(USER1, WAWETH_ADDRESS, coverAmount, blocks));
        await product.buyPolicy(USER1, WAWETH_ADDRESS, coverAmount, blocks, { value: quote });
      })
      it("can get product name", async function () {
        expect(await product.name()).to.equal("Waave");
      })
    })

    describe("submitClaim", function () {
      let policyID1 = 3;
      let policyID2 = 4;
      let amountOut1 = 5000000000;
      let amountOut2 = 50000000;

      before(async function () {
        await deployer.sendTransaction({to: claimsEscrow.address, value: BN.from("1000000000000000000")});
        // create a waWETH position and policy
        let depositAmount1 = BN.from("1000000000000000");
        await weth.connect(policyholder1).deposit({value: depositAmount1});
        await weth.connect(policyholder1).approve(waWeth.address, depositAmount1);
        await waWeth.connect(policyholder1).deposit(depositAmount1);
        let positionAmount1 = await product.appraisePosition(policyholder1.address, WAWETH_ADDRESS);
        let coverAmount1 = positionAmount1;
        let blocks1 = threeDays;
        let quote1 = BN.from(await product.getQuote(policyholder1.address, WAWETH_ADDRESS, coverAmount1, blocks1));
        await product.connect(policyholder1).buyPolicy(policyholder1.address, WAWETH_ADDRESS, coverAmount1, blocks1, { value: quote1 });
        // create another waWETH position and policy
        let depositAmount2 = BN.from("2000000000000000");
        await weth.connect(policyholder2).deposit({value: depositAmount2});
        await weth.connect(policyholder2).approve(waWeth.address, depositAmount2);
        await waWeth.connect(policyholder2).deposit(depositAmount2);
        let positionAmount2 = await product.appraisePosition(policyholder2.address, WAWETH_ADDRESS);
        let coverAmount2 = positionAmount2;
        let blocks2 = threeDays;
        let quote2 = BN.from(await product.getQuote(policyholder2.address, WAWETH_ADDRESS, coverAmount2, blocks2));
        await product.connect(policyholder2).buyPolicy(policyholder2.address, WAWETH_ADDRESS, coverAmount2, blocks2, { value: quote2 });
      });
      it("cannot submit claim with expired signature", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-WaaveProduct", product.address, chainId, policyID1, amountOut1, 0);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, 0, signature)).to.be.revertedWith("expired deadline");
      });
      it("cannot submit claim on someone elses policy", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-WaaveProduct", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder2).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("!policyholder");
      });
      it("cannot submit claim from wrong product", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-WaaveProduct", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product2.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("wrong product");
      });
      it("cannot submit claim with forged signature", async function () {
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, "0x")).to.be.revertedWith("invalid signature");
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, "0xabcd")).to.be.revertedWith("invalid signature");
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890")).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim from unauthorized signer", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-WaaveProduct", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(deployer.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature)).to.be.revertedWith("invalid signature");
      });
      it("cannot submit claim with changed arguments", async function () {
        let digest = getSubmitClaimDigest("Solace.fi-WaaveProduct", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut2, deadline, signature)).to.be.revertedWith("invalid signature");
        await expect(product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline.sub(1), signature)).to.be.revertedWith("invalid signature");
      });
      it("can open a claim on a waWETH position", async function () {
        // sign swap
        let digest = getSubmitClaimDigest("Solace.fi-WaaveProduct", product.address, chainId, policyID1, amountOut1, deadline);
        let signature = assembleSignature(sign(digest, Buffer.from(paclasSigner.privateKey.slice(2), "hex")));
        // submit claim
        let userWaWeth1 = await waWeth.balanceOf(policyholder1.address);
        let userEth0 = await policyholder1.getBalance();
        let tx1 = await product.connect(policyholder1).submitClaim(policyID1, amountOut1, deadline, signature);
        let receipt1 = await tx1.wait();
        let gasCost1 = receipt1.gasUsed.mul(receipt1.effectiveGasPrice);
        let userEth1 = await policyholder1.getBalance();
        expect(userEth1.sub(userEth0).add(gasCost1)).to.equal(0);
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID1);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID1, policyholder1.address, amountOut1);
        expect(await policyManager.exists(policyID1)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claim(policyID1)).amount).to.equal(amountOut1);
        let userWaWeth2 = await waWeth.balanceOf(policyholder1.address);
        expect(userWaWeth1.sub(userWaWeth2)).to.equal(0);
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let tx2 = await claimsEscrow.connect(policyholder1).withdrawClaimsPayout(policyID1);
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
        let userEth2 = await policyholder1.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut1);
      });
      it("should support all watokens", async function () {
        var watokens = [
          {"symbol":"waWETH","address":"0x4e1A6cE8EdEd8c9C74CbF797c6aA0Fbc12D89F71"},
          {"symbol":"waDAI","address":"0x51758E33047b1199439212cBAf3ecd1C04165bF0"},
          {"symbol":"waBAT","address":"0x1E3713729Ab4F2570B823d9c5572B9Cc2E5753Df","uimpl":"","blacklist":""}
        ];
        var success = 0;
        var successList = [];
        var failList = [];
        for(var i = 0; i < watokens.length; ++i){
          const watokenAddress = watokens[i].address;
          const symbol = watokens[i].symbol;
          try {
            // fetch contracts
            const watoken = await ethers.getContractAt(artifacts.IWaToken.abi, watokenAddress);
            const uAddress = await watoken.underlying();
            const uToken = await ethers.getContractAt(artifacts.ERC20.abi, uAddress);
            const decimals = await uToken.decimals();
            const uAmount = oneToken(decimals);
            const uimpl = ((watokens[i].uimpl || "") != "") ? watokens[i].uimpl : uAddress;
            const blacklistAddress = watokens[i].blacklist || ZERO_ADDRESS;
            const isBlacklistable = blacklistAddress != ZERO_ADDRESS;
            // create position
            var value = toBytes32(uAmount).toString();
            for(var j = 0; j < 200; ++j) {
              try { // solidity rigged balanceOf
                var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[policyholder3.address,j]);
                await setStorageAt(uimpl, index, value);
                var uBalance = await uToken.balanceOf(policyholder3.address);
                if(uBalance.eq(uAmount)) break;
              } catch(e) { }
              try { // vyper rigged balanceOf
                var index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[j,policyholder3.address]);
                await setStorageAt(uimpl, index, value);
                var uBalance = await uToken.balanceOf(policyholder3.address);
                if(uBalance.eq(uAmount)) break;
              } catch(e) { }
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
            await uToken.connect(policyholder3).approve(watokenAddress, constants.MaxUint256);
            await watoken.connect(policyholder3).deposit(uAmount);
            expect(await uToken.balanceOf(policyholder3.address)).to.be.equal(0);

            const cAmount = await watoken.balanceOf(policyholder3.address);
            expect(cAmount).to.be.gt(0);
            // create policy
            let positionAmount = await product.appraisePosition(policyholder3.address, watokenAddress);
            let coverAmount = positionAmount;
            let blocks = threeDays;
            let quote = BN.from(await product.getQuote(policyholder3.address, watokenAddress, coverAmount, blocks));
            await product.connect(policyholder3).buyPolicy(policyholder3.address, watokenAddress, coverAmount, blocks, { value: quote });
            let policyID = (await policyManager.totalPolicyCount()).toNumber();
            // sign swap
            let amountOut = 10000;
            let digest = getSubmitClaimDigest("Solace.fi-WaaveProduct", product.address, chainId, policyID, amountOut, deadline);
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
        if(failList.length != 0) {
          console.log("supported watokens:");
          console.log(successList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
          console.log("unsupported watokens:");
          console.log(failList.reduce((acc,val)=>`${acc}  - ${val}\n`,""));
        }
        expect(`${success}/${watokens.length} supported watokens`).to.equal(`${watokens.length}/${watokens.length} supported watokens`);
      });
    })

    describe("covered platform", function () {
      it("starts as waRegistry", async function () {
        expect(await product.coveredPlatform()).to.equal(WAREGISTRY_ADDRESS);
        expect(await product.waRegistry()).to.equal(WAREGISTRY_ADDRESS);
      });
      it("cannot be set by non governor", async function () {
        await expect(product.connect(policyholder1).setCoveredPlatform(policyholder1.address)).to.be.revertedWith("!governance");
      });
      it("can be set", async function () {
        await product.connect(governor).setCoveredPlatform(treasury.address);
        expect(await product.coveredPlatform()).to.equal(treasury.address);
        expect(await product.waRegistry()).to.equal(treasury.address);
        await product.connect(governor).setCoveredPlatform(WAREGISTRY_ADDRESS);
      });
    });
  })
}

function buf2hex(buffer: Buffer) { // buffer is an ArrayBuffer
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0")).join("");
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

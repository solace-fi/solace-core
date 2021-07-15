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
import { PolicyManager, CompoundProductRinkeby, ExchangeQuoterManual, Treasury, Weth9, ClaimsEscrow, Registry, Vault } from "../typechain";

const EXCHANGE_TYPEHASH = utils.keccak256(utils.toUtf8Bytes("CompoundProductExchange(uint256 policyID,address tokenIn,uint256 amountIn,address tokenOut,uint256 amountOut,uint256 deadline)"));

const chainId = 31337;
const deadline = constants.MaxUint256;
const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const toBytes32 = (bn: BN) => {
  return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
};

const setStorageAt = async (address: string, index: BigNumberish, value: string) => {
  await ethers.provider.send("hardhat_setStorageAt", [address, index, value]);
  await ethers.provider.send("evm_mine", []); // Just mines to the next block
};

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

if(process.env.FORK_NETWORK === "rinkeby"){
  describe('CompoundProductRinkeby', () => {
    const [deployer, user, user2, user3, paclasSigner] = provider.getWallets();
    let artifacts: ArtifactImports;

    let policyManager: PolicyManager;
    let product: CompoundProductRinkeby;
    let product2: CompoundProductRinkeby;
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
    let cdai: Contract;
    let dai: Contract;
    let uniswapRouter: Contract;

    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const minPeriod = 6450; // this is about 1 day
    const maxPeriod = 45100; // this is about 1 week from https://ycharts.c om/indicators/ethereum_blocks_per_day
    const threeDays = 19350;
    const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
    const maxCoverPerUser = BN.from("10000000000000000000"); // 10 Ether in wei
    const cancelFee = BN.from("100000000000000000"); // 0.1 Ether in wei
    const price = 11044; // 2.60%/yr

    const COMPTROLLER_ADDRESS = "0x2EAa9D77AE4D8f9cdD9FAAcd44016E746485bddb";
    const cETH_ADDRESS = "0xd6801a1DfFCd0a410336Ef88DeF4320D6DF1883e";
    const USER1 = "0x0fb78424e5021404093aA0cFcf50B176B30a3c1d";
    const BALANCE1 = "1236588650796795918";

    const USDC_ADDRESS = "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b";
    const cUSDC_ADDRESS = "0x5B281A6DdA0B271e91ae35DE655Ad301C976edb1";
    const DAI_ADDRESS = "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa";
    const cDAI_ADDRESS = "0x6D7F0754FFeb405d23C51CE938289d4835bE3b14";
    const WETH_ADDRESS = "0xc778417E063141139Fce010982780140Aa0cD5Ab";


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

      // deploy manual exchange quoter
      quoter2 = (await deployContract(
        deployer,
        artifacts.ExchangeQuoterManual,
        [
          deployer.address
        ]
      )) as ExchangeQuoterManual;
      await expect(quoter2.connect(user).setRates([],[])).to.be.revertedWith("!governance");
      await quoter2.setRates(["0xbf7a7169562078c96f0ec1a8afd6ae50f12e5a99","0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea","0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","0x6e894660985207feb7cf89faf048998c71e8ee89","0x4dbcdf9b62e891a7cec5a2568c3f4faf9e8abe2b","0xd9ba894e0097f8cc2bbc9d24d308b98e36dc6d02","0x577d296678535e4903d59a4c929b718e1d575e0a","0xddea378a6ddc8afec82c36e9b0078826bf9e68b6"],["264389616860428","445946382179077","1000000000000000000","10221603363836799","444641132530148","448496810835719","14864363968434576288","334585685516318"]);

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
        artifacts.CompoundProductRinkeby,
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
          quoter2.address
        ]
      )) as CompoundProductRinkeby;

      product2 = (await deployContract(
        deployer,
        artifacts.CompoundProductRinkeby,
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
          quoter2.address
        ]
      )) as CompoundProductRinkeby;

      // fetch contracts
      comptroller = await ethers.getContractAt(artifacts.IComptrollerRinkeby.abi, COMPTROLLER_ADDRESS);
      ceth = await ethers.getContractAt(artifacts.ICETH.abi, cETH_ADDRESS);
      cusdc = await ethers.getContractAt(artifacts.ICERC20.abi, cUSDC_ADDRESS);
      usdc = await ethers.getContractAt(artifacts.ERC20.abi, USDC_ADDRESS);
      cdai = await ethers.getContractAt(artifacts.ICERC20.abi, cDAI_ADDRESS);
      dai = await ethers.getContractAt(artifacts.ERC20.abi, DAI_ADDRESS);
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
      })
    })

    describe('implementedFunctions', function () {
      it('can getQuote', async function () {
        let price = BN.from(await product.price());
        let coverLimit = 5000 // cover 50% of the position
        let blocks = BN.from(threeDays)
        let expectedPremium = BN.from("132130362949693");
        let quote = BN.from(await product.getQuote(USER1, cETH_ADDRESS, coverLimit, blocks))
        expect(quote).to.equal(expectedPremium);
      })
      it('can buyPolicy', async function () {
        expect(await policyManager.totalSupply()).to.equal(0);
        expect(await policyManager.balanceOf(USER1)).to.equal(0);
        // adding the owner product to the ProductManager
        (await policyManager.connect(deployer).addProduct(product.address));
        expect(await policyManager.productIsActive(product.address)).to.equal(true);

        let coverLimit = 5000 // cover 50% of the position
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
        let coverLimit = 5000 // cover 50% of the position
        let blocks = threeDays
        let quote = BN.from(await product.getQuote(USER1, cETH_ADDRESS, coverLimit, blocks));
        await product.buyPolicy(USER1, cETH_ADDRESS, coverLimit, blocks, { value: quote });
      })
    })

    describe("submitClaim", function () {
      let policyID1 = 3;
      let policyID2 = 4;
      let policyID3 = 5;
      let policyID4 = 6;
      let amountIn1 = 3511922;
      let amountOut1 = 5000000000;
      let amountIn2 = 10000000;
      let amountOut2 = 50000000;
      let amountIn3 = 300000;
      let amountOut3 = 1000000;
      let amountIn4 = BN.from("4000000000");
      let amountOut4 = 1000000;

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
        var ethIn = "100000";
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
        // create a cDAI position and policy
        const daiAmount = BN.from("1000000000000000000")
        const index = ethers.utils.solidityKeccak256(["uint256", "uint256"],[user.address,0]);
        await setStorageAt(dai.address,index,toBytes32(daiAmount).toString());
        expect(await dai.balanceOf(user.address)).to.equal(daiAmount);
        await dai.connect(user).approve(cdai.address, constants.MaxUint256);
        await cdai.connect(user).mint(daiAmount);
        await cdai.connect(user).approve(product.address, constants.MaxUint256);
        expect(await cdai.balanceOf(user.address)).to.be.gte(amountIn4);
        quote = BN.from(await product.getQuote(user.address, cDAI_ADDRESS, coverLimit, blocks));
        await product.connect(user).buyPolicy(user.address, cDAI_ADDRESS, coverLimit, blocks, { value: quote });
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
        expect(userEth1.sub(userEth0).add(gasCost1)).to.equal(1000001535949598); // redeem value
        expect(tx1).to.emit(product, "ClaimSubmitted").withArgs(policyID1);
        expect(tx1).to.emit(claimsEscrow, "ClaimReceived").withArgs(policyID1, user.address, amountOut1);
        expect(await policyManager.exists(policyID1)).to.be.false;
        // verify payout
        expect((await claimsEscrow.claims(policyID1)).amount).to.equal(amountOut1);
        let userCeth2 = await ceth.balanceOf(user.address);
        expect(userCeth1.sub(userCeth2)).to.equal(amountIn1);
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let tx2 = await claimsEscrow.connect(user).withdrawClaimsPayout(policyID1);
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
        expect(userUsdc2.sub(userUsdc1)).to.equal(2348); // redeem value
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let userEth1 = await user.getBalance();
        let tx2 = await claimsEscrow.connect(user).withdrawClaimsPayout(policyID2);
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
        expect(userUsdc2.sub(userUsdc1)).to.equal(70); // redeem value
        await provider.send("evm_increaseTime", [COOLDOWN_PERIOD]); // add one hour
        let userEth1 = await user2.getBalance();
        let tx2 = await claimsEscrow.connect(user2).withdrawClaimsPayout(policyID3);
        let receipt = await tx2.wait();
        let gasCost = receipt.gasUsed.mul(tx2.gasPrice || 0);
        let userEth2 = await user2.getBalance();
        expect(userEth2.sub(userEth1).add(gasCost)).to.equal(amountOut3);
      });
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

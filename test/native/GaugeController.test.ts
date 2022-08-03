import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, constants, BigNumberish, Wallet, ContractTransaction } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);
import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { UnderwritingLocker, UnderwritingLockVoting, Registry, MockErc20Permit, GaugeController } from "../../typechain";
import { expectDeployed } from "../utilities/expectDeployed";
import { expectClose } from "./../utilities/math";

/*******************
  GLOBAL CONSTANTS
*******************/
const ZERO = BN.from("0");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const ONE_MILLION_ETHER = ONE_ETHER.mul(1000000);
const ONE_YEAR = 31536000; // in seconds
const ONE_MONTH = ONE_YEAR / 12;
const ONE_WEEK = 604800; // in seconds
const DEPOSIT_AMOUNT = ONE_ETHER;
const SCALE_FACTOR = ONE_ETHER;
const ONE_PERCENT = ONE_ETHER.div(100);
const ONE_HUNDRED_PERCENT = ONE_ETHER;

describe("UnderwritingLockVoting", function () {
    const [deployer, governor, revenueRouter, owner1, delegate1, delegate2, anon] = provider.getWallets();
  
    /***************************
       VARIABLE DECLARATIONS
    ***************************/
    let token: MockErc20Permit;
    let registry: Registry;
    let underwritingLocker: UnderwritingLocker;
    let gaugeController: GaugeController;
    let voting: UnderwritingLockVoting;
    let artifacts: ArtifactImports;
    let snapshot: BN;

    before(async function () {
        artifacts = await import_artifacts();
        snapshot = await provider.send("evm_snapshot", []);
        await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
        
        // Deploy $UWE, and mint 1M $UWE to deployer
        token = (await deployContract(deployer, artifacts.MockERC20Permit, ["Underwriting Equity - Solace Native", "UWE", ONE_MILLION_ETHER, 18])) as MockErc20Permit;
  
        // Deploy registry
        registry = (await deployContract(deployer, artifacts.Registry, [governor.address])) as Registry;
      });
    
      after(async function () {
        await provider.send("evm_revert", [snapshot]);
      });

      describe("deployment", function () {
        it("reverts if zero address governance", async function () {
          await expect(deployContract(deployer, artifacts.GaugeController, [ZERO_ADDRESS, registry.address])).to.be.revertedWith("zero address governance");
        });
        it("reverts if zero address token", async function () {
          await expect(deployContract(deployer, artifacts.GaugeController, [governor.address, ZERO_ADDRESS])).to.be.revertedWith('ZeroAddressInput("token")');
        });
        it("deploys", async function () {
          gaugeController = (await deployContract(deployer, artifacts.GaugeController, [governor.address, token.address])) as GaugeController;
          await expectDeployed(gaugeController.address);
        });
        it("initializes properly", async function () {
          expect(await gaugeController.token()).eq(token.address);
          expect(await gaugeController.leverageFactor()).eq(ONE_HUNDRED_PERCENT);
          expect(await gaugeController.totalGauges()).eq(0);
          expect(await gaugeController.lastTimeGaugeWeightsUpdated()).eq(0);
          expect(await gaugeController.WEEK()).eq(ONE_WEEK);
          expect(await gaugeController.getGaugeWeight(0)).eq(ZERO);
          expect(await gaugeController.getAllGaugeWeights()).deep.eq([ZERO]);
          expect(await gaugeController.getNumActiveGauges()).eq(0);
          expect(await gaugeController.getNumPausedGauges()).eq(0);
          expect(await gaugeController.getGaugeName(0)).eq("");
          expect(await gaugeController.isGaugeActive(0)).eq(false);
          expect(await gaugeController.getRateOnLineOfGauge(0)).eq(0);
          expect(await gaugeController.getInsuranceCapacity()).eq(0);
          expect(await gaugeController.getVotePowerSum()).eq(0);
        });
        it("getEpochStartTimestamp gets current timestamp rounded down to a multiple of WEEK ", async function () {
          const CURRENT_TIME = (await provider.getBlock('latest')).timestamp;
          const EXPECTED_EPOCH_START_TIME = BN.from(CURRENT_TIME).div(ONE_WEEK).mul(ONE_WEEK)
          expect(await gaugeController.getEpochStartTimestamp()).eq(EXPECTED_EPOCH_START_TIME)
        });
        it("getEpochEndTimestamp() == getEpochStartTimestamp() + ONE_WEEK ", async function () {
          expect(await gaugeController.getEpochEndTimestamp()).eq((await gaugeController.getEpochStartTimestamp()).add(ONE_WEEK))
        });
    });

});
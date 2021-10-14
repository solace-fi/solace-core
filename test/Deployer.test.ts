import chai from "chai";
import { waffle, ethers } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN, Contract } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Registry, Solace, OptionsFarming, FarmController, Vault, Treasury, ClaimsEscrow, Weth9, PolicyManager, RiskManager, MockErc20, Deployer } from "../typechain";
import { toBytes32 } from "./utilities/setStorage";

describe("Deployer", function () {

  let deployerContract: Deployer;
  let solace: Solace;
  const [owner, governor, minter] = provider.getWallets();
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  let artifacts: ArtifactImports;

  let initcode: string;
  let solaceAddress: string;

  before(async function () {
    artifacts = await import_artifacts();
    await owner.sendTransaction({to:owner.address}); // for some reason this helps solidity-coverage
    deployerContract = (await deployContract(owner, artifacts.Deployer)) as Deployer;
  });

  describe("CREATE", async function () {
    it("can get initcode from the create deployment tx", async function () {
      solace = (await deployContract(owner, artifacts.SOLACE, [governor.address])) as Solace;
      initcode = solace.deployTransaction.data;
      expect(initcode.length).gt(2);
      solaceAddress = solace.address;
      expect(solaceAddress.length).gt(2);
    });
    it("duplicate deployment same initcode different address", async function () {
      solace = (await deployContract(owner, artifacts.SOLACE, [governor.address])) as Solace;
      expect(solace.deployTransaction.data).eq(initcode);
      expect(solace.address).not.eq(solaceAddress);
    });
    it("different msg.sender same initcode", async function () {
      solace = (await deployContract(governor, artifacts.SOLACE, [governor.address])) as Solace;
      expect(solace.deployTransaction.data).eq(initcode);
      expect(solace.address).not.eq(solaceAddress);
    });
    it("different params different initcode", async function () {
      solace = (await deployContract(owner, artifacts.SOLACE, [owner.address])) as Solace;
      expect(solace.deployTransaction.data).not.eq(initcode);
      expect(solace.address).not.eq(solaceAddress);
    });
    it("different contract different initcode", async function () {
      let token = (await deployContract(owner, artifacts.MockERC20, ["TKN", "MyToken", 1000000])) as MockErc20;
      expect(token.deployTransaction.data).not.eq(initcode);
      expect(token.address).not.eq(solaceAddress);
    });
  });

  describe("CREATE2", function () {
    before(async function () {
      solace = (await deployContract(owner, artifacts.SOLACE, [governor.address])) as Solace;
      initcode = solace.deployTransaction.data;
    });
    it("reverts invalid initcodes", async function () {
      //await expect(deployerContract.deploy("0x", toBytes32(0))).to.be.revertedWith("invalid initcode");
      await expect(deployerContract.deploy("0xabcd", toBytes32(0))).to.be.revertedWith("invalid initcode");
      //await expect(deployerContract.deploy(solace.deployTransaction.data, toBytes32(0))).to.be.revertedWith("invalid initcode");
    });
    it("can predict contract address", async function () {
      // predict deployment
      let predictedAddress = await deployerContract.callStatic.deploy(initcode, toBytes32(0));
      expect(predictedAddress.length).eq(42);
      expect(predictedAddress).to.not.equal(ZERO_ADDRESS);
      // test no deployment
      solace = (await ethers.getContractAt(artifacts.SOLACE.abi, predictedAddress)) as Solace;
      await expect(solace.isMinter(governor.address)).to.be.reverted;
      // test actual deployment
      let tx = await deployerContract.deploy(initcode, toBytes32(0), {gasLimit: 10000000});
      //let gasUsed = (await tx.wait()).gasUsed;
      //console.log('gas used:', gasUsed.toNumber());
      expect(tx).to.emit(deployerContract, "ContractDeployed").withArgs(predictedAddress);
      solaceAddress = predictedAddress;
    });
    it("can manipulate contract address", async function () {
      // predict deployment
      let predictedAddress = await deployerContract.callStatic.deploy(initcode, toBytes32(1));
      expect(predictedAddress.length).eq(42);
      expect(predictedAddress).to.not.equal(ZERO_ADDRESS);
      expect(predictedAddress).to.not.equal(solaceAddress);
      // test no deployment
      solace = (await ethers.getContractAt(artifacts.SOLACE.abi, predictedAddress)) as Solace;
      await expect(solace.isMinter(governor.address)).to.be.reverted;
      // test actual deployment
      let tx = await deployerContract.deploy(initcode, toBytes32(1), {gasLimit: 10000000});
      //let gasUsed = (await tx.wait()).gasUsed;
      //console.log('gas used:', gasUsed.toNumber());
      expect(tx).to.emit(deployerContract, "ContractDeployed").withArgs(predictedAddress);
      solaceAddress = predictedAddress;
      solace = (await ethers.getContractAt(artifacts.SOLACE.abi, predictedAddress)) as Solace;
    });
    it("can brute force a desired address", async function () {
      // to brute force an exact address would cost $10B
      // we can reasonably guess and check a few characters
      /*
      let salt: number = 0;
      let found = false;
      let predictedAddress: string = "0x";
      for(var i = 2; i < 1000 && !found; ++i) {
        // calculate address for next salt
        salt = i;
        predictedAddress = await deployerContract.callStatic.deploy(initcode, toBytes32(salt));
        if(predictedAddress.substring(0,4).toLowerCase() == "0xab") {
          found = true;
          break;
        }
      }
      expect(found).eq(true);
      await deployerContract.deploy(initcode, toBytes32(salt), {gasLimit: 10000000});
      solace = (await ethers.getContractAt(artifacts.SOLACE.abi, predictedAddress)) as Solace;
      */
    });
    it("contract works", async function () {
      expect(await solace.isMinter(minter.address)).to.eq(false);
      await solace.connect(governor).addMinter(minter.address);
      expect(await solace.isMinter(minter.address)).to.eq(true);
    });
    //it("redeploys to same address ?", async function () {});
  });

  describe("deploy multiple", function () {
    it("reverts length mismatch", async function () {
      await expect(deployerContract.deployMultiple([], [toBytes32(0)])).to.be.revertedWith("length mismatch");
    });
    it("reverts invalid deploys", async function () {
      //await expect(deployerContract.deployMultiple([solace.deployTransaction.data], [toBytes32(0)])).to.be.revertedWith("invalid initcode");
      await expect(deployerContract.deployMultiple(["0xabcd"], [toBytes32(0)])).to.be.revertedWith("invalid initcode");
    });
    it("can redeploy zero", async function () {
      let initcodes = fill(0, initcode);
      let salts = range(10000, 10000);
      let saltBytes = salts.map(toBytes32);
      let predictedAddresses = await deployerContract.callStatic.deployMultiple(initcodes, saltBytes);
      let tx = await deployerContract.deployMultiple(initcodes, saltBytes);
      predictedAddresses.forEach((addr: any) => { expect(tx).to.emit(deployerContract, "ContractDeployed").withArgs(addr); });
      //let gasUsed = (await tx.wait()).gasUsed;
      //console.log('gas used:', gasUsed.toNumber());
    });
    it("can redeploy one", async function () {
      let initcodes = fill(1, initcode);
      let salts = range(10000, 10001);
      let saltBytes = salts.map(toBytes32);
      let predictedAddresses = await deployerContract.callStatic.deployMultiple(initcodes, saltBytes);
      let tx = await deployerContract.deployMultiple(initcodes, saltBytes);
      predictedAddresses.forEach((addr: any) => { expect(tx).to.emit(deployerContract, "ContractDeployed").withArgs(addr); });
      //let gasUsed = (await tx.wait()).gasUsed;
      //console.log('gas used:', gasUsed.toNumber());
    });
    it("can redeploy more than one", async function () {
      let initcodes = fill(2, initcode);
      let salts = range(10010, 10012);
      let saltBytes = salts.map(toBytes32);
      let predictedAddresses = await deployerContract.callStatic.deployMultiple(initcodes, saltBytes);
      let tx = await deployerContract.deployMultiple(initcodes, saltBytes);
      predictedAddresses.forEach((addr: any) => { expect(tx).to.emit(deployerContract, "ContractDeployed").withArgs(addr); });
      //let gasUsed = (await tx.wait()).gasUsed;
      //console.log('gas used:', gasUsed.toNumber());
    });
    it("can deploy all", async function () {
      // contracts
      let registry: Registry;
      let weth: Weth9;
      let vault: Vault;
      let claimsEscrow: ClaimsEscrow;
      let treasury: Treasury;
      let policyManager: PolicyManager;
      let riskManager: RiskManager;
      // deploy with create
      registry = (await deployContract(owner, artifacts.Registry, [owner.address])) as Registry;
      weth = (await deployContract(owner,artifacts.WETH)) as Weth9;
      await registry.setWeth(weth.address);
      vault = (await deployContract(owner,artifacts.Vault,[owner.address,registry.address])) as Vault;
      await registry.setVault(vault.address);
      claimsEscrow = (await deployContract(owner,artifacts.ClaimsEscrow,[owner.address,registry.address])) as ClaimsEscrow;
      await registry.setClaimsEscrow(claimsEscrow.address);
      treasury = (await deployContract(owner, artifacts.Treasury, [governor.address, registry.address])) as Treasury;
      await registry.setTreasury(treasury.address);
      policyManager = (await deployContract(owner,artifacts.PolicyManager,[owner.address])) as PolicyManager;
      await registry.setPolicyManager(policyManager.address);
      riskManager = (await deployContract(owner, artifacts.RiskManager, [owner.address, registry.address])) as RiskManager;
      await registry.setRiskManager(riskManager.address);
      // deploy with create2
      let contracts = [vault, claimsEscrow, treasury, policyManager, riskManager];
      let initcodes = contracts.map((contract: Contract) => { return contract.deployTransaction.data; });
      let saltBytes = fill(contracts.length, toBytes32(0));
      let predictedAddresses = await deployerContract.callStatic.deployMultiple(initcodes, saltBytes);
      let tx = await deployerContract.deployMultiple(initcodes, saltBytes);
      predictedAddresses.forEach((addr: any) => { expect(tx).to.emit(deployerContract, "ContractDeployed").withArgs(addr); });
      //let gasUsed = (await tx.wait()).gasUsed;
      //console.log('gas used:', gasUsed.toNumber());
    });
  });
});

function range(s: number, e: number) {
  var a = [];
  for(var i = s; i < e; ++i) a.push(i);
  return a;
}

function fill(len: number, filler: any) {
  var a = [];
  for(var i = 0; i < len; ++i) a.push(filler);
  return a;
}

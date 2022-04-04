import { waffle, ethers, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Wallet, BigNumber as BN, constants, utils } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";

import { MockCloneable } from "./../../typechain";
import { toBytes32 } from "../utilities/setStorage";
import { expectDeployed } from "../utilities/expectDeployed";

describe("Cloneable", function() {
  let artifacts: ArtifactImports;
  let snapshot: BN;
  const [deployer, governor, governor2, user] = provider.getWallets();

  // contracts
  let cloneable1: MockCloneable;
  let cloneable2: MockCloneable;
  let cloneable3: MockCloneable;
  let cloneable4: MockCloneable;
  let cloneable5: MockCloneable;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  before(async function() {
    artifacts = await import_artifacts();
    snapshot = await provider.send("evm_snapshot", []);
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
  });

  after(async function () {
    await provider.send("evm_revert", [snapshot]);
  });

  describe("deployment", async function () {
    it("deploys", async function () {
      cloneable1 = (await deployContract(deployer, artifacts.MockCloneable)) as MockCloneable;
      await expectDeployed(cloneable1.address);
    });
    it("reverts zero address governor", async function () {
      await expect(cloneable1.initialize("aaaa", ZERO_ADDRESS)).to.be.revertedWith("zero address governance");
    });
    it("initializes", async function () {
      await cloneable1.initialize("aaaa", governor.address);
      expect(await cloneable1.message()).eq("aaaa");
      expect(await cloneable1.governance()).eq(governor.address);
    });
    it("reverts double initialize", async function () {
      await expect(cloneable1.initialize("aaaa", governor.address)).to.be.revertedWith("Initializable: contract is already initialized");
    });
    it("can set message", async function () {
      await expect(cloneable1.connect(user).setMessage("bbbb")).to.be.revertedWith("!governance");
      await cloneable1.connect(governor).setMessage("bbbb");
      expect(await cloneable1.message()).eq("bbbb");
    });
  });

  describe("clone", async function () {
    it("clones", async function () {
      let tx = await cloneable1.clone("cccc", governor2.address);
      let events1 = (await tx.wait())?.events;
      if(events1 && events1.length > 0) {
        let event1 = events1[0];
        cloneable2 = await ethers.getContractAt(artifacts.MockCloneable.abi, event1?.args?.["deployment"]) as MockCloneable;
      } else throw "no deployment";
      await expectDeployed(cloneable2.address);
      expect(await cloneable1.message()).eq("bbbb");
      expect(await cloneable1.governance()).eq(governor.address);
      expect(await cloneable2.message()).eq("cccc");
      expect(await cloneable2.governance()).eq(governor2.address);
    });
    it("reverts zero address governor", async function () {
      await expect(cloneable1.clone("dddd", ZERO_ADDRESS)).to.be.revertedWith("zero address governance");
    });
    it("reverts double initialize", async function () {
      await expect(cloneable2.initialize("dddd", governor.address)).to.be.revertedWith("Initializable: contract is already initialized");
    });
    it("can set message", async function () {
      await expect(cloneable2.connect(user).setMessage("dddd")).to.be.revertedWith("!governance");
      await cloneable2.connect(governor2).setMessage("dddd");
      expect(await cloneable2.message()).eq("dddd");
    });
  });

  describe("clone of a clone", async function () {
    it("clones", async function () {
      let tx = await cloneable2.clone("qqqq", governor.address);
      let events1 = (await tx.wait())?.events;
      if(events1 && events1.length > 0) {
        let event1 = events1[0];
        cloneable4 = await ethers.getContractAt(artifacts.MockCloneable.abi, event1?.args?.["deployment"]) as MockCloneable;
      } else throw "no deployment";
      await expectDeployed(cloneable4.address);
      expect(await cloneable2.message()).eq("dddd");
      expect(await cloneable2.governance()).eq(governor2.address);
      expect(await cloneable4.message()).eq("qqqq");
      expect(await cloneable4.governance()).eq(governor.address);
    });
    it("reverts zero address governor", async function () {
      await expect(cloneable1.clone("dddd", ZERO_ADDRESS)).to.be.revertedWith("zero address governance");
    });
    it("reverts double initialize", async function () {
      await expect(cloneable4.initialize("dddd", governor.address)).to.be.revertedWith("Initializable: contract is already initialized");
    });
    it("can set message", async function () {
      await expect(cloneable4.connect(user).setMessage("dddd")).to.be.revertedWith("!governance");
      await cloneable4.connect(governor).setMessage("dddd");
      expect(await cloneable4.message()).eq("dddd");
    });
  });

  describe("clone2", async function () {
    let salt = toBytes32(1);
    it("clones", async function () {
      let predAddr = await cloneable1.calculateMinimalProxyDeploymentAddress(salt);
      await cloneable1.clone2("cccc", governor2.address, salt);
      cloneable3 = (await ethers.getContractAt(artifacts.MockCloneable.abi, predAddr)) as MockCloneable;
      await expectDeployed(cloneable3.address);
      expect(await cloneable1.message()).eq("bbbb");
      expect(await cloneable1.governance()).eq(governor.address);
      expect(await cloneable3.message()).eq("cccc");
      expect(await cloneable3.governance()).eq(governor2.address);
    });
    it("reverts duplicate salt", async function () {
      await expect(cloneable1.clone2("dddd", ZERO_ADDRESS, salt)).to.be.revertedWith("Cloneable: failed deployment");
    });
    it("reverts zero address governor", async function () {
      await expect(cloneable1.clone2("dddd", ZERO_ADDRESS, toBytes32(2))).to.be.revertedWith("zero address governance");
    });
    it("reverts double initialize", async function () {
      await expect(cloneable3.initialize("dddd", governor.address)).to.be.revertedWith("Initializable: contract is already initialized");
    });
    it("can set message", async function () {
      await expect(cloneable3.connect(user).setMessage("dddd")).to.be.revertedWith("!governance");
      await cloneable3.connect(governor2).setMessage("dddd");
      expect(await cloneable3.message()).eq("dddd");
    });
  });

  describe("clone2 of a clone2", async function () {
    let salt = toBytes32(1);
    it("clones", async function () {
      let predAddr = await cloneable3.calculateMinimalProxyDeploymentAddress(salt);
      await cloneable3.clone2("zzzz", governor.address, salt);
      cloneable5 = (await ethers.getContractAt(artifacts.MockCloneable.abi, predAddr)) as MockCloneable;
      await expectDeployed(cloneable5.address);
      expect(await cloneable3.message()).eq("dddd");
      expect(await cloneable3.governance()).eq(governor2.address);
      expect(await cloneable5.message()).eq("zzzz");
      expect(await cloneable5.governance()).eq(governor.address);
    });
    it("reverts duplicate salt", async function () {
      await expect(cloneable1.clone2("dddd", ZERO_ADDRESS, salt)).to.be.revertedWith("Cloneable: failed deployment");
    });
    it("reverts zero address governor", async function () {
      await expect(cloneable1.clone2("dddd", ZERO_ADDRESS, toBytes32(2))).to.be.revertedWith("zero address governance");
    });
    it("reverts double initialize", async function () {
      await expect(cloneable5.initialize("dddd", governor.address)).to.be.revertedWith("Initializable: contract is already initialized");
    });
    it("can set message", async function () {
      await expect(cloneable5.connect(user).setMessage("dddd")).to.be.revertedWith("!governance");
      await cloneable5.connect(governor).setMessage("dddd");
      expect(await cloneable5.message()).eq("dddd");
    });
  });
});

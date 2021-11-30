import chai from "chai";
import { waffle } from "hardhat";
const { expect } = chai;
const { deployContract, solidity } = waffle;
import { BigNumber as BN } from "ethers";
const provider = waffle.provider;
chai.use(solidity);

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, Faucet } from "../typechain";

const TEN_ETHER = BN.from("10000000000000000000")

describe("Faucet", function () {
  let solace: Solace;
  let faucet: Faucet;
  const [deployer, governor, receiver1, receiver2] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage
    solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;
    faucet = (await deployContract(deployer, artifacts.Faucet, [solace.address])) as Faucet;
  });

  it("has correct solace", async function () {
    expect(await faucet.solace()).eq(solace.address);
  });
  it("cant mint without permissions", async function () {
    await expect(faucet.connect(receiver1).drip()).to.be.revertedWith("!minter");
  });
  it("can mint", async function () {
    await solace.connect(governor).addMinter(faucet.address);

    let bal1 = await solace.balanceOf(receiver1.address);
    await faucet.connect(receiver1).drip();
    let bal2 = await solace.balanceOf(receiver1.address);
    expect(bal2.sub(bal1)).eq(TEN_ETHER)

    let bal3 = await solace.balanceOf(receiver2.address);
    await faucet.connect(receiver2).drip();
    let bal4 = await solace.balanceOf(receiver2.address);
    expect(bal4.sub(bal3)).eq(TEN_ETHER)
  });
  it("cant mint again soon", async function () {
    await expect(faucet.connect(receiver1).drip()).to.be.revertedWith("well dry");
  });
  it("can mint again later", async function () {
    let timeStamp = (await provider.getBlock('latest')).timestamp;
    await provider.send("evm_setNextBlockTimestamp", [timeStamp + 86400]);
    await provider.send("evm_mine", []);

    let bal1 = await solace.balanceOf(receiver1.address);
    await faucet.connect(receiver1).drip();
    let bal2 = await solace.balanceOf(receiver1.address);
    expect(bal2.sub(bal1)).eq(TEN_ETHER)

    let bal3 = await solace.balanceOf(receiver2.address);
    await faucet.connect(receiver2).drip();
    let bal4 = await solace.balanceOf(receiver2.address);
    expect(bal4.sub(bal3)).eq(TEN_ETHER)
  });
});

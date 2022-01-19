import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet } from "ethers";
import chai from "chai";
const { expect } = chai;
chai.use(solidity);


import { import_artifacts, ArtifactImports } from "./../utilities/artifact_importer";
import { Weth9 } from "./../../typechain";

const ONE_ETHER = BN.from("1000000000000000000");

// contracts
let weth: Weth9;

describe("Overrides", function () {
  const [deployer, governor] = provider.getWallets();
  let artifacts: ArtifactImports;

  before(async function () {
    artifacts = await import_artifacts();
    await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
  });

  it("does stuff", async function () {
    let tx1 = await deployer.sendTransaction({to:governor.address});
    await logTx(tx1);
    let tx2 = await deployer.sendTransaction({to:governor.address, value:ONE_ETHER});
    await logTx(tx2);
    let tx3 = await weth.connect(deployer).deposit({value: ONE_ETHER});
    await logTx(tx3);
    let tx4 = await weth.connect(deployer).deposit({maxPriorityFeePerGas: 2600000000, maxFeePerGas: 123000000000});
    await logTx(tx4);
    let tx5 = await weth.connect(deployer).deposit({gasPrice: 65000000000, gasLimit: 70000});
    await logTx(tx5);
  });
});

async function logTx(tx: any) {
  return;
  console.log(tx);
  console.log(await tx.wait());
  console.log(tx.maxPriorityFeePerGas?.toString());
  console.log(tx.maxFeePerGas?.toString());
  console.log(tx.gasPrice?.toString());
  console.log(tx.gasLimit?.toString());
  console.log('\n')
}

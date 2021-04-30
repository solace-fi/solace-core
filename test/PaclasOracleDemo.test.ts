import { waffle, ethers } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants, Wallet, Contract } from "ethers";
import chai from "chai";
const { expect } = chai;

// solace imports
import PaclasOracleDemoArtifact from "../artifacts/contracts/PaclasOracleDemo.sol/PaclasOracleDemo.json";
import { PaclasOracleDemo } from "../typechain";

import link_abi from "./link_abi.json";
import { LinkTokenInterface } from "../typechain/LinkTokenInterface";

chai.use(solidity);

describe("PaclasOracleDemo", function () {
  // users
  let user: any;

  // contracts
  let paclas: PaclasOracleDemo;
  let link: LinkTokenInterface;

  const linkAddress: { [chainid: number]: string } = {
    1:  "0x514910771af9ca656af840dff83e8264ecf986ca",
    42: "0xa36085f69e2889c224210f603d836748e7dc0088"
  };

  const ERROR_FLAG = '10000000000000000000000000000000000000000000000000000000000000000000000000000';

  before(async function () {
    const network = await provider.getNetwork();
    if(!linkAddress[network.chainId]) {
      console.log(``);
      console.log(`    #######################################################################`);
      console.log(`    #                                                                     #`);
      console.log(`    #  NOTICE:                                                            #`);
      console.log(`    #                                                                     #`);
      console.log(`    #  This test will throw errors when run on local networks.            #`);
      console.log(`    #  You will need to run this test on a public testnet.                #`);
      console.log(`    #  "npx hardhat test test/PaclasOracleDemo.test.ts --network kovan".  #`);
      console.log(`    #                                                                     #`);
      console.log(`    #######################################################################`);
      console.log(``);
      [user] = provider.getWallets();
    } else {
      [user] = await ethers.getSigners();
    }

    // deploy paclas demo
    paclas = (await deployContract(
      user,
      PaclasOracleDemoArtifact
    )) as PaclasOracleDemo;
    console.log(`    Contract deployed to ${paclas.address}`);

    // get link
    link = (await ethers.getContractAt(link_abi, linkAddress[network.chainId])) as LinkTokenInterface;
    // fund contract with link
    const requestCost = BN.from("100000000000000000"); // 0.1 * 10 ** 18
    await link.transfer(paclas.address, requestCost.mul(2));
  })

  describe("oracle", function () {
    it("can get loss", async function () {
      // fetch https://solace-api.aleonard.dev/losses/12322995/12323375
      await callUntilSuccess(async () => paclas.connect(user).requestLoss(0, 12322995, 12323375));
      expect(await checkDelayed((async () => paclas.loss()), -7253523563513888)).to.be.true;
    })

    it("catches api errors", async function () {
      // api really should throw an http 4xx error
      // instead return http 200 and error flag body
      await callUntilSuccess(async () => paclas.connect(user).requestLoss(1, 2, 3));
      expect(await checkDelayed((async () => paclas.loss()), ERROR_FLAG)).to.be.true;
    })
  })

  // helper functions

  // public testnets like to throw errors for no reason
  // this function calls another function until it works
  async function callUntilSuccess(f: Function) {
    while(true) {
      try {
        await f();
        break;
      } catch(err) {}
    }
  }

  // wait some time in milliseconds
  async function wait(delay: number) {
    return new Promise((resolve, _reject) => {
      setTimeout(() => { resolve(undefined); }, delay)
    })
  }

  // there is a few block delay in receiving a response from the oracle
  // this runs a polling loop for the response
  async function checkDelayed(
    f: Function,
    v: BigNumberish,
    delay: number = 1000,
    maxDelay: number = 60000
  ) {
    let startTime = Date.now();
    let v2 = BN.from(v);
    while(true) {
      let elapsedTime = Date.now() - startTime;
      if(elapsedTime > maxDelay) return false;
      var res = await f();
      if(res.eq(v2)) return true;
      await wait(delay);
    }
  }
});

// npx hardhat test test/TokenVesting.test.ts

import { ethers, waffle, upgrades } from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { Transaction, BigNumber as BN, Contract, constants, BigNumberish, Wallet, utils } from "ethers";
import chai from "chai";
const { expect } = chai;

import { import_artifacts, ArtifactImports } from "./utilities/artifact_importer";
import { Solace, MockErc20Decimals, MockErc20Permit, TokenVesting } from "../typechain";
import { bnAddSub, bnMulDiv, expectClose } from "./utilities/math";
import { getERC20PermitSignature } from "./utilities/getERC20PermitSignature";
import { readFileSync } from "fs";
import { threadId } from "worker_threads";

chai.use(solidity);

// contracts
let solace: Solace;
let tokenVesting: TokenVesting;

// tokens
let usdc: MockErc20Permit;
let usdt: MockErc20Decimals;
let dai: MockErc20Permit;
let uni: MockErc20Permit;

// vars
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_ETHER = BN.from("1000000000000000000");
const TEN_ETHER = BN.from("10000000000000000000");
const ONE_THOUSAND_ETHER = BN.from("1000000000000000000000");
const THREE_HUNDRED_THOUSAND_ETHER = BN.from("300000000000000000000000");
const FOUR_HUNDRED_THOUSAND_ETHER = BN.from("400000000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
const TEN_MILLION_ETHER = BN.from("10000000000000000000000000");

const VESTING_START = 1638209176; // Unix timestamp for initial SOLACE add liquidity transaction - https://etherscan.io/tx/0x71f1de15ee75f414c454aec3612433d0123e44ec5987515fc3566795cd840bc3

describe("TokenVesting", function () {
    const [deployer, governor, investor1, investor2, investor3, randomGreedyPerson, receiver] = provider.getWallets();
    let artifacts: ArtifactImports;
  
    before(async function () {
        artifacts = await import_artifacts();
        await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

        // deploy solace contracts
        solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;

        // transfer tokens
        await solace.connect(governor).addMinter(governor.address);
        await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER); // become SOLACE whale
    })

    describe("deployment", function () {
        it("verifies constructor arguments", async function () {
          await expect(deployContract(deployer, artifacts.TokenVesting, [ZERO_ADDRESS, solace.address, VESTING_START])).to.be.revertedWith("zero address governance");
          await expect(deployContract(deployer, artifacts.TokenVesting, [governor.address, ZERO_ADDRESS, VESTING_START])).to.be.revertedWith("zero address solace");
          await expect(deployContract(deployer, artifacts.TokenVesting, [governor.address, solace.address, 0])).to.be.revertedWith("vestingStart cannot be initialized as 0");

        });
        it("deploys successfully", async function () {
          tokenVesting = (await deployContract(deployer, artifacts.TokenVesting, [governor.address, solace.address, VESTING_START])) as TokenVesting;
          await solace.connect(governor).mint(tokenVesting.address, ONE_MILLION_ETHER);
        });
        it("sets correct values for storage variables from constructor", async function () {
          expect(await tokenVesting.solace()).eq(solace.address);
          expect(await tokenVesting.vestingStart()).eq(VESTING_START);

          expect(await tokenVesting.cliff()).eq(VESTING_START + 15768000);
          // Ensure cliff is within May 2022, given vestingStart is in Nov 2021
          expect(await tokenVesting.cliff()).to.be.above(1651363200);
          expect(await tokenVesting.cliff()).to.be.below(1654041600);

          expect(await tokenVesting.vestingEnd()).eq(VESTING_START + 94608000);
          // Test vestingEnd is within Nov 2024, given vestingStart is in Nov 2021
          expect(await tokenVesting.vestingEnd()).to.be.above(1730419200);
          expect(await tokenVesting.vestingEnd()).to.be.below(1733011200);
        });
      });

      describe("governance", function () {
        it("starts with the correct governor", async function () {
          expect(await tokenVesting.governance()).to.equal(governor.address);
        });
        it("rejects setting pending governance by non governor", async function () {
          await expect(tokenVesting.connect(investor1).setPendingGovernance(investor1.address)).to.be.revertedWith("!governance");
        });
        it("can set pending governance", async function () {
          let tx = await tokenVesting.connect(governor).setPendingGovernance(deployer.address);
          expect(tx).to.emit(tokenVesting, "GovernancePending").withArgs(deployer.address);
          expect(await tokenVesting.governance()).to.equal(governor.address);
          expect(await tokenVesting.pendingGovernance()).to.equal(deployer.address);
        });
        it("rejects governance transfer by non governor", async function () {
          await expect(tokenVesting.connect(investor1).acceptGovernance()).to.be.revertedWith("!pending governance");
        });
        it("can transfer governance", async function () {
          let tx = await tokenVesting.connect(deployer).acceptGovernance();
          await expect(tx).to.emit(tokenVesting, "GovernanceTransferred").withArgs(governor.address, deployer.address);
          expect(await tokenVesting.governance()).to.equal(deployer.address);
          expect(await tokenVesting.pendingGovernance()).to.equal(ZERO_ADDRESS);
          await tokenVesting.connect(deployer).setPendingGovernance(governor.address);
          await tokenVesting.connect(governor).acceptGovernance();
        });

        // COMMENTED OUT BELOW - UNIT TEST FOR lockGovernance(), can we run this in an isolated block somewhere? Or is the unit tests in Governable.test.ts enough? Or are we assuming we never want to lock governance for this contract.

        // it("can lock governance", async function () {
        //     let tx = await tokenVesting.connect(governor).lockGovernance();
        //     await expect(tx).to.emit(tokenVesting, "GovernanceTransferred").withArgs(governor.address, "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF");
        //     await expect(tx).to.emit(tokenVesting, "GovernanceLocked").withArgs();
        //     expect(await tokenVesting.governanceIsLocked()).to.be.true;
        //     expect(await tokenVesting.governance()).to.equal("0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF");
        //     expect(await tokenVesting.pendingGovernance()).to.equal("0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF");
        // });
      });
    
      describe("setTotalInvestorTokens", function () {
        it("only Governor can call setTotalInvestorTokens", async function () {
            await expect(tokenVesting.connect(investor1).setTotalInvestorTokens([investor1.address, investor2.address, investor3.address], [ONE_MILLION_ETHER, 0, 0])).to.be.revertedWith("!governance");
            await expect(tokenVesting.connect(deployer).setTotalInvestorTokens([deployer.address], [TEN_MILLION_ETHER])).to.be.revertedWith("!governance");
            await expect(tokenVesting.connect(randomGreedyPerson).setTotalInvestorTokens([randomGreedyPerson.address], [TEN_MILLION_ETHER])).to.be.revertedWith("!governance");
        });
        it("verifies equivalent lengths of 'investors' array and 'SOLACE token amounts' array", async function () {
            await expect(tokenVesting.connect(governor).setTotalInvestorTokens([investor1.address, investor2.address, investor3.address], [ONE_MILLION_ETHER, 0])).to.be.revertedWith("length mismatch");
        });
        it("sets correct total investor token amounts", async function () {            
            let tx = await tokenVesting.connect(governor).setTotalInvestorTokens([investor1.address, investor2.address, investor3.address], [THREE_HUNDRED_THOUSAND_ETHER, THREE_HUNDRED_THOUSAND_ETHER, THREE_HUNDRED_THOUSAND_ETHER])
            expect((await tokenVesting.totalInvestorTokens(investor1.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
            expect((await tokenVesting.totalInvestorTokens(investor2.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
            expect((await tokenVesting.totalInvestorTokens(investor3.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
            expect((await tokenVesting.redeemedInvestorTokens(investor1.address))).to.equal(0);
            expect((await tokenVesting.redeemedInvestorTokens(investor2.address))).to.equal(0);
            expect((await tokenVesting.redeemedInvestorTokens(investor3.address))).to.equal(0);
        });
      })

      describe("t = vestingStart", function () {
        it("getRedeemableUnlockedTokens = 0 for all investors", async function () {
            expect((await tokenVesting.getRedeemableUnlockedTokens(investor1.address))).to.equal(0);
            expect((await tokenVesting.getRedeemableUnlockedTokens(investor2.address))).to.equal(0);
            expect((await tokenVesting.getRedeemableUnlockedTokens(investor3.address))).to.equal(0);
        })
        it("claimTokens will fail for all users", async function () {
            await expect(tokenVesting.connect(deployer).claimTokens()).to.be.revertedWith("You have no tokens to claim");
            await expect(tokenVesting.connect(governor).claimTokens()).to.be.revertedWith("You have no tokens to claim");
            await expect(tokenVesting.connect(randomGreedyPerson).claimTokens()).to.be.revertedWith("You have no tokens to claim");
            await expect(tokenVesting.connect(investor1).claimTokens()).to.be.revertedWith("You cannot claim any tokens at the moment");
            await expect(tokenVesting.connect(investor2).claimTokens()).to.be.revertedWith("You cannot claim any tokens at the moment");
            await expect(tokenVesting.connect(investor3).claimTokens()).to.be.revertedWith("You cannot claim any tokens at the moment");
        })
        it("totalInvestorTokens and redeemedInvestorTokens mappings have values of 0", async function() {
            expect((await tokenVesting.totalInvestorTokens(investor1.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
            expect((await tokenVesting.totalInvestorTokens(investor2.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
            expect((await tokenVesting.totalInvestorTokens(investor3.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
            expect((await tokenVesting.redeemedInvestorTokens(investor1.address))).to.equal(0);
            expect((await tokenVesting.redeemedInvestorTokens(investor2.address))).to.equal(0);
            expect((await tokenVesting.redeemedInvestorTokens(investor3.address))).to.equal(0);
        }) 
      })

      describe("t = just before cliff", function () {
        it("Sets timestamp to 1s before cliff", async function () {
            let cliff_timestamp = ( await tokenVesting.cliff() );
            let desired_timestamp = Number(cliff_timestamp.sub(1))
            await provider.send("evm_mine", [desired_timestamp]);

            const currentBlockNumber = await provider.getBlockNumber();
            const currentBlock = await provider.getBlock(currentBlockNumber);
            const currentTimestamp = currentBlock.timestamp;
            expect(currentTimestamp).to.equal(VESTING_START + 15768000 - 1);
        })
        it("getRedeemableUnlockedTokens = 0 for all investors", async function () {
            expect((await tokenVesting.getRedeemableUnlockedTokens(investor1.address))).to.equal(0);
            expect((await tokenVesting.getRedeemableUnlockedTokens(investor2.address))).to.equal(0);
            expect((await tokenVesting.getRedeemableUnlockedTokens(investor3.address))).to.equal(0);
        })
        it("claimTokens will fail for all users", async function () {
            await expect(tokenVesting.connect(deployer).claimTokens()).to.be.revertedWith("You have no tokens to claim");
            await expect(tokenVesting.connect(governor).claimTokens()).to.be.revertedWith("You have no tokens to claim");
            await expect(tokenVesting.connect(randomGreedyPerson).claimTokens()).to.be.revertedWith("You have no tokens to claim");
            await expect(tokenVesting.connect(investor1).claimTokens()).to.be.revertedWith("You cannot claim any tokens at the moment");
            await expect(tokenVesting.connect(investor2).claimTokens()).to.be.revertedWith("You cannot claim any tokens at the moment");
            await expect(tokenVesting.connect(investor3).claimTokens()).to.be.revertedWith("You cannot claim any tokens at the moment");
        })
        it("totalInvestorTokens and redeemedInvestorTokens mappings have values of 0", async function() {
          expect((await tokenVesting.totalInvestorTokens(investor1.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
          expect((await tokenVesting.totalInvestorTokens(investor2.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
          expect((await tokenVesting.totalInvestorTokens(investor3.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
          expect((await tokenVesting.redeemedInvestorTokens(investor1.address))).to.equal(0);
          expect((await tokenVesting.redeemedInvestorTokens(investor2.address))).to.equal(0);
          expect((await tokenVesting.redeemedInvestorTokens(investor3.address))).to.equal(0);
        }) 
      })

      describe("t = just after cliff", function () {
        it("Sets timestamp to 1 day / 86,400s after cliff", async function () {
            let cliff_timestamp = ( await tokenVesting.cliff() );
            let desired_timestamp = Number(cliff_timestamp.add(86400))
            await provider.send("evm_mine", [desired_timestamp]);

            const currentBlockNumber = await provider.getBlockNumber();
            const currentBlock = await provider.getBlock(currentBlockNumber);
            const currentTimestamp = currentBlock.timestamp;
            expect(currentTimestamp).to.equal(VESTING_START + 15768000 + 86400);
        })
        it("getRedeemableUnlockedTokens > 0 for all investors", async function () {
            expect((await tokenVesting.getRedeemableUnlockedTokens(investor1.address))).to.be.above(0);
            expect((await tokenVesting.getRedeemableUnlockedTokens(investor2.address))).to.be.above(0);
            expect((await tokenVesting.getRedeemableUnlockedTokens(investor3.address))).to.be.above(0);
        })
      //   it("claimTokens will fail for non-investors", async function () {
      //       await expect(tokenVesting.connect(deployer).claimTokens()).to.be.revertedWith("You have no tokens to claim");
      //       await expect(tokenVesting.connect(governor).claimTokens()).to.be.revertedWith("You have no tokens to claim");
      //       await expect(tokenVesting.connect(randomGreedyPerson).claimTokens()).to.be.revertedWith("You have no tokens to claim");
      //   })
      })
})
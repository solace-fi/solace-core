import { waffle} from "hardhat";
const { deployContract, solidity } = waffle;
import { MockProvider } from "ethereum-waffle";
const provider: MockProvider = waffle.provider;
import { BigNumber as BN } from "ethers";
import chai from "chai";
const { expect } = chai;

import { import_artifacts, ArtifactImports } from "../utilities/artifact_importer";
import { Solace, MockErc20Decimals, MockErc20Permit, TokenVesting } from "../../typechain";
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
const ZERO = BN.from("0");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// const ONE_ETHER = BN.from("1000000000000000000");
// const TEN_ETHER = BN.from("10000000000000000000");
// const ONE_THOUSAND_ETHER = BN.from("1000000000000000000000");
const ONE_HUNDRED_THOUSAND_ETHER = BN.from("100000000000000000000000");
const THREE_HUNDRED_THOUSAND_ETHER = BN.from("300000000000000000000000");
const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
const TEN_MILLION_ETHER = BN.from("10000000000000000000000000");

const ONE_MONTH = 2500000;
const THREE_YEARS = 94608000
const VESTING_START = 1638209176 + THREE_YEARS;
// Unix timestamp for initial SOLACE add liquidity transaction - https://etherscan.io/tx/0x71f1de15ee75f414c454aec3612433d0123e44ec5987515fc3566795cd840bc3
// Add three years (arbitrary time) to intended VESTING_START because want to test contract behaviour
// before vestingStart, and cannot shift time backwards in Hardhat environment. So need to shift vestingStart forwards.

describe("TokenVesting", function () {
    const [deployer, governor, investor1, investor2, investor3, randomGreedyPerson, investor1_new_account, SOLACE_rescue_account] = provider.getWallets();
    let artifacts: ArtifactImports;

    before(async function () {
        artifacts = await import_artifacts();
        await deployer.sendTransaction({to:deployer.address}); // for some reason this helps solidity-coverage

        // deploy solace contracts
        solace = (await deployContract(deployer, artifacts.SOLACE, [governor.address])) as Solace;

        // transfer tokens
        await solace.connect(governor).addMinter(governor.address);
        await solace.connect(governor).mint(governor.address, ONE_MILLION_ETHER);
    })

    describe("deployment", function () {
        it("verifies constructor arguments", async function () {
          await expect(deployContract(deployer, artifacts.TokenVesting, [ZERO_ADDRESS, solace.address, VESTING_START])).to.be.revertedWith("zero address governance");
          await expect(deployContract(deployer, artifacts.TokenVesting, [governor.address, ZERO_ADDRESS, VESTING_START])).to.be.revertedWith("zero address solace");
          await expect(deployContract(deployer, artifacts.TokenVesting, [governor.address, solace.address, 0])).to.be.revertedWith("vestingStart must > 0");
        });
        it("deploys successfully", async function () {
          tokenVesting = (await deployContract(deployer, artifacts.TokenVesting, [governor.address, solace.address, VESTING_START])) as TokenVesting;
          await solace.connect(governor).mint(tokenVesting.address, ONE_MILLION_ETHER);
        });
        it("sets correct values for storage variables from constructor", async function () {
          expect(await tokenVesting.solace()).eq(solace.address);
          expect(await tokenVesting.vestingStart()).eq(VESTING_START);
          expect(await tokenVesting.vestingEnd()).eq(VESTING_START + THREE_YEARS);
          expect(await tokenVesting.duration()).eq(THREE_YEARS);
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
          expect((await tokenVesting.claimedInvestorTokens(investor1.address))).to.equal(0);
          expect((await tokenVesting.claimedInvestorTokens(investor2.address))).to.equal(0);
          expect((await tokenVesting.claimedInvestorTokens(investor3.address))).to.equal(0);

          await expect(tx).to.emit(tokenVesting, "TotalInvestorTokensSet").withArgs(investor1.address, THREE_HUNDRED_THOUSAND_ETHER);
          await expect(tx).to.emit(tokenVesting, "TotalInvestorTokensSet").withArgs(investor2.address, THREE_HUNDRED_THOUSAND_ETHER);
          await expect(tx).to.emit(tokenVesting, "TotalInvestorTokensSet").withArgs(investor3.address, THREE_HUNDRED_THOUSAND_ETHER);
      });
    })

    describe("setNewInvestorAddress", function () {
      it("setNewInvestorAddress can only be called by governer", async function() {
        await expect(tokenVesting.connect(deployer).setNewInvestorAddress(investor1.address, deployer.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(investor1).setNewInvestorAddress(investor1.address, investor1_new_account.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(investor2).setNewInvestorAddress(investor1.address, investor2.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(investor3).setNewInvestorAddress(investor1.address, investor3.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(randomGreedyPerson).setNewInvestorAddress(investor1.address, randomGreedyPerson.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(investor1_new_account).setNewInvestorAddress(investor1.address, investor1_new_account.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(SOLACE_rescue_account).setNewInvestorAddress(investor1.address, SOLACE_rescue_account.address)).to.be.revertedWith("!governance");
      })
      it("setNewInvestorAddress will revert when set to pre-existing investor", async function () {
        await expect(tokenVesting.connect(governor).setNewInvestorAddress(investor1.address, investor2.address)).to.be.revertedWith("Cannot set to a pre-existing address");
      })
    })

    // Note that we arbitrarily set vestingStart three years
    // So this test will fail after 29 Nov 2024
    describe("t = before vesting start", function () {
      it("getClaimableTokens = 0 for all investors", async function () {
          expect((await tokenVesting.getClaimableTokens(investor1.address))).to.equal(0);
          expect((await tokenVesting.getClaimableTokens(investor2.address))).to.equal(0);
          expect((await tokenVesting.getClaimableTokens(investor3.address))).to.equal(0);
      })
      it("claimTokens will fail for all users", async function () {
          await expect(tokenVesting.connect(deployer).claimTokens()).to.be.revertedWith("no tokens allocated");
          await expect(tokenVesting.connect(governor).claimTokens()).to.be.revertedWith("no tokens allocated");
          await expect(tokenVesting.connect(randomGreedyPerson).claimTokens()).to.be.revertedWith("no tokens allocated");
          await expect(tokenVesting.connect(investor1).claimTokens()).to.be.revertedWith("no claimable tokens");
          await expect(tokenVesting.connect(investor2).claimTokens()).to.be.revertedWith("no claimable tokens");
          await expect(tokenVesting.connect(investor3).claimTokens()).to.be.revertedWith("no claimable tokens");
      })
      it("totalInvestorTokens mappings have not been altered", async function() {
        expect((await tokenVesting.totalInvestorTokens(investor1.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
        expect((await tokenVesting.totalInvestorTokens(investor2.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
        expect((await tokenVesting.totalInvestorTokens(investor3.address))).to.equal(THREE_HUNDRED_THOUSAND_ETHER);
      })
      it("claimedInvestorTokens mappings have values of 0", async function() {
          expect((await tokenVesting.claimedInvestorTokens(investor1.address))).to.equal(0);
          expect((await tokenVesting.claimedInvestorTokens(investor2.address))).to.equal(0);
          expect((await tokenVesting.claimedInvestorTokens(investor3.address))).to.equal(0);
      })
    })

    describe("t = One day after vestingStart", function () {
      it("Sets timestamp to 1 day / 86,400s after cliff", async function () {
          let vesting_start_timestamp = ( await tokenVesting.vestingStart() );
          let desired_timestamp = Number(vesting_start_timestamp.add(86400))
          await provider.send("evm_mine", [desired_timestamp]);
          expect(await getCurrentTimestamp()).to.equal(VESTING_START + 86400);
      })
      it("getClaimableTokens > 0 for all investors", async function () {
          expect((await tokenVesting.getClaimableTokens(investor1.address))).to.be.above(0);
          expect((await tokenVesting.getClaimableTokens(investor2.address))).to.be.above(0);
          expect((await tokenVesting.getClaimableTokens(investor3.address))).to.be.above(0);
      })
      it("claimTokens will fail for non-investors", async function () {
          await expect(tokenVesting.connect(deployer).claimTokens()).to.be.revertedWith("no tokens allocated");
          await expect(tokenVesting.connect(governor).claimTokens()).to.be.revertedWith("no tokens allocated");
          await expect(tokenVesting.connect(randomGreedyPerson).claimTokens()).to.be.revertedWith("no tokens allocated");
      })
      it("Investors can claim one days worth of tokens", async function () {
          let investor1_claim_tx = await tokenVesting.connect(investor1).claimTokens();
          // Need to re-get timestamp, because the timestamp moves forward after each transaction (from `await provider.send("evm_mine", [desired_timestamp])`)
          let claimedTokenAmount = THREE_HUNDRED_THOUSAND_ETHER.mul(await getCurrentTimestamp() - VESTING_START).div(THREE_YEARS);
          await expect(investor1_claim_tx).to.emit(solace, "Transfer").withArgs(tokenVesting.address, investor1.address, claimedTokenAmount);
          await expect(investor1_claim_tx).to.emit(tokenVesting, "TokensClaimed").withArgs(solace.address, investor1.address, claimedTokenAmount);
          expect((await tokenVesting.claimedInvestorTokens(investor1.address))).to.equal(claimedTokenAmount);
          expect(await solace.balanceOf(investor1.address)).eq(claimedTokenAmount)

          let investor2_claim_tx = await tokenVesting.connect(investor2).claimTokens();
          claimedTokenAmount = THREE_HUNDRED_THOUSAND_ETHER.mul(await getCurrentTimestamp() - VESTING_START).div(THREE_YEARS);
          await expect(investor2_claim_tx).to.emit(solace, "Transfer").withArgs(tokenVesting.address, investor2.address, claimedTokenAmount);
          await expect(investor2_claim_tx).to.emit(tokenVesting, "TokensClaimed").withArgs(solace.address, investor2.address, claimedTokenAmount);
          expect((await tokenVesting.claimedInvestorTokens(investor2.address))).to.equal(claimedTokenAmount);
          expect(await solace.balanceOf(investor2.address)).eq(claimedTokenAmount)

          let investor3_claim_tx = await tokenVesting.connect(investor3).claimTokens();
          claimedTokenAmount = THREE_HUNDRED_THOUSAND_ETHER.mul(await getCurrentTimestamp() - VESTING_START).div(THREE_YEARS);
          await expect(investor3_claim_tx).to.emit(solace, "Transfer").withArgs(tokenVesting.address, investor3.address, claimedTokenAmount);
          await expect(investor3_claim_tx).to.emit(tokenVesting, "TokensClaimed").withArgs(solace.address, investor3.address, claimedTokenAmount);
          expect((await tokenVesting.claimedInvestorTokens(investor3.address))).to.equal(claimedTokenAmount);
          expect(await solace.balanceOf(investor3.address)).eq(claimedTokenAmount)
      })
      it("Sanity check redeemedInvestorTokens - should be <1% of totalInvestorTokens for same addresses", async function () {
        const investor1_claimedTokens = await tokenVesting.claimedInvestorTokens(investor1.address);
        const investor2_claimedTokens = await tokenVesting.claimedInvestorTokens(investor2.address);
        const investor3_claimedTokens = await tokenVesting.claimedInvestorTokens(investor3.address);
        const investor1_totalTokens = await tokenVesting.totalInvestorTokens(investor1.address);
        const investor2_totalTokens = await tokenVesting.totalInvestorTokens(investor2.address);
        const investor3_totalTokens = await tokenVesting.totalInvestorTokens(investor3.address);
        expect(investor1_claimedTokens).to.be.below(investor1_totalTokens.mul(1).div(100));
        expect(investor2_claimedTokens).to.be.below(investor2_totalTokens.mul(1).div(100));
        expect(investor3_claimedTokens).to.be.below(investor3_totalTokens.mul(1).div(100));
      })
      it("Governor switches investor address", async function() {
        const placeholder_investor1_totalInvestorTokens = await tokenVesting.totalInvestorTokens(investor1.address);
        const placeholder_investor1_claimedInvestorTokens = await tokenVesting.claimedInvestorTokens(investor1.address);
        const tx = await tokenVesting.connect(governor).setNewInvestorAddress(investor1.address, investor1_new_account.address);
        await expect(tx).to.emit(tokenVesting, "InvestorAddressChanged").withArgs(investor1.address, investor1_new_account.address);
        await expect(tx).to.emit(tokenVesting, "TotalInvestorTokensSet").withArgs(investor1.address, ZERO);
        await expect(tx).to.emit(tokenVesting, "TotalInvestorTokensSet").withArgs(investor1_new_account.address, placeholder_investor1_totalInvestorTokens);
        expect((await tokenVesting.totalInvestorTokens(investor1.address))).to.equal(0);
        expect((await tokenVesting.claimedInvestorTokens(investor1.address))).to.equal(0);
        expect((await tokenVesting.totalInvestorTokens(investor1_new_account.address))).to.equal(placeholder_investor1_totalInvestorTokens);
        expect((await tokenVesting.claimedInvestorTokens(investor1_new_account.address))).to.equal(placeholder_investor1_claimedInvestorTokens);
      })
    })

    describe("t = One month before vestingEnd", function () {
      it("Sets timestamp to ~1 month / 2,500,000s before vestingEnd", async function () {
        let vestingEnd_timestamp = ( await tokenVesting.vestingEnd() );
        let desired_timestamp = Number(vestingEnd_timestamp.sub(ONE_MONTH))
        await provider.send("evm_mine", [desired_timestamp]);
        expect(await getCurrentTimestamp()).to.equal(VESTING_START + THREE_YEARS - ONE_MONTH);
      })
      it("claimTokens will fail for non-investors", async function () {
        await expect(tokenVesting.connect(deployer).claimTokens()).to.be.revertedWith("no tokens allocated");
        await expect(tokenVesting.connect(governor).claimTokens()).to.be.revertedWith("no tokens allocated");
        await expect(tokenVesting.connect(randomGreedyPerson).claimTokens()).to.be.revertedWith("no tokens allocated");
      })
      it("claimToken will fail for old investor address", async function() {
        await expect(tokenVesting.connect(investor1).claimTokens()).to.be.revertedWith("no tokens allocated");
      })
      it("Investors can claim 29 months worth of tokens", async function () {
        let preClaimedAmount = await tokenVesting.claimedInvestorTokens(investor1_new_account.address);
        let investor1_claim_tx = await tokenVesting.connect(investor1_new_account).claimTokens();
        let totalUnlockedTokenAmount = THREE_HUNDRED_THOUSAND_ETHER.mul(await getCurrentTimestamp() - VESTING_START).div(THREE_YEARS);
        let claimedTokenAmount = totalUnlockedTokenAmount.sub(preClaimedAmount);
        await expect(investor1_claim_tx).to.emit(solace, "Transfer").withArgs(tokenVesting.address, investor1_new_account.address, claimedTokenAmount);
        await expect(investor1_claim_tx).to.emit(tokenVesting, "TokensClaimed").withArgs(solace.address, investor1_new_account.address, claimedTokenAmount);
        expect((await tokenVesting.claimedInvestorTokens(investor1_new_account.address))).to.equal(claimedTokenAmount.add(preClaimedAmount));
        // Investor1 old account has the preclaimed SOLACE amount
        expect(await solace.balanceOf(investor1_new_account.address)).eq(claimedTokenAmount)

        preClaimedAmount = await tokenVesting.claimedInvestorTokens(investor2.address);
        let investor2_claim_tx = await tokenVesting.connect(investor2).claimTokens();
        totalUnlockedTokenAmount = THREE_HUNDRED_THOUSAND_ETHER.mul(await getCurrentTimestamp() - VESTING_START).div(THREE_YEARS);
        claimedTokenAmount = totalUnlockedTokenAmount.sub(preClaimedAmount);
        await expect(investor2_claim_tx).to.emit(solace, "Transfer").withArgs(tokenVesting.address, investor2.address, claimedTokenAmount);
        await expect(investor2_claim_tx).to.emit(tokenVesting, "TokensClaimed").withArgs(solace.address, investor2.address, claimedTokenAmount);
        expect((await tokenVesting.claimedInvestorTokens(investor2.address))).to.equal(claimedTokenAmount.add(preClaimedAmount));
        expect(await solace.balanceOf(investor2.address)).eq(claimedTokenAmount.add(preClaimedAmount))

        preClaimedAmount = await tokenVesting.claimedInvestorTokens(investor3.address);
        let investor3_claim_tx = await tokenVesting.connect(investor3).claimTokens();
        totalUnlockedTokenAmount = THREE_HUNDRED_THOUSAND_ETHER.mul(await getCurrentTimestamp() - VESTING_START).div(THREE_YEARS);
        claimedTokenAmount = totalUnlockedTokenAmount.sub(preClaimedAmount);
        await expect(investor3_claim_tx).to.emit(solace, "Transfer").withArgs(tokenVesting.address, investor3.address, claimedTokenAmount);
        await expect(investor3_claim_tx).to.emit(tokenVesting, "TokensClaimed").withArgs(solace.address, investor3.address, claimedTokenAmount);
        expect((await tokenVesting.claimedInvestorTokens(investor3.address))).to.equal(claimedTokenAmount.add(preClaimedAmount));
        expect(await solace.balanceOf(investor3.address)).eq(claimedTokenAmount.add(preClaimedAmount))
      })
      it("Sanity check redeemedInvestorTokens - should have lower values than totalInvestorTokens for same addresses", async function () {
        const investor1_claimedTokens = await tokenVesting.claimedInvestorTokens(investor1_new_account.address);
        const investor2_claimedTokens = await tokenVesting.claimedInvestorTokens(investor2.address);
        const investor3_claimedTokens = await tokenVesting.claimedInvestorTokens(investor3.address);
        const investor1_totalTokens = await tokenVesting.totalInvestorTokens(investor1_new_account.address);
        const investor2_totalTokens = await tokenVesting.totalInvestorTokens(investor2.address);
        const investor3_totalTokens = await tokenVesting.totalInvestorTokens(investor3.address);
        expect(investor1_claimedTokens).to.be.below(investor1_totalTokens);
        expect(investor2_claimedTokens).to.be.below(investor2_totalTokens);
        expect(investor3_claimedTokens).to.be.below(investor3_totalTokens);
      })
      it("Sanity check redeemedInvestorTokens - should be at least 95% of totalInvestorTokens for same addresses", async function () {
        const investor1_claimedTokens = await tokenVesting.claimedInvestorTokens(investor1_new_account.address);
        const investor2_claimedTokens = await tokenVesting.claimedInvestorTokens(investor2.address);
        const investor3_claimedTokens = await tokenVesting.claimedInvestorTokens(investor3.address);
        const investor1_totalTokens = await tokenVesting.totalInvestorTokens(investor1_new_account.address);
        const investor2_totalTokens = await tokenVesting.totalInvestorTokens(investor2.address);
        const investor3_totalTokens = await tokenVesting.totalInvestorTokens(investor3.address);
        expect(investor1_claimedTokens).to.be.above(investor1_totalTokens.mul(95).div(100));
        expect(investor2_claimedTokens).to.be.above(investor2_totalTokens.mul(95).div(100));
        expect(investor3_claimedTokens).to.be.above(investor3_totalTokens.mul(95).div(100));
      })
    })

    describe("t = 1s after vestingEnd", function () {
      it("Sets timestamp to 1s after vestingEnd", async function () {
        let vestingEnd_timestamp = ( await tokenVesting.vestingEnd() );
        let desired_timestamp = Number(vestingEnd_timestamp.add(1))
        await provider.send("evm_mine", [desired_timestamp]);
        expect(await getCurrentTimestamp()).to.equal(VESTING_START + THREE_YEARS + 1);
      })
      it("claimTokens will fail for non-investors", async function () {
        await expect(tokenVesting.connect(deployer).claimTokens()).to.be.revertedWith("no tokens allocated");
        await expect(tokenVesting.connect(governor).claimTokens()).to.be.revertedWith("no tokens allocated");
        await expect(tokenVesting.connect(randomGreedyPerson).claimTokens()).to.be.revertedWith("no tokens allocated");
      })
      it("claimToken will fail for old investor address", async function() {
        await expect(tokenVesting.connect(investor1).claimTokens()).to.be.revertedWith("no tokens allocated");
      })
      it("Investors can claim all remaining tokens", async function () {
        let preClaimedAmount = await tokenVesting.claimedInvestorTokens(investor1_new_account.address);
        let investor1_claim_tx = await tokenVesting.connect(investor1_new_account).claimTokens();
        let totalUnlockedTokenAmount = await tokenVesting.totalInvestorTokens(investor1_new_account.address)
        let claimedTokenAmount = totalUnlockedTokenAmount.sub(preClaimedAmount);
        await expect(investor1_claim_tx).to.emit(solace, "Transfer").withArgs(tokenVesting.address, investor1_new_account.address, claimedTokenAmount);
        await expect(investor1_claim_tx).to.emit(tokenVesting, "TokensClaimed").withArgs(solace.address, investor1_new_account.address, claimedTokenAmount);
        expect((await tokenVesting.claimedInvestorTokens(investor1_new_account.address))).to.equal(claimedTokenAmount.add(preClaimedAmount));
        // Investor1 old account has the preclaimed SOLACE amount
        const oldInvestor1AddressBalance = await solace.balanceOf(investor1.address)
        expect(await solace.balanceOf(investor1_new_account.address)).eq(claimedTokenAmount.add(preClaimedAmount).sub(oldInvestor1AddressBalance))

        preClaimedAmount = await tokenVesting.claimedInvestorTokens(investor2.address);
        let investor2_claim_tx = await tokenVesting.connect(investor2).claimTokens();
        totalUnlockedTokenAmount = await tokenVesting.totalInvestorTokens(investor2.address)
        claimedTokenAmount = totalUnlockedTokenAmount.sub(preClaimedAmount);
        await expect(investor2_claim_tx).to.emit(solace, "Transfer").withArgs(tokenVesting.address, investor2.address, claimedTokenAmount);
        await expect(investor2_claim_tx).to.emit(tokenVesting, "TokensClaimed").withArgs(solace.address, investor2.address, claimedTokenAmount);
        expect((await tokenVesting.claimedInvestorTokens(investor2.address))).to.equal(claimedTokenAmount.add(preClaimedAmount));
        expect(await solace.balanceOf(investor2.address)).eq(claimedTokenAmount.add(preClaimedAmount))

        preClaimedAmount = await tokenVesting.claimedInvestorTokens(investor3.address);
        let investor3_claim_tx = await tokenVesting.connect(investor3).claimTokens();
        totalUnlockedTokenAmount = await tokenVesting.totalInvestorTokens(investor3.address)
        claimedTokenAmount = totalUnlockedTokenAmount.sub(preClaimedAmount);
        await expect(investor3_claim_tx).to.emit(solace, "Transfer").withArgs(tokenVesting.address, investor3.address, claimedTokenAmount);
        await expect(investor3_claim_tx).to.emit(tokenVesting, "TokensClaimed").withArgs(solace.address, investor3.address, claimedTokenAmount);
        expect((await tokenVesting.claimedInvestorTokens(investor3.address))).to.equal(claimedTokenAmount.add(preClaimedAmount));
        expect(await solace.balanceOf(investor3.address)).eq(claimedTokenAmount.add(preClaimedAmount))
      })
      it("Sanity check redeemedInvestorTokens - should be equivalent to totalInvestorTokens for same addresses", async function () {
        const investor1_claimedTokens = await tokenVesting.claimedInvestorTokens(investor1_new_account.address);
        const investor2_claimedTokens = await tokenVesting.claimedInvestorTokens(investor2.address);
        const investor3_claimedTokens = await tokenVesting.claimedInvestorTokens(investor3.address);
        const investor1_totalTokens = await tokenVesting.totalInvestorTokens(investor1_new_account.address);
        const investor2_totalTokens = await tokenVesting.totalInvestorTokens(investor2.address);
        const investor3_totalTokens = await tokenVesting.totalInvestorTokens(investor3.address);
        expect(investor1_claimedTokens).to.equal(investor1_totalTokens);
        expect(investor2_claimedTokens).to.equal(investor2_totalTokens);
        expect(investor3_claimedTokens).to.equal(investor3_totalTokens);
      })

    })

    describe("rescueSOLACEtokens (after vestingEnd)", function () {
      it("TokenVesting.sol should have 100K SOLACE tokens remaining", async function () {
        const balance = await solace.balanceOf(tokenVesting.address)
        expect(balance).to.equal(ONE_HUNDRED_THOUSAND_ETHER)
      })
      it("Only governance can rescueSOLACEtokens", async function () {
        await expect(tokenVesting.connect(deployer).rescueSOLACEtokens(ONE_HUNDRED_THOUSAND_ETHER, SOLACE_rescue_account.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(investor1_new_account).rescueSOLACEtokens(ONE_HUNDRED_THOUSAND_ETHER, SOLACE_rescue_account.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(investor2).rescueSOLACEtokens(ONE_HUNDRED_THOUSAND_ETHER, SOLACE_rescue_account.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(investor3).rescueSOLACEtokens(ONE_HUNDRED_THOUSAND_ETHER, SOLACE_rescue_account.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(randomGreedyPerson).rescueSOLACEtokens(ONE_HUNDRED_THOUSAND_ETHER, SOLACE_rescue_account.address)).to.be.revertedWith("!governance");
        await expect(tokenVesting.connect(SOLACE_rescue_account).rescueSOLACEtokens(ONE_HUNDRED_THOUSAND_ETHER, SOLACE_rescue_account.address)).to.be.revertedWith("!governance");
      })
      it("Governance can rescue SOLACE tokens to desired SOLACE_rescue_account address", async function () {
        await expect(tokenVesting.connect(governor).rescueSOLACEtokens(ONE_HUNDRED_THOUSAND_ETHER, ZERO_ADDRESS)).to.be.revertedWith("zero address recipient");
        let tx = await tokenVesting.connect(governor).rescueSOLACEtokens(ONE_HUNDRED_THOUSAND_ETHER, SOLACE_rescue_account.address);
        await expect(tx).to.emit(solace, "Transfer").withArgs(tokenVesting.address, SOLACE_rescue_account.address, ONE_HUNDRED_THOUSAND_ETHER);
        await expect(tx).to.emit(tokenVesting, "TokensRescued").withArgs(solace.address, SOLACE_rescue_account.address, ONE_HUNDRED_THOUSAND_ETHER);
      })
    })

    describe("Lock governance", async function() {
      it("non governance cannot call lockGovernance()", async function () {
          await expect(tokenVesting.connect(deployer).lockGovernance()).to.be.revertedWith("!governance");
          await expect(tokenVesting.connect(investor1).lockGovernance()).to.be.revertedWith("!governance");
          await expect(tokenVesting.connect(investor2).lockGovernance()).to.be.revertedWith("!governance");
          await expect(tokenVesting.connect(investor3).lockGovernance()).to.be.revertedWith("!governance");
          await expect(tokenVesting.connect(randomGreedyPerson).lockGovernance()).to.be.revertedWith("!governance");
          await expect(tokenVesting.connect(investor1_new_account).lockGovernance()).to.be.revertedWith("!governance");
          await expect(tokenVesting.connect(SOLACE_rescue_account).lockGovernance()).to.be.revertedWith("!governance");
      })

      it("governance can call lockGovernance()", async function () {
          let tx = await tokenVesting.connect(governor).lockGovernance();
          await expect(tx).to.emit(tokenVesting, "GovernanceTransferred").withArgs(governor.address, "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF");
          await expect(tx).to.emit(tokenVesting, "GovernanceLocked").withArgs();
          expect(await tokenVesting.governanceIsLocked()).to.be.true;
          expect(await tokenVesting.governance()).to.equal("0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF");
          expect(await tokenVesting.pendingGovernance()).to.equal("0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF");
      });

      it("governance can no longer call setNewInvestorAddress", async function() {
          await expect(tokenVesting.connect(governor).setNewInvestorAddress(investor2.address, randomGreedyPerson.address)).to.be.revertedWith("governance locked");
      })
      it("governance can no longer call setTotalInvestorTokens", async function() {
          await expect(tokenVesting.connect(governor).setTotalInvestorTokens([governor.address], [ONE_MILLION_ETHER])).to.be.revertedWith("governance locked");
      })
      it("governance can no longer call rescueSOLACEtokens", async function() {
          await solace.connect(governor).mint(tokenVesting.address, ONE_HUNDRED_THOUSAND_ETHER)
          await expect(tokenVesting.connect(governor).rescueSOLACEtokens(ONE_HUNDRED_THOUSAND_ETHER, governor.address)).to.be.revertedWith("governance locked");
      })
      // Technically should add unit tests here to test claimTokens() still works, but with this test script, claimTokens() will revert with reason "You cannot claim any tokens at the moment"
    })

})

async function getCurrentTimestamp() {
  const currentBlock = await provider.getBlock("latest");
  const currentTimestamp = currentBlock.timestamp;
  return currentTimestamp
}

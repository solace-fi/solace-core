The following is the output of a complete test run, made on commit [`be39029`](https://github.com/solace-fi/solace-core/pull/265/commits/be39029dfb24d70ac067d2cdce60ebcde0f1b718), from April 4, 2022.

## Test Methodology

The output reflects the general best practices for unit test creation:

```
describe("Contract under test")
  describe("Feature")
    context("Configuration for a set of tests - this can be nested as needed, for complex cases")
      it("individual tests within a given configuration (e.g., 'caller is owner', 'caller is not owner', etc.)")
```

It is important that the text description accurately reflects the content of the test, and that *only* the feature describe is tested. Ideally, the concatenation of descriptive texts for any given test forms a clear, understandable narrative.

Some tests rely on network forking to test certain contracts under certain conditions. Tweak these with `FORK_NETWORK` in .env and fork block number in hardhat.config.ts

## Test Commands

```sh
# full suite
npx hardhat test
npx hardhat coverage
# single file
npx hardhat test test/Contract.test.ts
npx hardhat coverage --testfiles test/Contract.test.ts
```

## Test Coverage

```sh
$ npx hardhat coverage

Version
=======
> solidity-coverage: v0.7.18

Instrumenting for coverage...
=============================

> bonds/BondDepository.sol
> bonds/BondTellerErc20.sol
> bonds/BondTellerEth.sol
> bonds/BondTellerMatic.sol
> BridgeWrapper.sol
> Faucet.sol
> interfaces/bonds/IBondDepository.sol
> interfaces/bonds/IBondTellerErc20.sol
> interfaces/bonds/IBondTellerEth.sol
> interfaces/bonds/IBondTellerMatic.sol
> interfaces/IApprovalReceiver.sol
> interfaces/IBridgeWrapper.sol
> interfaces/IERC3156FlashBorrower.sol
> interfaces/IERC3156FlashLender.sol
> interfaces/IFaucet.sol
> interfaces/ISOLACE.sol
> interfaces/ITransferReceiver.sol
> interfaces/IWETH10.sol
> interfaces/IWETH9.sol
> interfaces/IWMATIC.sol
> interfaces/products/IProduct.sol
> interfaces/products/IProductFactory.sol
> interfaces/products/ISolaceCoverProduct.sol
> interfaces/products/ISolaceCoverProductV2.sol
> interfaces/risk/ICoverageDataProvider.sol
> interfaces/risk/IPolicyManager.sol
> interfaces/risk/IRiskManager.sol
> interfaces/risk/IRiskStrategy.sol
> interfaces/risk/IRiskStrategyFactory.sol
> interfaces/staking/IFarmRewards.sol
> interfaces/staking/IFarmRewardsV2.sol
> interfaces/staking/IStakingRewards.sol
> interfaces/staking/IxsListener.sol
> interfaces/staking/IxsLocker.sol
> interfaces/staking/IxSOLACE.sol
> interfaces/staking/IxSolaceMigrator.sol
> interfaces/staking/IxSOLACEV1.sol
> interfaces/utils/ICloneable.sol
> interfaces/utils/IDeployer.sol
> interfaces/utils/IERC1271.sol
> interfaces/utils/IERC721Enhanced.sol
> interfaces/utils/IERC721EnhancedInitializable.sol
> interfaces/utils/IGovernable.sol
> interfaces/utils/IPolicyDescriptorV2.sol
> interfaces/utils/IRegistry.sol
> interfaces/utils/ISingletonFactory.sol
> mocks/BlockGetter.sol
> mocks/GasGriefer.sol
> mocks/MockCloneable.sol
> mocks/MockERC1271.sol
> mocks/MockERC20.sol
> mocks/MockERC20Decimals.sol
> mocks/MockERC20Permit.sol
> mocks/MockERC677Receiver.sol
> mocks/MockERC721.sol
> mocks/MockERC721Initializable.sol
> mocks/MockFaultyReceiver.sol
> mocks/MockGovernableInitializable.sol
> mocks/MockListener.sol
> mocks/MockPriceOracle.sol
> mocks/MockProductV2.sol
> mocks/MockRiskStrategy.sol
> mocks/MockSLP.sol
> products/ProductFactory.sol
> products/SolaceCoverProduct.sol
> products/SolaceCoverProductV2.sol
> products/SolaceMarketProduct.sol
> risk/CoverageDataProvider.sol
> risk/PolicyManager.sol
> risk/RiskManager.sol
> risk/RiskStrategy.sol
> risk/RiskStrategyFactory.sol
> SOLACE.sol
> staking/FarmRewards.sol
> staking/FarmRewardsV2.sol
> staking/StakingRewards.sol
> staking/xsLocker.sol
> staking/xSOLACE.sol
> staking/xSolaceMigrator.sol
> staking/xSOLACEV1.sol
> utils/Cloneable.sol
> utils/Deployer.sol
> utils/ERC721Enhanced.sol
> utils/ERC721EnhancedInitializable.sol
> utils/Factory.sol
> utils/Governable.sol
> utils/GovernableInitializable.sol
> utils/PolicyDescriptorV2.sol
> utils/Registry.sol
> WETH10.sol
> WETH9.sol
> WMATIC.sol

Compilation:
============

Nothing to compile
Creating Typechain artifacts in directory typechain for target ethers-v5
Successfully generated Typechain artifacts!

Network Info
============
> HardhatEVM: v2.6.2
> network:    hardhat

Creating Typechain artifacts in directory typechain for target ethers-v5
Successfully generated Typechain artifacts!


  BondDepository
    deployment
      ✓ reverts if zero governor (1561ms)
      ✓ reverts if zero solace (2594ms)
      ✓ deploys (1591ms)
      ✓ starts with correct solace
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance (99ms)
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (384ms)
    tellers
      ✓ non governance cannot add tellers
      ✓ governance can add tellers (176ms)
      ✓ non governance cannot remove tellers
      ✓ governance can remove tellers (229ms)
      ✓ non tellers cannot pull solace (60ms)
      ✓ tellers should not mint directly via solace
      ✓ will fail if depo is not minter (54ms)
      ✓ tellers can pull solace (344ms)

  BondTellerERC20
    before initialization
      ✓ can deploy implementation (220ms)
      ✓ starts with no name, symbol, or supply
      ✓ reverts if zero governor
      ✓ reverts if zero solace
      ✓ reverts if zero xslocker (42ms)
      ✓ reverts if zero pool (41ms)
      ✓ reverts if zero dao (38ms)
      ✓ reverts if zero principal (43ms)
      ✓ reverts if zero bond depo (50ms)
    initialization
      ✓ inits (664ms)
      ✓ inits with a name and symbol
      ✓ starts with correct solace
      ✓ starts with correct xslocker
      ✓ starts with correct pool
      ✓ starts with correct dao
      ✓ starts with correct principal
      ✓ starts with correct bond depo
    clone
      ✓ can deploy proxy (3394ms)
      ✓ inits with a name and symbol
      ✓ starts with correct solace
      ✓ starts with correct xslocker
      ✓ starts with correct pool
      ✓ starts with correct dao
      ✓ starts with correct principal
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance (51ms)
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (417ms)
    pause/unpause
      ✓ non governance cannot pause/unpause (38ms)
      ✓ governance can pause and unpause (392ms)
      ✓ cannot deposit while paused (164ms)
      ✓ cannot depositSigned while paused (3731ms)
    before setTerms() called
      ✓ terms begin unset (96ms)
      ✓ other global variables also begin unset
      ✓ non-governance cannot call setTerms() (47ms)
      ✓ cannot deposit() or depositSigned() (95ms)
    ERC20 guards
      ✓ cannot deposit or depositSigned with insufficient balance (395ms)
      ✓ cannot deposit without allowance (251ms)
      ✓ cannot permit a non erc20permit token
      ✓ cannot permit a non erc20permit token even if wrongly initialized (2636ms)
    term parameter guards
      ✓ cannot deposit or depositSigned with a zero address depositor
      ✓ cannot deposit or depositSigned before startTime (169ms)
      ✓ cannot deposit or depositSigned after endTime (170ms)
      ✓ cannot deposit or depositSigned if bondPrice decayed to 0 (493ms)
      ✓ Given capacityIsPayout = false, deposit or depositSigned will revert if `principal paid > capacity` (248ms)
      ✓ Given capacityIsPayout = true, deposit or depositSigned will revert if `payout > capacity` (268ms)
      ✓ calculateAmountIn, calculateAmountOut, deposit and depositSigned will respect maxPayout (204ms)
      ✓ slippage protection - deposit() and depositSigned() respect minAmountOut (284ms)
      ✓ cannot deposit if bondDepo is not solace minter (127ms)
      ✓ cannot deposit if teller not registered (116ms)
    deposit cases
      ✓ test deposit 1 - deposit 3 DAI, starting SOLACE price of 2 DAI (1279ms)
      ✓ test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 DAI, starting SOLACE price of 2 DAI (1459ms)
      ✓ test deposit 3 - deposit 3 DAI, set startPrice = 1 but minimumPrice = 2 (1148ms)
    claimPayout after deposit cases
      ✓ cannot claimPayout for a non-existent bondID
      ✓ cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer
      ✓ approves depositor2 to claimPayout on Bond 2 (which was minted by depositor) (41ms)
      ✓ t = 0, expect claimPayout will work but there will be miniscule payout (883ms)
      ✓ t = 0, expect withdraw lock to revert
      ✓ t = halfway through vesting, expect half of tokens to be claimable (908ms)
      ✓ t = halfway through vesting, expect withdraw lock to revert
      ✓ t = after vesting complete, expect all tokens claimed & bonds burned (1256ms)
      ✓ t = after vesting complete, expect withdraw lock to succeed (525ms)
      ✓ claimPayout fails after BondBurned event (44ms)
    depositSigned cases
      ✓ test deposit 1 - deposit 3 USDC, starting SOLACE price of 2 USDC (359ms)
      ✓ test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 USDC, starting SOLACE price of 2 USDC (298ms)
      ✓ test deposit 3 - deposit 3 USDC, set startPrice = 1 but minimumPrice = 2 (274ms)
    claimPayout after depositSigned cases
      ✓ cannot claimPayout for a non-existent bondID
      ✓ cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer
      ✓ approves depositor2 to claimPayout on Bond 2 (which was minted by depositor)
      ✓ t = 0, expect claimPayout will work but there will be miniscule payout (318ms)
      ✓ t = 0, expect withdraw lock to revert
      ✓ t = halfway through vesting, expect half of tokens to be claimable (310ms)
      ✓ t = halfway through vesting, expect withdraw lock to revert
      ✓ t = after vesting complete, expect all tokens claimed & bonds burned (344ms)
      ✓ t = after vesting complete, expect withdraw lock to succeed (613ms)
      ✓ claimPayout fails after BondBurned event (63ms)
    set terms
      ✓ terms start unset (97ms)
      ✓ non governance cannot set terms
      ✓ validates inputs (182ms)
      ✓ can set terms (247ms)
    set fees
      ✓ fees start unset
      ✓ non governance cannot set fees
      ✓ validates inputs (40ms)
      ✓ can set fees (45ms)
      ✓ can set to zero (66ms)
    set addresses
      ✓ non governance cannot set addresses
      ✓ validates input (168ms)
      ✓ governance can set addresses (154ms)
      ✓ uses new addresses (2093ms)

  BondTellerETH
    before initialization
      ✓ can deploy implementation (4242ms)
      ✓ starts with no name, symbol, or supply
      ✓ reverts if zero governor
      ✓ reverts if zero solace (56ms)
      ✓ reverts if zero xslocker (90ms)
      ✓ reverts if zero pool (65ms)
      ✓ reverts if zero dao (57ms)
      ✓ reverts if zero principal (63ms)
      ✓ reverts if zero bond depo (41ms)
    initialization
      ✓ inits (1225ms)
      ✓ inits with a name and symbol
      ✓ starts with correct solace
      ✓ starts with correct xslocker
      ✓ starts with correct pool
      ✓ starts with correct dao
      ✓ starts with correct principal
      ✓ starts with correct bond depo
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance (44ms)
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (277ms)
    pause/unpause
      ✓ non governance cannot pause/unpause
      ✓ governance can pause and unpause (347ms)
      ✓ cannot deposit while paused (140ms)
      ✓ cannot depositSigned while paused (161ms)
    before setTerms() called
      ✓ terms begin unset (101ms)
      ✓ other global variables also begin unset
      ✓ non-governance cannot call setTerms()
      ✓ cannot deposit() or depositSigned() (82ms)
    ERC20 guards
      ✓ cannot deposit or depositSigned with insufficient balance (470ms)
      ✓ cannot deposit without allowance (163ms)
      ✓ cannot permit a non erc20permit token
    term parameter guards
      ✓ cannot deposit or depositSigned with a zero address depositor
      ✓ cannot deposit or depositSigned before startTime (218ms)
      ✓ cannot deposit or depositSigned after endTime (221ms)
      ✓ cannot deposit or depositSigned if bondPrice decayed to 0 (693ms)
      ✓ Given capacityIsPayout = false, deposit or depositSigned will revert if `principal paid > capacity` (302ms)
      ✓ Given capacityIsPayout = true, deposit or depositSigned will revert if `payout > capacity` (311ms)
      ✓ calculateAmountIn, calculateAmountOut, deposit and depositSigned will respect maxPayout (255ms)
      ✓ slippage protection - deposit() and depositSigned() respect minAmountOut (329ms)
      ✓ cannot deposit if bondDepo is not solace minter (129ms)
      ✓ cannot deposit if teller not registered (99ms)
    depositEth cases
      ✓ test deposit 1 - deposit 3 ETH, starting SOLACE price of 2 ETH (1146ms)
      ✓ test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 ETH, starting SOLACE price of 2 ETH (1137ms)
      ✓ test deposit 3 - deposit 3 ETH, set startPrice = 1 but minimumPrice = 2 (993ms)
    claimPayout after depositEth cases
      ✓ cannot claimPayout for a non-existent bondID
      ✓ cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer
      ✓ approves depositor2 to claimPayout on Bond 2 (which was minted by depositor)
      ✓ t = 0, expect claimPayout will work but there will be miniscule payout (830ms)
      ✓ t = 0, expect withdraw lock to revert
      ✓ t = halfway through vesting, expect half of tokens to be claimable (1009ms)
      ✓ t = halfway through vesting, expect withdraw lock to revert
      ✓ t = after vesting complete, expect all tokens claimed & bonds burned (1284ms)
      ✓ t = after vesting complete, expect withdraw lock to succeed (482ms)
      ✓ claimPayout fails after BondBurned event (41ms)
    depositWeth cases
      ✓ test deposit 1 - deposit 3 WETH9, starting SOLACE price of 2 WETH9 (1096ms)
      ✓ test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 WETH9, starting SOLACE price of 2 WETH9 (1294ms)
      ✓ test deposit 3 - deposit 3 WETH9, set startPrice = 1 but minimumPrice = 2 (1175ms)
    claimPayout after depositWeth cases
      ✓ cannot claimPayout for a non-existent bondID
      ✓ cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer
      ✓ approves depositor2 to claimPayout on Bond 2 (which was minted by depositor)
      ✓ t = 0, expect claimPayout will work but there will be miniscule payout (844ms)
      ✓ t = 0, expect withdraw lock to revert
      ✓ t = halfway through vesting, expect half of tokens to be claimable (956ms)
      ✓ t = halfway through vesting, expect withdraw lock to revert
      ✓ t = after vesting complete, expect all tokens claimed & bonds burned (1275ms)
      ✓ t = after vesting complete, expect withdraw lock to succeed (558ms)
      ✓ claimPayout fails after BondBurned event (52ms)
    depositWethSigned cases
      ✓ test deposit 1 - deposit 3 WETH10, starting SOLACE price of 2 WETH10 (1404ms)
      ✓ test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 WETH10, starting SOLACE price of 2 WETH10 (1685ms)
      ✓ test deposit 3 - deposit 3 WETH10, set startPrice = 1 but minimumPrice = 2 (1453ms)
    claimPayout after depositWethSigned cases
      ✓ cannot claimPayout for a non-existent bondID
      ✓ cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer
      ✓ approves depositor2 to claimPayout on Bond 2 (which was minted by depositor)
      ✓ t = 0, expect claimPayout will work but there will be miniscule payout (818ms)
      ✓ t = 0, expect withdraw lock to revert
      ✓ t = halfway through vesting, expect half of tokens to be claimable (910ms)
      ✓ t = halfway through vesting, expect withdraw lock to revert
      ✓ t = after vesting complete, expect all tokens claimed & bonds burned (1401ms)
      ✓ t = after vesting complete, expect withdraw lock to succeed (502ms)
      ✓ claimPayout fails after BondBurned event (38ms)
    deposit via receive() cases
      ✓ test deposit (925ms)
    deposit via fallback() cases
      ✓ test deposit (961ms)
    set terms
      ✓ terms start unset (84ms)
      ✓ non governance cannot set terms
      ✓ validates inputs (121ms)
      ✓ can set terms (169ms)
    set fees
      ✓ fees start unset
      ✓ non governance cannot set fees
      ✓ validates inputs
      ✓ can set fees (42ms)
      ✓ can set to zero (107ms)
    set addresses
      ✓ non governance cannot set addresses
      ✓ validates input (96ms)
      ✓ governance can set addresses (151ms)
      ✓ uses new addresses (2722ms)

  BondTellerMATIC
    before initialization
      ✓ can deploy implementation (436ms)
      ✓ starts with no name, symbol, or supply
      ✓ reverts if zero governor
      ✓ reverts if zero solace
      ✓ reverts if zero xslocker (39ms)
      ✓ reverts if zero pool
      ✓ reverts if zero dao (58ms)
      ✓ reverts if zero principal (55ms)
      ✓ reverts if zero bond depo (47ms)
    initialization
      ✓ inits (1207ms)
      ✓ inits with a name and symbol
      ✓ starts with correct solace
      ✓ starts with correct xslocker
      ✓ starts with correct pool
      ✓ starts with correct dao
      ✓ starts with correct principal
      ✓ starts with correct bond depo
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance (50ms)
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (276ms)
    pause/unpause
      ✓ non governance cannot pause/unpause
      ✓ governance can pause and unpause (393ms)
      ✓ cannot deposit while paused (183ms)
      ✓ cannot depositSigned while paused (191ms)
    before setTerms() called
      ✓ terms begin unset (81ms)
      ✓ other global variables also begin unset
      ✓ non-governance cannot call setTerms()
      ✓ cannot deposit() or depositSigned() (75ms)
    ERC20 guards
      ✓ cannot deposit or depositSigned with insufficient balance (367ms)
      ✓ cannot deposit without allowance (173ms)
      ✓ cannot permit a non erc20permit token
    term parameter guards
      ✓ cannot deposit or depositSigned with a zero address depositor
      ✓ cannot deposit or depositSigned before startTime (217ms)
      ✓ cannot deposit or depositSigned after endTime (220ms)
      ✓ cannot deposit or depositSigned if bondPrice decayed to 0 (756ms)
      ✓ Given capacityIsPayout = false, deposit or depositSigned will revert if `principal paid > capacity` (304ms)
      ✓ Given capacityIsPayout = true, deposit or depositSigned will revert if `payout > capacity` (299ms)
      ✓ calculateAmountIn, calculateAmountOut, deposit and depositSigned will respect maxPayout (301ms)
      ✓ slippage protection - deposit() and depositSigned() respect minAmountOut (417ms)
      ✓ cannot deposit if bondDepo is not solace minter (218ms)
      ✓ cannot deposit if teller not registered (214ms)
    depositMatic cases
      ✓ test deposit 1 - deposit 3 MATIC, starting SOLACE price of 2 MATIC (2028ms)
      ✓ test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 MATIC, starting SOLACE price of 2 MATIC (3192ms)
      ✓ test deposit 3 - deposit 3 MATIC, set startPrice = 1 but minimumPrice = 2 (2151ms)
    claimPayout after depositMatic cases
      ✓ cannot claimPayout for a non-existent bondID (44ms)
      ✓ cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer (45ms)
      ✓ approves depositor2 to claimPayout on Bond 2 (which was minted by depositor) (86ms)
      ✓ t = 0, expect claimPayout will work but there will be miniscule payout (1860ms)
      ✓ t = 0, expect withdraw lock to revert
      ✓ t = halfway through vesting, expect half of tokens to be claimable (1298ms)
      ✓ t = halfway through vesting, expect withdraw lock to revert
      ✓ t = after vesting complete, expect all tokens claimed & bonds burned (1395ms)
      ✓ t = after vesting complete, expect withdraw lock to succeed (686ms)
      ✓ claimPayout fails after BondBurned event (58ms)
    depositWmatic cases
      ✓ test deposit 1 - deposit 3 WMATIC9, starting SOLACE price of 2 WMATIC9 (1334ms)
      ✓ test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 WMATIC9, starting SOLACE price of 2 WMATIC9 (1782ms)
      ✓ test deposit 3 - deposit 3 WMATIC9, set startPrice = 1 but minimumPrice = 2 (1363ms)
    claimPayout after depositWmatic cases
      ✓ cannot claimPayout for a non-existent bondID
      ✓ cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer
      ✓ approves depositor2 to claimPayout on Bond 2 (which was minted by depositor) (46ms)
      ✓ t = 0, expect claimPayout will work but there will be miniscule payout (1014ms)
      ✓ t = 0, expect withdraw lock to revert
      ✓ t = halfway through vesting, expect half of tokens to be claimable (895ms)
      ✓ t = halfway through vesting, expect withdraw lock to revert
      ✓ t = after vesting complete, expect all tokens claimed & bonds burned (1419ms)
      ✓ t = after vesting complete, expect withdraw lock to succeed (663ms)
      ✓ claimPayout fails after BondBurned event (61ms)
    depositWmaticSigned cases
      ✓ test deposit 1 - deposit 3 WMATIC10, starting SOLACE price of 2 WMATIC10 (1293ms)
      ✓ test deposit 2 - capacityIsPayout = true && stake = true, deposit 3 WMATIC10, starting SOLACE price of 2 WMATIC10 (1622ms)
      ✓ test deposit 3 - deposit 3 WMATIC10, set startPrice = 1 but minimumPrice = 2 (1438ms)
    claimPayout after depositWmaticSigned cases
      ✓ cannot claimPayout for a non-existent bondID
      ✓ cannot claimPayout for a bondID that you are not that owner of, or are approved to transfer
      ✓ approves depositor2 to claimPayout on Bond 2 (which was minted by depositor)
      ✓ t = 0, expect claimPayout will work but there will be miniscule payout (801ms)
      ✓ t = 0, expect withdraw lock to revert
      ✓ t = halfway through vesting, expect half of tokens to be claimable (905ms)
      ✓ t = halfway through vesting, expect withdraw lock to revert
      ✓ t = after vesting complete, expect all tokens claimed & bonds burned (1333ms)
      ✓ t = after vesting complete, expect withdraw lock to succeed (498ms)
      ✓ claimPayout fails after BondBurned event (46ms)
    deposit via receive() cases
      ✓ test deposit (985ms)
    deposit via fallback() cases
      ✓ test deposit (955ms)
    set terms
      ✓ terms start unset (101ms)
      ✓ non governance cannot set terms
      ✓ validates inputs (127ms)
      ✓ can set terms (167ms)
    set fees
      ✓ fees start unset
      ✓ non governance cannot set fees
      ✓ validates inputs
      ✓ can set fees (43ms)
      ✓ can set to zero (98ms)
    set addresses
      ✓ non governance cannot set addresses
      ✓ validates input (92ms)
      ✓ governance can set addresses (131ms)
      ✓ uses new addresses (1240ms)

  BridgeWrapper
    deployment
      ✓ reverts if zero solace (41ms)
      ✓ reverts if zero bsolace
      ✓ deploys
      ✓ initializes properly
    unwrap
      ✓ cannot unwrap if not solace minter (40ms)
      ✓ can unwrap zero (112ms)
      ✓ cannot unwrap with insufficient bsolace balance (88ms)
      ✓ cannot unwrap with insufficient bsolace approval
      ✓ can unwrap (246ms)
    wrap
      ✓ can wrap zero (132ms)
      ✓ cannot wrap with insufficient solace balance (95ms)
      ✓ cannot wrap with insufficient solace approval
      ✓ cannot wrap with insufficient bridge liquidity (70ms)
      ✓ can unwrap (328ms)
    wrap signed
      ✓ can wrap zero (491ms)
      ✓ cannot wrap with insufficient solace balance (38ms)
      ✓ cannot wrap with invalid permit
      ✓ cannot wrap with insufficient bridge liquidity
      ✓ can unwrap (435ms)

  Faucet
    deployment
      ✓ reverts zero address solace
      ✓ deploys successfully
    drip
      ✓ has correct solace
      ✓ cant mint without permissions
      ✓ can mint (118ms)
      ✓ cant mint again soon
      ✓ can mint again later (83ms)

  SolaceCoverProduct
    deployment
      ✓ reverts for zero address registry (244ms)
      ✓ reverts for zero address riskmanager (216ms)
      ✓ reverts for zero address governance (1922ms)
      ✓ reverts for zero address dai (1616ms)
      ✓ can deploy (1638ms)
      ✓ default values for maxRateNum, maxRateDenom, chargeCycle, cooldownPeriod, referralReward and isReferralOn should be set by constructor (39ms)
      ✓ completes DAI setup (7896ms)
      ✓ manipulatePremiumPaidOf helper function working
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance (53ms)
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (299ms)
    pause
      ✓ starts unpaused
      ✓ cannot be paused by non governance
      ✓ can be paused (42ms)
      ✓ cannot be unpaused by non governance
      ✓ can be unpaused (40ms)
    registry
      ✓ starts with correct registry
      ✓ starts with correct riskmanager
      ✓ cannot be set by non governance
      ✓ reverts for zero address registry
      ✓ reverts for zero address riskmanager
      ✓ reverts for zero address dai (82ms)
      ✓ governance can set registry (159ms)
    setMaxRateNum & setMaxRateDenom
      ✓ cannot be set by non governance (50ms)
      ✓ can be set (73ms)
      ✓ getter functions working
    setChargeCycle
      ✓ cannot be set by non governance
      ✓ can be set (47ms)
      ✓ getter functions working
    setCoverPromotionAdmin
      ✓ cannot be set by non governance
      ✓ reverts on zero address
      ✓ can be set (73ms)
      ✓ getter functions working
    setRewardPoints
      ✓ cannot be set by non cover promotion admin
      ✓ can be set (57ms)
      ✓ getter functions working
    setCooldownPeriod
      ✓ cannot be set by non governance
      ✓ can be set (40ms)
      ✓ getter functions working
    setPremiumPool
      ✓ cannot be set by non governance
      ✓ reverts on zero address
      ✓ can be set (59ms)
      ✓ getter functions working
    setPremiumCollector
      ✓ cannot be set by non governance
      ✓ reverts on zero address
      ✓ can be set (41ms)
      ✓ getter functions working
    setReferralReward
      ✓ cannot be set by non governance
      ✓ can be set
      ✓ getter functions working
    setReferralThreshold
      ✓ cannot be set by non governance
      ✓ can be set (49ms)
      ✓ getter functions working
    setIsReferralOn
      ✓ should default as true
      ✓ cannot be set by non governance
      ✓ can be set (107ms)
      ✓ getter functions working
    setBaseURI
      ✓ should default as expected string
      ✓ cannot be set by non governance
      ✓ can be set (145ms)
    isReferralCodeValid
      ✓ should return false for invalid referral code
      ✓ should return true for valid referral code
    getReferrerFromReferralCode
      ✓ should return 0 for invalid referral code
      ✓ should return referrer address for valid referral code
    activatePolicy
      ✓ cannot activate policy when zero address policy holder is provided
      ✓ cannot buy policy when zero cover amount value is provided
      ✓ cannot buy policy when contract is paused (82ms)
      ✓ cannot purchase a policy before Coverage Data Provider and Risk Manager are set up (maxCover = 0) (89ms)
      ✓ can setup Coverage Data Provider and Risk Manager (269ms)
      ✓ cannot buy policy when max cover exceeded (79ms)
      ✓ cannot buy policy when insufficient user balance for deposit (74ms)
      ✓ cannot buy policy when insufficient deposit provided (71ms)
      ✓ can activate policy - 10000 DAI cover with 1000 DAI deposit (4123ms)
      ✓ cannot purchase more than one policy for a single address (53ms)
      ✓ cannot transfer policy (64ms)
      ✓ can activate policy for another address - 10000 DAI cover with 1000 DAI deposit (1669ms)
      ✓ policy holder should have policy nft after buying coverage
      ✓ should update risk manager active cover amount
      ✓ should update risk manager mcr (40ms)
      ✓ will exit cooldown when activate policy called (1828ms)
      ✓ will not give reward points if isReferralOn == false (1976ms)
      ✓ cannot use own referral code (169ms)
      ✓ cannot use an invalid referral code (88ms)
      ✓ can use referral code only once (2342ms)
    tokenURI
      ✓ cannot get for invalid policy ID
      ✓ can get for valid policy ID
    deposit
      ✓ cannot deposit for zero address policyholder
      ✓ can deposit (328ms)
      ✓ can deposit on behalf of policy holder (330ms)
      ✓ cannot deposit while paused (81ms)
    updateCoverLimit
      ✓ cannot update for zero cover amount
      ✓ cannot update for invalid policy
      ✓ cannot update while paused (95ms)
      ✓ cannot update if max cover is exceeded (56ms)
      ✓ cannot update if max cover for the strategy is exceeded (49ms)
      ✓ cannot update if below minimum required account balance for newCoverLimit (150ms)
      ✓ policy owner can update policy (911ms)
      ✓ policy owner can reduce cover limit (1270ms)
      ✓ should update risk manager active cover limit
      ✓ should update risk manager mcr
      ✓ will exit cooldown when cover limit updated (1194ms)
      ✓ cannot use invalid referral code
      ✓ cannot use own referral code
      ✓ cannot use referral code of an inactive policy holder (44ms)
      ✓ will not give reward points if isReferralOn == false (932ms)
      ✓ can use referral code only once (9116ms)
    deactivatePolicy
      ✓ cannot deactivate an invalid policy
      ✓ policy owner can deactivate policy (697ms)
    withdraw
      ✓ minRequiredAccountBalance view function working
      ✓ cannot withdraw while paused (86ms)
      ✓ cannot withdraw with no account balance
      ✓ when cooldown not started, will withdraw such that remaining balance = minRequiredAccountBalance (3818ms)
      ✓ before cooldown complete, will withdraw such that remaining balance = minRequiredAccountBalance (602ms)
      ✓ after cooldown complete, can withdraw entire account balance (546ms)
    chargePremiums
      ✓ cannot charge premiums by non premium collector (58ms)
      ✓ cannot charge premiums if argument lengths are mismatched (91ms)
      ✓ cannot charge premiums if policy count is exceeded (78ms)
      ✓ can charge premiums (2067ms)
      ✓ will only charge minRequiredAccountBalance, if premium > minRequiredAccountBalance (423ms)
      ✓ can partially charge premiums if the fund is insufficient (9591ms)
      ✓ will be able to charge premiums for accounts that have been deactivated in the last epoch (3775ms)
      ✓ will correctly charge premiums with reward points (3844ms)
      ✓ will charge for 100 users in one call (181431ms)

  SolaceCoverProductV2
    deployment
      ✓ reverts for zero address registry (279ms)
      ✓ reverts for zero address riskmanager (1385ms)
      ✓ reverts for zero address governance (297ms)
      ✓ reverts for zero address frax (264ms)
      ✓ can deploy (233ms)
      ✓ default values for maxRateNum, maxRateDenom, chargeCycle, cooldownPeriod, referralReward and isReferralOn should be set by constructor
      ✓ completes FRAX setup (7652ms)
      ✓ manipulatePremiumPaidOf helper function working
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance (56ms)
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (336ms)
    supported chains
      ✓ starts with no supported chains (42ms)
      ✓ non governance cannot add chains
      ✓ governance can add chains (162ms)
      ✓ non governance cannot remove chains
      ✓ governance can remove chains (239ms)
    asset
      ✓ starts as frax
      ✓ cannot be set by non governor
      ✓ can be set by governor (173ms)
    pause
      ✓ starts unpaused
      ✓ cannot be paused by non governance (79ms)
      ✓ can be paused (95ms)
      ✓ cannot be unpaused by non governance
      ✓ can be unpaused (64ms)
    registry
      ✓ starts with correct registry
      ✓ starts with correct riskmanager
      ✓ cannot be set by non governance
      ✓ reverts for zero address registry
      ✓ reverts for zero address riskmanager
      ✓ reverts for zero address frax (83ms)
      ✓ governance can set registry (192ms)
    setMaxRateNum & setMaxRateDenom
      ✓ cannot be set by non governance
      ✓ can be set (52ms)
      ✓ getter functions working
    setChargeCycle
      ✓ cannot be set by non governance
      ✓ can be set (43ms)
      ✓ getter functions working
    setCoverPromotionAdmin
      ✓ cannot be set by non governance
      ✓ reverts on zero address
      ✓ can be set (59ms)
      ✓ getter functions working
    setRewardPoints
      ✓ cannot be set by non cover promotion admin (45ms)
      ✓ can be set (65ms)
      ✓ getter functions working
    setCooldownPeriod
      ✓ cannot be set by non governance
      ✓ can be set (51ms)
      ✓ getter functions working
    setPremiumPool
      ✓ cannot be set by non governance
      ✓ reverts on zero address
      ✓ can be set (63ms)
      ✓ getter functions working
    setPremiumCollector
      ✓ cannot be set by non governance
      ✓ reverts on zero address
      ✓ can be set (58ms)
      ✓ getter functions working
    setReferralReward
      ✓ cannot be set by non governance
      ✓ can be set (42ms)
      ✓ getter functions working
    setReferralThreshold
      ✓ cannot be set by non governance
      ✓ can be set
      ✓ getter functions working
    setIsReferralOn
      ✓ should default as true
      ✓ cannot be set by non governance
      ✓ can be set (101ms)
      ✓ getter functions working
    setBaseURI
      ✓ should default as expected string
      ✓ cannot be set by non governance
      ✓ can be set (179ms)
    isReferralCodeValid
      ✓ should return false for invalid referral code
      ✓ should return true for valid referral code
    getReferrerFromReferralCode
      ✓ should return 0 for invalid referral code
      ✓ should return referrer address for valid referral code
    activatePolicy
      ✓ cannot activate policy when zero address policy holder is provided
      ✓ cannot buy policy when zero cover amount value is provided
      ✓ cannot buy policy when contract is paused (81ms)
      ✓ cannot purchase a policy before Coverage Data Provider and Risk Manager are set up (maxCover = 0) (127ms)
      ✓ can setup Coverage Data Provider and Risk Manager (266ms)
      ✓ cannot buy policy when max cover exceeded (80ms)
      ✓ cannot buy policy when insufficient user balance for deposit (96ms)
      ✓ cannot buy policy when insufficient deposit provided (79ms)
      ✓ cannot buy policy on unsupported chains (56ms)
      ✓ can activate policy - 10000 FRAX cover with 1000 FRAX deposit (3724ms)
      ✓ cannot purchase more than one policy for a single address (52ms)
      ✓ cannot transfer policy (61ms)
      ✓ can activate policy for another address - 10000 FRAX cover with 1000 FRAX deposit (1652ms)
      ✓ policy holder should have policy nft after buying coverage
      ✓ should update risk manager active cover amount
      ✓ should update risk manager mcr
      ✓ will exit cooldown when activate policy called (1803ms)
      ✓ cannot use an invalid referral code (184ms)
      ✓ cannot use own referral code (136ms)
      ✓ will not give reward points if isReferralOn == false (1621ms)
      ✓ can use referral code only once (2732ms)
    tokenURI
      ✓ cannot get for invalid policy ID
      ✓ can get for valid policy ID
    deposit
      ✓ cannot deposit for zero address policyholder
      ✓ can deposit (367ms)
      ✓ can deposit on behalf of policy holder (337ms)
      ✓ cannot deposit while paused (81ms)
    updateCoverLimit
      ✓ cannot update for zero cover amount
      ✓ cannot update for invalid policy
      ✓ cannot update while paused (80ms)
      ✓ cannot update if max cover is exceeded (53ms)
      ✓ cannot update if max cover for the strategy is exceeded (49ms)
      ✓ cannot update if below minimum required account balance for newCoverLimit (132ms)
      ✓ policy owner can update policy (912ms)
      ✓ policy owner can reduce cover limit (1271ms)
      ✓ should update risk manager active cover limit
      ✓ should update risk manager mcr
      ✓ will exit cooldown when cover limit updated (1194ms)
      ✓ cannot use invalid referral code
      ✓ cannot use own referral code
      ✓ cannot use referral code of an inactive policy holder (43ms)
      ✓ will not give reward points if isReferralOn == false (571ms)
      ✓ can use referral code only once (5821ms)
    deactivatePolicy
      ✓ cannot deactivate an invalid policy
      ✓ policy owner can deactivate policy (523ms)
    withdraw
      ✓ minRequiredAccountBalance view function working
      ✓ cannot withdraw while paused (81ms)
      ✓ cannot withdraw with no account balance
      ✓ when cooldown not started, will withdraw such that remaining balance = minRequiredAccountBalance (3077ms)
      ✓ before cooldown complete, will withdraw such that remaining balance = minRequiredAccountBalance (331ms)
      ✓ after cooldown complete, can withdraw entire account balance (417ms)
    chargePremiums
      ✓ cannot charge premiums by non premium collector
      ✓ cannot charge premiums if argument lengths are mismatched
      ✓ cannot charge premiums if policy count is exceeded
      ✓ can charge premiums (1249ms)
      ✓ will only charge minRequiredAccountBalance, if premium > minRequiredAccountBalance (163ms)
      ✓ can partially charge premiums if the fund is insufficient (3731ms)
      ✓ will be able to charge premiums for accounts that have been deactivated in the last epoch (2020ms)
      ✓ will correctly charge premiums with reward points (3751ms)
      ✓ will charge for 100 users in one call (178494ms)
    policy chain info
      ✓ is empty for non existant policy
      ✓ is set on policy activation (1408ms)
      ✓ cannot update non existant policy
      ✓ cannot update inactive policy (1581ms)
      ✓ cannot update while paused (81ms)
      ✓ can be updated (218ms)
      ✓ is empty for deactivated policy (367ms)

  SolaceMarketProduct
    deployment
      ✓ reverts zero addresses (3331ms)
      ✓ reverts invalid period
      ✓ can deploy (1995ms)
      ✓ can deploy with create2 (3922ms)
      ✓ cannot redeploy with same salt
      ✓ cannot reinitialize
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (53ms)
    productParameters
      ✓ can get minPeriod
      ✓ can set minPeriod
      ✓ should revert setMinPeriod if not called by governance
      ✓ should revert setMinPeriod if greater than maxPeriod
      ✓ can get maxPeriod
      ✓ can set maxPeriod
      ✓ should revert setMaxPeriod if not called by governance
      ✓ should revert setMaxPeriod if lesser than minPeriod
      ✓ can get policy manager
    pause
      ✓ starts unpaused
      ✓ cannot be paused by non governance
      ✓ can be paused
      ✓ cannot be unpaused by non governance
      ✓ can be unpaused
    buyPolicy
      ✓ can getQuote
      ✓ cannot buy policy for zero address
      ✓ cannot buy policy with zero cover value
      ✓ cannot buy policy over max cover amount per product (77ms)
      ✓ cannot buy policy over max cover amount per policy (66ms)
      ✓ cannot buy policy with insufficient payment (60ms)
      ✓ cannot buy policy under min period (63ms)
      ✓ cannot buy policy over max period (77ms)
      ✓ cannot buy policy while paused (72ms)
      ✓ cannot buy policy if there is no risk strategy for product (45ms)
      ✓ cannot buy policy if strategy is inactive (87ms)
      ✓ can buyPolicy (130ms)
      ✓ returns overpayment from buy policy (133ms)
    extendPolicy
      ✓ cannot extend nonexistent policy
      ✓ cannot extend someone elses policy
      ✓ cannot extend someone elses policy after transfer (387ms)
      ✓ cannot extend from a different product
      ✓ cannot extend an expired policy (159ms)
      ✓ cannot over extend policy (104ms)
      ✓ cannot extend policy with insufficient payment (146ms)
      ✓ cannot extend policy while paused (48ms)
      ✓ cannot extend policy if risk strategy is inactive (120ms)
      ✓ can extend policy (121ms)
      ✓ returns overpayment from extend policy (111ms)
      ✓ can extend your policy after transfer (506ms)
    updateCoverLimit
      ✓ cannot update cover amount while paused (49ms)
      ✓ cannot update cover amount for nonexistent policy
      ✓ cannot update cover amount for someone elses policy
      ✓ cannot update cover amount for someone elses policy after transfer (402ms)
      ✓ cannot update cover amount for from a different product
      ✓ cannot update cover amount for an expired policy (153ms)
      ✓ cannot update cover amount to zero
      ✓ cannot update cover amount over max global cover amount (119ms)
      ✓ cannot update cover amount over max user cover amount (80ms)
      ✓ cannot update cover amaount if risk strategy is inactive (101ms)
      ✓ reverts insufficient payment (182ms)
      ✓ can increase cover amount with exact payment (144ms)
      ✓ can increase cover amount and return over payment (150ms)
      ✓ can decrease cover amount (162ms)
      ✓ can decrease cover amount and return amount (201ms)
      ✓ can keep cover amount the same (178ms)
      ✓ can update cover amount after transfer (629ms)
    updatePolicy
      ✓ cannot update while paused (46ms)
      ✓ cannot update nonexistent policy
      ✓ cannot update someone elses policy (38ms)
      ✓ cannot update someone elses policy after transfer (661ms)
      ✓ cannot update from a different product (44ms)
      ✓ cannot update an expired policy (220ms)
      ✓ cannot over extend policy (106ms)
      ✓ cannot update policy with insufficient payment (169ms)
      ✓ cannot update policy to zero cover amount
      ✓ cannot update over max global cover amount (106ms)
      ✓ cannot update over max user cover amount (78ms)
      ✓ can increase cover amount and extend (161ms)
      ✓ returns overpayment from update policy (137ms)
      ✓ can decrease cover amount (155ms)
      ✓ can decrease cover amount and return msg.value (213ms)
      ✓ can keep cover amount the same (246ms)
      ✓ can update policy after transfer (1673ms)
    cancelPolicy
      ✓ cannot cancel nonexistent policy (41ms)
      ✓ cannot cancel someone elses policy (39ms)
      ✓ cannot cancel someone elses policy after transfer (409ms)
      ✓ cannot cancel from a different product
      ✓ can cancel and refunds proper amount (115ms)
      ✓ can cancel policy after transfer (417ms)
    paclas signers
      ✓ non governance cannot add signers
      ✓ cannot add zero signer
      ✓ can add signers
      ✓ non governance cannot remove signers
      ✓ can remove signers (42ms)
    active cover amount
      ✓ starts at zero
      ✓ cannot update by non policy manager
      ✓ can update (71ms)
      ✓ cannot be negative

  CoverageDataProvider
    deployment
      ✓ should revert if governance is zero address (59ms)
      ✓ should deploy (59ms)
      ✓ should deploy with initial values
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (159ms)
    set
      ✓ should revert for non-governance
      ✓ should revert for empty underwriting pool name
      ✓ should set (51ms)
      ✓ should set same (45ms)
      ✓ should set another (63ms)
    remove
      ✓ should revert for non-governance
      ✓ should return for non-exists underwriting pool
      ✓ should remove (167ms)
      ✓ should remove another (136ms)
      ✓ can remove pool from list of no pools (83ms)
    reset
      ✓ should revert for non-governance
      ✓ should revert for invalid underwriting pool length
      ✓ should revert for invalid underwriting pool amount length
      ✓ should revert for empty underwriting pool name
      ✓ should reset (457ms)
    uwp updater
      ✓ starts unset
      ✓ cannot be set by non governance
      ✓ cannot be set to zero address
      ✓ can be set by governance
      ✓ uwp updater can update uwp (39ms)

  PolicyManager
    ✓ has a correct name
    ✓ has a correct symbol
    ✓ has no policies
    ✓ has no nft token descriptor
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance (71ms)
      ✓ rejects governance transfer by non governor (43ms)
      ✓ can transfer governance (263ms)
      ✓ rejects setting new nft token descriptor by non governor
      ✓ can set new nft token descriptor (41ms)
    products
      ✓ starts with no products
      ✓ cannot add zero address
      ✓ can add products (83ms)
      ✓ returns products
      ✓ rejects adds and removes by non governor
      ✓ can remove products (136ms)
    policies
      ✓ non product cannot create policy
      ✓ can create policy (126ms)
      ✓ can get policy info (148ms)
      ✓ cannot update nonexistent policy
      ✓ product cannot update other products policy
      ✓ can set policy info (405ms)
      ✓ can update policy info with same parameters (392ms)
      ✓ can list my policies (126ms)
      ✓ cannot directly burn policy
      ✓ can burn policy via product (1151ms)
      ✓ policy holder is token owner (535ms)
    lifecycle
      ✓ pre-mint
      ✓ pre-expiration (232ms)
      ✓ post-expiration (86ms)
      ✓ post-burn (966ms)
    updateActivePolicies
      ✓ can update active policies (3928ms)
    tokenURI
      ✓ can get tokenURI (38ms)
      ✓ non governor cannot change base
      ✓ can change base (150ms)
      ✓ cannot get tokenURI for nonexistant policy id
    registry
      ✓ cannot deploy with zero address registry (143ms)
      ✓ starts set
      ✓ cannot be set by non governance
      ✓ cannot be set to zero address
      ✓ can be set by governance

  RiskManager
    deployment
      ✓ should revert if registry is zero address (76ms)
      ✓ should start with correct risk strategy count
      ✓ should start with correct weightsum
      ✓ should start with correct active cover limit
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (181ms)
      ✓ rejects adding active cover limit updater for non governor
      ✓ reject removing active cover limit updater for non governance
      ✓ reject adding active cover limit updater for zero address
      ✓ reject adding active cover limit updater for zero address
      ✓ can add new active cover limit updater
      ✓ can remove active cover limit updater (101ms)
    addRiskStrategy
      ✓ cannot add risk strategy by non governance
      ✓ cannot add zero address strategy
      ✓ can add risk strategy (57ms)
      ✓ cannot add duplicate strategy
      ✓ can get strategy info
    setStrategyStatus
      ✓ starts with inactive risk strategy
      ✓ cannot set strategy status by non governance
      ✓ cannot set status for zero address strategy
      ✓ cannot set status for non-exist strategy
      ✓ can set status (39ms)
    setWeightAllocation
      ✓ cannot set weight by non governance
      ✓ cannot set weight for inactive strategy
      ✓ cannot set invalid weight
      ✓ can set weight (187ms)
      ✓ cannot set weight if allocation drops under the strategy mcr (579ms)
    max cover amount
      ✓ can cover
    partialReservesFactor
      ✓ starts at 10000 bps
      ✓ cannot be set by non governance
      ✓ can be set (51ms)
    minCapitalRequirement
      ✓ should start at zero
      ✓ should track policy cover amount (949ms)
      ✓ should leverage (165ms)

  RiskStrategy
    deployment
      ✓ risk strategy factory should revert if governance is zero address
      ✓ risk strategy factory should revert if registry is zero address
      ✓ risk strategy factory should be deployed (51ms)
      ✓ cannot create if risk manager is zero address (1745ms)
      ✓ cannot create2 if risk manager is zero address (3027ms)
      ✓ can deploy with create (1537ms)
      ✓ can deploy with create2 (2407ms)
      ✓ cannot reinitialize risk strategy
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (53ms)
    strategy params
      ✓ should start with defaults (64ms)
      ✓ should reject change by non governor (52ms)
      ✓ should reject invalid inputs (344ms)
      ✓ should be set with setProductParams() (71ms)
      ✓ should be set with addProduct() (42ms)
      ✓ should delete old products with setProductParams() (84ms)
      ✓ should change weight with addProduct() (57ms)
      ✓ should remove products (349ms)
    max cover amount
      ✓ no assets no cover
      ✓ can cover (323ms)
    assess risk
      ✓ cannot accept risk from unregistered products
      ✓ can accept risk at max cover per product (83ms)
      ✓ cannot accept risk over max cover per product (89ms)
      ✓ can accept risk at max cover per policy (96ms)
      ✓ cannot accept risk over max cover per policy (81ms)
    sellable cover per product
      ✓ should revert on non products (3061ms)
      ✓ should be zero for inactive products
      ✓ should return correct amount (58ms)
    setRiskManager
      ✓ should revert on zero address risk manager
      ✓ should reject setRiskManager by non-governance
      ✓ should should setRiskManager

  SOLACE
    deployment
      ✓ has a correct name
      ✓ has a correct symbol
      ✓ has 18 decimals
      ✓ has a correct governance
    _mint
      ✓ rejects a null account
      for a non zero account
        ✓ increments totalSupply
        ✓ increments recipient balance
        ✓ emits Transfer event (74ms)
    mint
      ✓ allows minters to mint (189ms)
      ✓ reverts mint() called by non-minters
    minters
      ✓ governor is not minter
      ✓ can add minters (80ms)
      ✓ can remove minters (76ms)
      ✓ reverts when !governance adds / removes minters
      ✓ cannot add zero address minter
    burn
      ✓ anyone can burn their own balance (109ms)
      ✓ cannot burn more than balance (68ms)
    governance
      ✓ can transfer governance (119ms)
      ✓ reverts governance transfers by non-governor (134ms)

  FarmRewards
    deployment
      ✓ verifies inputs (433ms)
      ✓ deploys successfully (217ms)
      ✓ returns correct values
    governance
      ✓ starts with the correct governor
      ✓ rejects setting pending governance by non governor
      ✓ can set pending governance (52ms)
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (305ms)
    supported tokens
      ✓ starts with no supported tokens
      ✓ non governance cannot add supported tokens
      ✓ cannot add zero address
      ✓ can add support for tokens (101ms)
    receiver
      ✓ starts set
      ✓ cannot be set by non governance
      ✓ cannot set to zero
      ✓ can be set (101ms)
    set farmed rewards
      ✓ cannot be set by non governance
      ✓ checks length mismatch
      ✓ can be set (1680ms)
    calculate amounts
      ✓ cannot use unsupported tokens (38ms)
      ✓ can calculate amount in (46ms)
      ✓ can calculate amount out
    redeem
      ✓ non farmer should not be eligible for rewards
      ✓ farmer should be eligible for rewards
      ✓ cannot redeem with unsupported token
      ✓ can redeem using too much input (2157ms)
      ✓ can redeem signed using too much input (2504ms)
      1) can redeem using reasonable input
      2) can redeem signed using reasonable input
      ✓ can redeem in full (394ms)
    return xSOLACE
      ✓ cannot be called by non governance
      ✓ can return xSOLACE (96ms)

  FarmRewardsV2
    deployment
      ✓ verifies inputs (517ms)
      ✓ deploys successfully (95ms)
      ✓ returns correct values
    governance
      ✓ starts with the correct governor
      ✓ rejects setting pending governance by non governor
      ✓ can set pending governance
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (202ms)
    receiver
      ✓ starts set
      ✓ cannot be set by non governance
      ✓ cannot set to zero
      ✓ can be set (66ms)
    calculate amounts
      ✓ cannot use unsupported tokens
      ✓ can calculate amount in
      ✓ can calculate amount out
      ✓ purchaseable solace (648ms)
    redeem without v1 governance
      ✓ reverts redeem (62ms)
      ✓ reverts redeem signed (62ms)
    accept v1 governance
      ✓ reverts if v1 pending governance not set
      ✓ reverts if not called by v2 governance
      ✓ accepts v1 governance (186ms)
    redeem
      ✓ reverts if token not supported
      ✓ can redeem in part (1649ms)
      ✓ can redeem in full (1403ms)
      ✓ can redeem in v1 then in v2 (2589ms)
      ✓ can redeem in full in usdc (2070ms)
    redeem signed
      ✓ reverts if token not supported
      ✓ can redeem in part (2878ms)
      ✓ can redeem in full (1548ms)
      ✓ can redeem in v1 then in v2 (2878ms)
      ✓ can withdraw and create new lock (4340ms)
    return v1 governance
      ✓ reverts if not called by v2 governance
      ✓ returns v1 governance (274ms)
    rescue tokens
      ✓ cannot be called by non governance
      ✓ can rescue tokens (137ms)

  StakingRewards
    deployment
      ✓ reverts if zero governance (89ms)
      ✓ reverts if zero solace (101ms)
      ✓ reverts if zero xslocker (93ms)
      ✓ deploys (106ms)
      ✓ initializes properly (46ms)
    listener
      ✓ does not hear updates when not registered (1045ms)
      ✓ hears updates when registered (6523ms)
      ✓ updates staked lock info (5746ms)
    rewards outside start and end
      ✓ no times set (1301ms)
      ✓ times set (723ms)
      ✓ time extended (665ms)
      ✓ after end time (655ms)
    rewards before start no locks
      ✓ pending rewards are zero
      ✓ rewards distributed is zero
      ✓ harvest does nothing (869ms)
    rewards before start with locks
      ✓ pending rewards are zero
      ✓ rewards distributed is zero
      ✓ harvest does nothing (1569ms)
    rewards
      ✓ before start (128ms)
      ✓ after start (21540ms)
      ✓ after end (1528ms)
    rewards withholding solace
      ✓ before start (177ms)
      ✓ after start (27596ms)
      ✓ after end (3575ms)
    lock value over time
      ✓ decreases over time but only after harvest (1015ms)
    compound
      ✓ before start (145ms)
      ✓ after start (55249ms)
      ✓ after end (3434ms)
      ✓ cannot compound not your lock (375ms)
    set rewards
      ✓ cannot be set by non governance
      ✓ can be set by governance (72ms)
    set times
      ✓ cannot be set by non governance
      ✓ cannot be set to invalid window
      ✓ can be set by governance (78ms)
    rescue tokens
      ✓ cannot be called by non governance
      ✓ cannot rescue nonexistent tokens (110ms)
      ✓ can be called by governance (269ms)

  xsLocker
    deployment
      ✓ reverts if zero governance (276ms)
      ✓ reverts if zero solace (288ms)
      ✓ deploys (488ms)
      ✓ initializes properly (200ms)
    create lock
      ✓ cannot deposit with no balance (50ms)
      ✓ cannot deposit with no allowance (169ms)
      ✓ cannot deposit over max duration (93ms)
      ✓ can deposit unlocked (1353ms)
      ✓ can deposit locked (1343ms)
    create lock signed
      ✓ cannot deposit with no balance (122ms)
      ✓ cannot deposit with invalid permit (155ms)
      ✓ cannot deposit over max duration (81ms)
      ✓ can deposit signed unlocked (1738ms)
      ✓ can deposit signed locked (1582ms)
    increase amount
      ✓ cannot deposit to non existant lock
      ✓ cannot deposit with no balance (245ms)
      ✓ cannot deposit with no allowance (227ms)
      ✓ can deposit (394ms)
    increase amount signed
      ✓ cannot deposit to non existant lock
      ✓ cannot deposit with no balance (104ms)
      ✓ cannot deposit with invalid permit (61ms)
      ✓ can deposit (590ms)
    withdraw in full
      ✓ cannot withdraw non existant token
      ✓ cannot withdraw not your token
      ✓ cannot withdraw locked token
      ✓ can withdraw never locked token (544ms)
      ✓ can withdraw after lock expiration (527ms)
      ✓ can withdraw if approved for one (520ms)
      ✓ can withdraw if approved for all (502ms)
    withdraw in part
      ✓ cannot withdraw non existant token
      ✓ cannot withdraw not your token
      ✓ cannot withdraw locked token
      ✓ cannot withdraw in excess
      ✓ can withdraw never locked token (770ms)
      ✓ can withdraw after lock expiration (759ms)
      ✓ can withdraw if approved for one (783ms)
      ✓ can withdraw if approved for all (793ms)
    withdraw multiple
      ✓ can withdraw none (286ms)
      ✓ cannot withdraw multiple if one fails (49ms)
      ✓ can withdraw multiple (938ms)
    extend lock
      ✓ cannot extend non existant lock
      ✓ cannot extend not your lock
      ✓ cannot extend over four years
      ✓ cannot take time off
      ✓ can extend lock (162ms)
      ✓ can extend lock from unlock (301ms)
      ✓ can extend if approved (186ms)
    listeners
      ✓ non governor cannot add or remove listeners
      ✓ governor can add and remove listeners (236ms)
      ✓ listeners hear mint (623ms)
      ✓ listeners hear burn (576ms)
      ✓ listeners hear transfer (1021ms)
      ✓ listeners hear increase amount (473ms)
      ✓ listeners hear extend lock (345ms)
    lock transfer
      ✓ cannot transfer when locked (719ms)
      ✓ can transfer when unlocked (2307ms)
    lock view
      ✓ nonexistent
      ✓ unlocked (1192ms)
      ✓ locked (652ms)
    uri
      ✓ cannot get the uri of non existant token
      ✓ starts simple
      ✓ non governor cannot set base uri
      ✓ governor can set base uri (55ms)

  xSOLACE
    deployment
      ✓ reverts if zero xslocker (46ms)
      ✓ deploys (48ms)
      ✓ initializes properly
    cannot be transferred
      ✓ cannot transfer
      ✓ cannot transferFrom
      ✓ cannot approve
    accounts correctly
      ✓ starts zero (39ms)
      ✓ accounts for unlocked stake (1102ms)
      ✓ accounts for unlocked stake (2566ms)
      ✓ accounts for time (442ms)
      ✓ accounts for withdraw (713ms)

  xSolaceMigrator
    deployment
      ✓ reverts if zero solace
      ✓ reverts if zero xsolace
      ✓ reverts if zero xslocker
      ✓ deploys (39ms)
      ✓ initializes properly
    migrate
      ✓ can migrate zero (873ms)
      ✓ cannot migrate without approval (307ms)
      ✓ migrates (939ms)
      ✓ migrates unbalanced (1390ms)
    migrate signed
      ✓ can migrate zero (1090ms)
      ✓ cannot migrate with invalid permit (255ms)
      ✓ migrates (1066ms)
      ✓ migrates unbalanced (1614ms)

  xSOLACEv1
    deployment
      ✓ reverts if zero governance (72ms)
      ✓ reverts if zero solace (75ms)
      ✓ deploys (75ms)
      ✓ starts with correct solace
    stake 1:1
      ✓ cannot stake without balance
      ✓ cannot stake without approval (76ms)
      ✓ can stake (671ms)
      ✓ can deposit solace with permit (368ms)
      ✓ cannot unstake without balance
      ✓ can unstake (365ms)
    stake uneven
      ✓ should initially return 1:1 SOLACE:xSOLACE
      ✓ should return 1:1 with only solace (41ms)
      ✓ should change with uneven amounts (328ms)
      ✓ staking should maintain ratio (351ms)
      ✓ solace rewards should change ratio (69ms)
      ✓ unstaking should maintain ratio (265ms)
      ✓ burning xsolace should change ratio (63ms)
    burn
      ✓ anyone can burn (88ms)
      ✓ cannot burn more than balance

  Cloneable
    deployment
      ✓ deploys (43ms)
      ✓ reverts zero address governor
      ✓ initializes (129ms)
      ✓ reverts double initialize
      ✓ can set message (71ms)
    clone
      ✓ clones (2257ms)
      ✓ reverts zero address governor (2206ms)
      ✓ reverts double initialize
      ✓ can set message (47ms)
    clone of a clone
      ✓ clones (2861ms)
      ✓ reverts zero address governor
      ✓ reverts double initialize
      ✓ can set message (39ms)
    clone2
      ✓ clones (1548ms)
      ✓ reverts duplicate salt
      ✓ reverts zero address governor (2248ms)
      ✓ reverts double initialize
      ✓ can set message
    clone2 of a clone2
      ✓ clones (1726ms)
      ✓ reverts duplicate salt
      ✓ reverts zero address governor
      ✓ reverts double initialize
      ✓ can set message

  Deployer
    CREATE
      ✓ can get initcode from the create deployment tx (66ms)
      ✓ duplicate deployment same initcode different address (62ms)
      ✓ different msg.sender same initcode (1242ms)
      ✓ different params different initcode (67ms)
      ✓ different contract different initcode
    CREATE2
      ✓ reverts invalid initcodes (1989ms)
      ✓ can predict contract address (1909ms)
      ✓ can manipulate contract address (1205ms)
      ✓ can brute force a desired address
      ✓ contract works
    deploy multiple
      ✓ reverts length mismatch
      ✓ reverts invalid deploys
      ✓ can redeploy zero
      ✓ can redeploy one (2262ms)
      ✓ can redeploy more than one (5120ms)
      ✓ can deploy all (4983ms)

  ERC721Enhanced
    deployment
      ✓ has a correct name
      ✓ has a correct symbol
      ✓ should start with zero supply
      ✓ should start with zero balance
    mint
      ✓ should mint token (41ms)
      ✓ should increment supply
      ✓ should increment balance
      ✓ should exist
      ✓ should mint another token (56ms)
      ✓ should increment supply
      ✓ should increment balance
    transfer
      ✓ should reject transfer of nonexistent token
      ✓ should reject transfer by non owner
      ✓ should transfer (179ms)
      ✓ should reject safeTransfer of nonexistent token
      ✓ should reject safeTransfer by non owner
      ✓ should safeTransfer (179ms)
      ✓ should clear approvals (212ms)
    permit
      ✓ has a permit typehash
      ✓ has a domain seperator
      ✓ has a nonce
      ✓ cannot permit non existant token
      ✓ cannot permit past deadline
      ✓ cannot permit to self
      ✓ cannot permit not your token
      ✓ cannot use signature for another contract (142ms)
      ✓ should reject forged signatures
      ✓ should reject modified parameters (49ms)
      ✓ should permit EOA signatures (259ms)
      ✓ should revert nonce too low
      ✓ should revert nonce too high
      ✓ should increment nonce (223ms)
      ✓ should reject erc1271 invalid signatures (174ms)
      ✓ should support erc1271 valid signatures (252ms)
    token must exist
      ✓ cannot do things to non tokens
      ✓ can do things to tokens
    only owner
      ✓ cannot do things to not your token
      ✓ can do things to your token
    only owner or approved
      ✓ cannot do things to not your token
      ✓ can do things to your token
      ✓ can do things to token if approved for one (53ms)
      ✓ can do things to token if approved for all (53ms)
    uri
      ✓ cannot get the uri of non existant token
      ✓ starts simple
      ✓ governor can set base uri (49ms)
    _afterTokenTransfer
      ✓ hears mint (52ms)
      ✓ hears transfer (159ms)
      ✓ hears burn (175ms)

  ERC721EnhancedInitializable
    deployment
      ✓ starts with no name
      ✓ starts with no symbol
      ✓ can be initialized (151ms)
      ✓ cannot be double initialized
      ✓ has a correct name
      ✓ has a correct symbol
      ✓ should start with zero supply
      ✓ should start with zero balance
    mint
      ✓ should mint token (43ms)
      ✓ should increment supply
      ✓ should increment balance
      ✓ should exist
      ✓ should mint another token (76ms)
      ✓ should increment supply
      ✓ should increment balance
    transfer
      ✓ should reject transfer of nonexistent token
      ✓ should reject transfer by non owner
      ✓ should transfer (207ms)
      ✓ should reject safeTransfer of nonexistent token
      ✓ should reject safeTransfer by non owner
      ✓ should safeTransfer (196ms)
      ✓ should clear approvals (225ms)
    permit
      ✓ has a permit typehash
      ✓ has a domain seperator
      ✓ has a nonce
      ✓ cannot permit non existant token
      ✓ cannot permit past deadline
      ✓ cannot permit to self
      ✓ cannot permit not your token
      ✓ cannot use signature for another contract (397ms)
      ✓ should reject forged signatures
      ✓ should reject modified parameters (60ms)
      ✓ should permit EOA signatures (249ms)
      ✓ should revert nonce too low
      ✓ should revert nonce too high
      ✓ should increment nonce (226ms)
      ✓ should reject erc1271 invalid signatures (226ms)
      ✓ should support erc1271 valid signatures (302ms)
    token must exist
      ✓ cannot do things to non tokens
      ✓ can do things to tokens
    only owner
      ✓ cannot do things to not your token
      ✓ can do things to your token
    only owner or approved
      ✓ cannot do things to not your token
      ✓ can do things to your token
      ✓ can do things to token if approved for one (48ms)
      ✓ can do things to token if approved for all (49ms)
    uri
      ✓ cannot get the uri of non existant token
      ✓ starts simple
      ✓ governor can set base uri (45ms)
    _afterTokenTransfer
      ✓ hears mint (59ms)
      ✓ hears transfer (163ms)
      ✓ hears burn (172ms)

  Governance
    deployment
      ✓ reverts zero address governor (64ms)
      ✓ starts with the correct governor
      ✓ starts unlocked
    powers
      ✓ can call governance only functions
      ✓ non governance cannot call governance only functions
    transfer
      ✓ rejects setting new governance by non governor
      ✓ can set new governance (114ms)
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (104ms)
      ✓ new governance can use powers (103ms)
      ✓ can return governance (94ms)
      ✓ rejects transferring governance to the zero address
    lock
      ✓ non governor cannot lock governance
      ✓ can lock governance (43ms)
      ✓ no one can use the governance role
      ✓ no one can use the pending governance role

  GovernableInitializable
    deployment
      ✓ reverts zero address governor
      ✓ starts with the correct governor
      ✓ starts unlocked
    powers
      ✓ can call governance only functions
      ✓ non governance cannot call governance only functions
    transfer
      ✓ rejects setting new governance by non governor
      ✓ can set new governance (72ms)
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (102ms)
      ✓ new governance can use powers (54ms)
      ✓ can return governance (141ms)
      ✓ rejects transferring governance to the zero address
    lock
      ✓ non governor cannot lock governance (40ms)
      ✓ can lock governance (49ms)
      ✓ no one can use the governance role (40ms)
      ✓ no one can use the pending governance role

  Overrides
    ✓ does stuff (91ms)

  Registry
    governance
      ✓ starts with the correct governor
      ✓ rejects setting new governance by non governor
      ✓ can set new governance
      ✓ rejects governance transfer by non governor
      ✓ can transfer governance (157ms)
    get before set
      ✓ has zero length
      ✓ cannot get
      ✓ can tryGet
    set
      ✓ cannot be set by non governance
      ✓ cannot length mismatch
      ✓ can set empty
      ✓ can set (120ms)
      ✓ can overwrite (135ms)

  WETH10
    deployment
      ✓ has a correct name
      ✓ has a correct symbol
      ✓ has 18 decimals
      ✓ has correct domain separator
      ✓ has correct CALLBACK_SUCCESS
      ✓ has correct PERMIT_TYPEHASH
    deposit
      ✓ starts with zero balance and supply
      ✓ can deposit via deposit() (60ms)
      ✓ can deposit via receive (59ms)
      ✓ can deposit via depositTo() (66ms)
      ✓ can deposit via depositToAndCall() (58ms)
    withdraw
      ✓ can withdraw (176ms)
      ✓ cannot over withdraw
      ✓ checks for eth transfer fail (111ms)
    withdrawTo
      ✓ can withdraw (193ms)
      ✓ cannot over withdraw
      ✓ checks for eth transfer fail
    withdrawFrom
      ✓ cannot withdraw from other without allowance
      ✓ can withdraw (406ms)
      ✓ cannot over withdraw
      ✓ checks for eth transfer fail (55ms)

  WETH9
    deployment
      ✓ has a correct name
      ✓ has a correct symbol
      ✓ has 18 decimals
    deposit
      ✓ starts with zero balance and supply
      ✓ can deposit via deposit() (51ms)
      ✓ can deposit via receive (52ms)
      ✓ can deposit via fallback (50ms)
    withdraw
      ✓ can withdraw (148ms)
      ✓ cannot over withdraw

  WMATIC9
    deployment
      ✓ has a correct name
      ✓ has a correct symbol
      ✓ has 18 decimals
    deposit
      ✓ starts with zero balance and supply
      ✓ can deposit via deposit() (50ms)
      ✓ can deposit via receive (51ms)
      ✓ can deposit via fallback (50ms)
    withdraw
      ✓ can withdraw (150ms)
      ✓ cannot over withdraw


  1284 passing (18m)
  2 failing

  1) FarmRewards
       redeem
         can redeem using reasonable input:
     InvalidInputError: Timestamp 1644840000 is lower than or equal to previous block's timestamp 1648781201
      at EvmModule._setNextBlockTimestampAction (node_modules/hardhat/src/internal/hardhat-network/provider/modules/evm.ts:92:13)
      at runMicrotasks (<anonymous>)
      at processTicksAndRejections (internal/process/task_queues.js:95:5)
      at async HardhatNetworkProvider.request (node_modules/hardhat/src/internal/hardhat-network/provider/provider.ts:108:18)
      at async WaffleMockProviderAdapter.send (node_modules/@nomiclabs/hardhat-waffle/src/waffle-provider-adapter.ts:31:20)
      at async Context.<anonymous> (test/staking/FarmRewards.test.ts:289:7)

  2) FarmRewards
       redeem
         can redeem signed using reasonable input:

      AssertionError: Expected "766494971792985" to be equal 158730158730158730158
      + expected - actual

       {
      -  "_hex": "0x089ad2ce606c7aebae"
      +  "_hex": "0x02b91f84840e59"
         "_isBigNumber": true
       }

      at Context.<anonymous> (test/staking/FarmRewards.test.ts:321:39)
      at runMicrotasks (<anonymous>)
      at processTicksAndRejections (internal/process/task_queues.js:95:5)
      at runNextTicks (internal/process/task_queues.js:64:3)
      at listOnTimeout (internal/timers.js:526:9)
      at processTimers (internal/timers.js:500:7)



-----------------------------------|----------|----------|----------|----------|----------------|
File                               |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
-----------------------------------|----------|----------|----------|----------|----------------|
 contracts/                        |    69.51 |    52.44 |     87.5 |    70.76 |                |
  BridgeWrapper.sol                |      100 |      100 |      100 |      100 |                |
  Faucet.sol                       |      100 |      100 |      100 |      100 |                |
  SOLACE.sol                       |      100 |      100 |      100 |      100 |                |
  WETH10.sol                       |    58.68 |    42.65 |    73.68 |    60.32 |... 382,383,386 |
  WETH9.sol                        |      100 |      100 |      100 |      100 |                |
  WMATIC.sol                       |      100 |      100 |      100 |      100 |                |
 contracts/bonds/                  |      100 |     98.9 |      100 |      100 |                |
  BondDepository.sol               |      100 |      100 |      100 |      100 |                |
  BondTellerErc20.sol              |      100 |    98.86 |      100 |      100 |                |
  BondTellerEth.sol                |      100 |    98.89 |      100 |      100 |                |
  BondTellerMatic.sol              |      100 |    98.89 |      100 |      100 |                |
 contracts/interfaces/             |      100 |      100 |      100 |      100 |                |
  IApprovalReceiver.sol            |      100 |      100 |      100 |      100 |                |
  IBridgeWrapper.sol               |      100 |      100 |      100 |      100 |                |
  IERC3156FlashBorrower.sol        |      100 |      100 |      100 |      100 |                |
  IERC3156FlashLender.sol          |      100 |      100 |      100 |      100 |                |
  IFaucet.sol                      |      100 |      100 |      100 |      100 |                |
  ISOLACE.sol                      |      100 |      100 |      100 |      100 |                |
  ITransferReceiver.sol            |      100 |      100 |      100 |      100 |                |
  IWETH10.sol                      |      100 |      100 |      100 |      100 |                |
  IWETH9.sol                       |      100 |      100 |      100 |      100 |                |
  IWMATIC.sol                      |      100 |      100 |      100 |      100 |                |
 contracts/interfaces/bonds/       |      100 |      100 |      100 |      100 |                |
  IBondDepository.sol              |      100 |      100 |      100 |      100 |                |
  IBondTellerErc20.sol             |      100 |      100 |      100 |      100 |                |
  IBondTellerEth.sol               |      100 |      100 |      100 |      100 |                |
  IBondTellerMatic.sol             |      100 |      100 |      100 |      100 |                |
 contracts/interfaces/products/    |      100 |      100 |      100 |      100 |                |
  IProduct.sol                     |      100 |      100 |      100 |      100 |                |
  IProductFactory.sol              |      100 |      100 |      100 |      100 |                |
  ISolaceCoverProduct.sol          |      100 |      100 |      100 |      100 |                |
  ISolaceCoverProductV2.sol        |      100 |      100 |      100 |      100 |                |
 contracts/interfaces/risk/        |      100 |      100 |      100 |      100 |                |
  ICoverageDataProvider.sol        |      100 |      100 |      100 |      100 |                |
  IPolicyManager.sol               |      100 |      100 |      100 |      100 |                |
  IRiskManager.sol                 |      100 |      100 |      100 |      100 |                |
  IRiskStrategy.sol                |      100 |      100 |      100 |      100 |                |
  IRiskStrategyFactory.sol         |      100 |      100 |      100 |      100 |                |
 contracts/interfaces/staking/     |      100 |      100 |      100 |      100 |                |
  IFarmRewards.sol                 |      100 |      100 |      100 |      100 |                |
  IFarmRewardsV2.sol               |      100 |      100 |      100 |      100 |                |
  IStakingRewards.sol              |      100 |      100 |      100 |      100 |                |
  IxSOLACE.sol                     |      100 |      100 |      100 |      100 |                |
  IxSOLACEV1.sol                   |      100 |      100 |      100 |      100 |                |
  IxSolaceMigrator.sol             |      100 |      100 |      100 |      100 |                |
  IxsListener.sol                  |      100 |      100 |      100 |      100 |                |
  IxsLocker.sol                    |      100 |      100 |      100 |      100 |                |
 contracts/interfaces/utils/       |      100 |      100 |      100 |      100 |                |
  ICloneable.sol                   |      100 |      100 |      100 |      100 |                |
  IDeployer.sol                    |      100 |      100 |      100 |      100 |                |
  IERC1271.sol                     |      100 |      100 |      100 |      100 |                |
  IERC721Enhanced.sol              |      100 |      100 |      100 |      100 |                |
  IERC721EnhancedInitializable.sol |      100 |      100 |      100 |      100 |                |
  IGovernable.sol                  |      100 |      100 |      100 |      100 |                |
  IPolicyDescriptorV2.sol          |      100 |      100 |      100 |      100 |                |
  IRegistry.sol                    |      100 |      100 |      100 |      100 |                |
  ISingletonFactory.sol            |      100 |      100 |      100 |      100 |                |
 contracts/mocks/                  |    75.82 |       20 |    79.63 |    77.78 |                |
  BlockGetter.sol                  |      100 |      100 |      100 |      100 |                |
  GasGriefer.sol                   |        0 |      100 |        0 |        0 |    16,20,24,25 |
  MockCloneable.sol                |      100 |      100 |      100 |      100 |                |
  MockERC1271.sol                  |      100 |      100 |      100 |      100 |                |
  MockERC20.sol                    |      100 |      100 |      100 |      100 |                |
  MockERC20Decimals.sol            |       60 |      100 |       50 |       60 |          56,60 |
  MockERC20Permit.sol              |       75 |      100 |    66.67 |       75 |             57 |
  MockERC677Receiver.sol           |       50 |      100 |       50 |       50 |          39,40 |
  MockERC721.sol                   |      100 |      100 |      100 |      100 |                |
  MockERC721Initializable.sol      |      100 |      100 |      100 |      100 |                |
  MockFaultyReceiver.sol           |    66.67 |      100 |       50 |       75 |             22 |
  MockGovernableInitializable.sol  |      100 |      100 |      100 |      100 |                |
  MockListener.sol                 |      100 |      100 |      100 |      100 |                |
  MockPriceOracle.sol              |     9.09 |        0 |       50 |     12.5 |... 38,40,42,44 |
  MockProductV2.sol                |      100 |      100 |      100 |      100 |                |
  MockRiskStrategy.sol             |      100 |      100 |      100 |      100 |                |
  MockSLP.sol                      |     62.5 |      100 |       25 |     62.5 |       49,57,67 |
 contracts/products/               |    97.64 |    96.18 |    98.72 |    97.44 |                |
  ProductFactory.sol               |      100 |      100 |      100 |      100 |                |
  SolaceCoverProduct.sol           |      100 |      100 |      100 |      100 |                |
  SolaceCoverProductV2.sol         |      100 |      100 |      100 |      100 |                |
  SolaceMarketProduct.sol          |    90.15 |     87.8 |    92.86 |    89.55 |... 297,300,377 |
 contracts/risk/                   |    98.35 |     87.9 |    98.82 |    98.71 |                |
  CoverageDataProvider.sol         |    97.37 |    93.75 |      100 |      100 |                |
  PolicyManager.sol                |      100 |      100 |      100 |      100 |                |
  RiskManager.sol                  |       96 |    84.38 |      100 |    97.26 |        323,324 |
  RiskStrategy.sol                 |    99.12 |    84.48 |    95.24 |    98.31 |          41,42 |
  RiskStrategyFactory.sol          |      100 |      100 |      100 |      100 |                |
 contracts/staking/                |      100 |      100 |      100 |      100 |                |
  FarmRewards.sol                  |      100 |      100 |      100 |      100 |                |
  FarmRewardsV2.sol                |      100 |      100 |      100 |      100 |                |
  StakingRewards.sol               |      100 |      100 |      100 |      100 |                |
  xSOLACE.sol                      |      100 |      100 |      100 |      100 |                |
  xSOLACEV1.sol                    |      100 |      100 |      100 |      100 |                |
  xSolaceMigrator.sol              |      100 |      100 |      100 |      100 |                |
  xsLocker.sol                     |      100 |      100 |      100 |      100 |                |
 contracts/utils/                  |      100 |    97.67 |      100 |      100 |                |
  Cloneable.sol                    |      100 |       75 |      100 |      100 |                |
  Deployer.sol                     |      100 |      100 |      100 |      100 |                |
  ERC721Enhanced.sol               |      100 |      100 |      100 |      100 |                |
  ERC721EnhancedInitializable.sol  |      100 |      100 |      100 |      100 |                |
  Factory.sol                      |      100 |       75 |      100 |      100 |                |
  Governable.sol                   |      100 |      100 |      100 |      100 |                |
  GovernableInitializable.sol      |      100 |      100 |      100 |      100 |                |
  PolicyDescriptorV2.sol           |      100 |      100 |      100 |      100 |                |
  Registry.sol                     |      100 |      100 |      100 |      100 |                |
-----------------------------------|----------|----------|----------|----------|----------------|
All files                          |    95.64 |    91.84 |    96.64 |    95.76 |                |
-----------------------------------|----------|----------|----------|----------|----------------|

> Istanbul reports written to ./coverage/ and ./coverage.json
Error in plugin solidity-coverage: ❌ 2 test(s) failed under coverage.

For more info run Hardhat with --show-stack-traces
```

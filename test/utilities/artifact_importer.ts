/**
 * Tools such as MythX require contracts to be preprocessed.
 * The main advantage of Artifact Importer is it's ability to seamlessly switch between raw and processed contracts.
 * It also removes repetitive code from the tests.
 */

import { config as dotenv_config } from "dotenv";
dotenv_config();
import { ContractJSON } from "ethereum-waffle/dist/esm/ContractJSON";

export interface ArtifactImports { [contract_name: string]: ContractJSON };

export const EMPTY_ARTIFACTS: ArtifactImports = {};

export async function import_artifacts() {
  let artifacts: ArtifactImports = {};

  let artifact_dir = process.env.USE_PROCESSED_FILES === "true" ? "../../artifacts/contracts_processed" : "../../artifacts/contracts";
  artifacts.WETH = await tryImport(`${artifact_dir}/WETH9.sol/WETH9.json`);
  artifacts.Vault = await tryImport(`${artifact_dir}/utils/Vault.sol/Vault.json`);
  artifacts.Treasury = await tryImport (`${artifact_dir}/utils/Treasury.sol/Treasury.json`);
  artifacts.PolicyManager = await tryImport(`${artifact_dir}/risk/PolicyManager.sol/PolicyManager.json`);
  artifacts.PolicyDescriptorV2 = await tryImport(`${artifact_dir}/utils/PolicyDescriptorV2.sol/PolicyDescriptorV2.json`);
  artifacts.RiskManager = await tryImport(`${artifact_dir}/risk/RiskManager.sol/RiskManager.json`);
  artifacts.MockGovernableInitializable = await tryImport(`${artifact_dir}/mocks/MockGovernableInitializable.sol/MockGovernableInitializable.json`);
  // farms (deprecated)
  artifacts.FarmRewards = await tryImport(`${artifact_dir}/staking/FarmRewards.sol/FarmRewards.json`);

  // product v2
  artifacts.ProductFactory = await tryImport(`${artifact_dir}/products/ProductFactory.sol/ProductFactory.json`);
  artifacts.SolaceMarketProduct = await tryImport(`${artifact_dir}/products/SolaceMarketProduct.sol/SolaceMarketProduct.json`);
  artifacts.MockProductV2 = await tryImport(`${artifact_dir}/mocks/MockProductV2.sol/MockProductV2.json`);
  // investing v2
  artifacts.WETH10 = await tryImport(`${artifact_dir}/WETH10.sol/WETH10.json`);
  artifacts.WMATIC = await tryImport(`${artifact_dir}/WMATIC.sol/WMATIC.json`);
  artifacts.SOLACE = await tryImport(`${artifact_dir}/SOLACE.sol/SOLACE.json`);
  // staking
  artifacts.xSOLACEV1 = await tryImport(`${artifact_dir}/staking/xSOLACEV1.sol/xSOLACEV1.json`);
  artifacts.xsLocker = await tryImport(`${artifact_dir}/staking/xsLocker.sol/xsLocker.json`);
  artifacts.xSOLACE = await tryImport(`${artifact_dir}/staking/xSOLACE.sol/xSOLACE.json`);
  artifacts.MockListener = await tryImport(`${artifact_dir}/mocks/MockListener.sol/MockListener.json`);
  artifacts.StakingRewards = await tryImport(`${artifact_dir}/staking/StakingRewards.sol/StakingRewards.json`);
  artifacts.xSolaceMigrator = await tryImport(`${artifact_dir}/staking/xSolaceMigrator.sol/xSolaceMigrator.json`);
  artifacts.FarmRewards = await tryImport(`${artifact_dir}/staking/FarmRewards.sol/FarmRewards.json`);
  artifacts.FarmRewardsV2 = await tryImport(`${artifact_dir}/staking/FarmRewardsV2.sol/FarmRewardsV2.json`);
  // bonds
  artifacts.BondDepository = await tryImport(`${artifact_dir}/bonds/BondDepository.sol/BondDepository.json`);
  artifacts.BondTellerETH = await tryImport(`${artifact_dir}/bonds/BondTellerEth.sol/BondTellerEth.json`);
  artifacts.BondTellerMATIC = await tryImport(`${artifact_dir}/bonds/BondTellerMatic.sol/BondTellerMatic.json`);
  artifacts.BondTellerERC20 = await tryImport(`${artifact_dir}/bonds/BondTellerErc20.sol/BondTellerErc20.json`);
  artifacts.Faucet = await tryImport(`${artifact_dir}/Faucet.sol/Faucet.json`);
  // utils
  artifacts.Registry = await tryImport(`${artifact_dir}/utils/Registry.sol/Registry.json`);
  artifacts.SingletonFactory = await tryImport(`${artifact_dir}/interfaces/utils/ISingletonFactory.sol/ISingletonFactory.json`);
  artifacts.Deployer = await tryImport(`${artifact_dir}/utils/Deployer.sol/Deployer.json`);
  // cross chain
  artifacts.BridgeWrapper = await tryImport(`${artifact_dir}/BridgeWrapper.sol/BridgeWrapper.json`);
  // generic imports
  artifacts.ERC20 = await tryImport(`${artifact_dir}/SOLACE.sol/ERC20.json`);
  if(!artifacts.ERC20) artifacts.ERC20 = await tryImport(`../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json`);
  artifacts.MockERC20 = await tryImport(`${artifact_dir}/mocks/MockERC20.sol/MockERC20.json`);
  artifacts.MockERC20Permit = await tryImport(`${artifact_dir}/mocks/MockERC20Permit.sol/MockERC20Permit.json`);
  artifacts.MockERC20Decimals = await tryImport(`${artifact_dir}/mocks/MockERC20Decimals.sol/MockERC20Decimals.json`);
  artifacts.MockERC721 = await tryImport(`${artifact_dir}/mocks/MockERC721.sol/MockERC721.json`);
  artifacts.MockERC721Initializable = await tryImport(`${artifact_dir}/mocks/MockERC721Initializable.sol/MockERC721Initializable.json`);
  artifacts.MockERC1271 = await tryImport(`${artifact_dir}/mocks/MockERC1271.sol/MockERC1271.json`);
  artifacts.MockCloneable = await tryImport(`${artifact_dir}/mocks/MockCloneable.sol/MockCloneable.json`);
  artifacts.MockGovernableInitializable = await tryImport(`${artifact_dir}/mocks/MockGovernableInitializable.sol/MockGovernableInitializable.json`);
  artifacts.MockFaultyReceiver = await tryImport(`${artifact_dir}/mocks/MockFaultyReceiver.sol/MockFaultyReceiver.json`);
  artifacts.GasGriefer = await tryImport(`${artifact_dir}/mocks/GasGriefer.sol/GasGriefer.json`);
  artifacts.Blacklist = await tryImport(`${artifact_dir}/interface/IBlacklist.sol/IBlacklist.json`);
  artifacts.Deployer = await tryImport(`${artifact_dir}/utils/Deployer.sol/Deployer.json`);
  artifacts.MockSLP = await tryImport(`${artifact_dir}/mocks/MockSLP.sol/MockSLP.json`);
  // risk strategy imports
  artifacts.RiskStrategyFactory = await tryImport(`${artifact_dir}/RiskStrategyFactory.sol/RiskStrategyFactory.json`);
  artifacts.RiskStrategy = await tryImport(`${artifact_dir}/RiskStrategy.sol/RiskStrategy.json`);
  artifacts.MockRiskStrategy = await tryImport(`${artifact_dir}/mocks/MockRiskStrategy.sol/MockRiskStrategy.json`);

  // uniswapv3 imports
  artifacts.UniswapV3Factory = await tryImport("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
  artifacts.UniswapV3Pool = await tryImport("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
  artifacts.SwapRouter = await tryImport("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
  artifacts.NonfungiblePositionManager = await tryImport("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");

  // coverage data provider
  artifacts.CoverageDataProvider = await tryImport(`${artifact_dir}/risk/CoverageDataProvider.sol/CoverageDataProvider.json`);
  artifacts.MockPriceOracle = await tryImport(`${artifact_dir}/mocks/MockPriceOracle.sol/MockPriceOracle.json`);

  // soteria coverage product
  artifacts.SolaceCoverProduct = await tryImport(`${artifact_dir}/products/SolaceCoverProduct.sol/SolaceCoverProduct.json`);
  return artifacts;
}

async function tryImport(filepath: string) {
  try {
    var imp = await import(filepath);
    return imp;
  } catch(e) {
    return undefined;
  }
}

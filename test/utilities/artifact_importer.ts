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

  // solace imports pre-dao
  let artifact_dir = process.env.USE_PROCESSED_FILES === "true" ? "../../artifacts/contracts_processed" : "../../artifacts/contracts";
  artifacts.Registry = await tryImport(`${artifact_dir}/Registry.sol/Registry.json`);
  artifacts.WETH = await tryImport(`${artifact_dir}/WETH9.sol/WETH9.json`);
  artifacts.Vault = await tryImport(`${artifact_dir}/Vault.sol/Vault.json`);
  artifacts.ClaimsEscrow = await tryImport(`${artifact_dir}/ClaimsEscrow.sol/ClaimsEscrow.json`);
  artifacts.Treasury = await tryImport (`${artifact_dir}/Treasury.sol/Treasury.json`);
  artifacts.PolicyManager = await tryImport(`${artifact_dir}/PolicyManager.sol/PolicyManager.json`);
  artifacts.PolicyDescriptor = await tryImport(`${artifact_dir}/PolicyDescriptor.sol/PolicyDescriptor.json`);
  artifacts.RiskManager = await tryImport(`${artifact_dir}/RiskManager.sol/RiskManager.json`);
  // solace imports post-dao
  artifacts.SOLACE = await tryImport(`${artifact_dir}/SOLACE.sol/SOLACE.json`);
  artifacts.OptionsFarming = await tryImport(`${artifact_dir}/OptionsFarming.sol/OptionsFarming.json`);
  artifacts.FarmController = await tryImport(`${artifact_dir}/FarmController.sol/FarmController.json`);
  artifacts.CpFarm = await tryImport(`${artifact_dir}/CpFarm.sol/CpFarm.json`);
  artifacts.LpAppraisor = await tryImport(`${artifact_dir}/LpAppraisor.sol/LpAppraisor.json`);
  artifacts.SolaceEthLpFarm = await tryImport(`${artifact_dir}/SolaceEthLpFarm.sol/SolaceEthLpFarm.json`);
  // products
  artifacts.MockProduct = await tryImport(`${artifact_dir}/mocks/MockProduct.sol/MockProduct.json`);
  artifacts.AaveV2Product = await tryImport(`${artifact_dir}/products/AaveV2Product.sol/AaveV2Product.json`);
  artifacts.CompoundProduct = await tryImport(`${artifact_dir}/products/CompoundProduct.sol/CompoundProduct.json`);
  artifacts.CompoundProductRinkeby = await tryImport(`${artifact_dir}/products/CompoundProductRinkeby.sol/CompoundProductRinkeby.json`);
  artifacts.CurveProduct = await tryImport(`${artifact_dir}/products/CurveProduct.sol/CurveProduct.json`);
  artifacts.WaaveProduct = await tryImport(`${artifact_dir}/products/WaaveProduct.sol/WaaveProduct.json`);
  artifacts.YearnV2Product = await tryImport(`${artifact_dir}/products/YearnV2Product.sol/YearnV2Product.json`);
  artifacts.LiquityProduct = await tryImport(`${artifact_dir}/products/LiquityProduct.sol/LiquityProduct.json`);
  artifacts.SushiswapProduct = await tryImport(`${artifact_dir}/products/SushiswapProduct.sol/SushiswapProduct.json`);
  artifacts.UniswapV2Product = await tryImport(`${artifact_dir}/products/UniswapV2Product.sol/UniswapV2Product.json`);
  artifacts.UniswapV3Product = await tryImport(`${artifact_dir}/products/UniswapV3Product.sol/UniswapV3Product.json`);

  // oracles
  artifacts.ExchangeQuoter1InchV1 = await tryImport(`${artifact_dir}/oracles/ExchangeQuoter1InchV1.sol/ExchangeQuoter1InchV1.json`);
  artifacts.ExchangeQuoterManual = await tryImport(`${artifact_dir}/oracles/ExchangeQuoterManual.sol/ExchangeQuoterManual.json`);
  artifacts.ExchangeQuoterAaveV2 = await tryImport(`${artifact_dir}/oracles/ExchangeQuoterAaveV2.sol/ExchangeQuoterAaveV2.json`);

  // generic imports
  artifacts.ERC20 = await tryImport(`${artifact_dir}/SOLACE.sol/ERC20.json`);
  if(!artifacts.ERC20) artifacts.ERC20 = await tryImport(`../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json`);
  artifacts.MockERC20 = await tryImport(`${artifact_dir}/mocks/MockERC20.sol/MockERC20.json`);
  artifacts.MockERC20v2 = await tryImport(`${artifact_dir}/mocks/MockERC20v2.sol/MockERC20v2.json`);
  artifacts.MockERC721 = await tryImport(`${artifact_dir}/mocks/MockERC721.sol/MockERC721.json`);
  artifacts.MockERC1271 = await tryImport(`${artifact_dir}/mocks/MockERC1271.sol/MockERC1271.json`);
  artifacts.MockFaultyReceiver = await tryImport(`${artifact_dir}/mocks/MockFaultyReceiver.sol/MockFaultyReceiver.json`);
  artifacts.GasGriefer = await tryImport(`${artifact_dir}/mocks/GasGriefer.sol/GasGriefer.json`);
  artifacts.Blacklist = await tryImport(`${artifact_dir}/interface/IBlacklist.sol/IBlacklist.json`);
  artifacts.SingletonFactory = await tryImport(`${artifact_dir}/interface/ISingletonFactory.sol/ISingletonFactory.json`);
  artifacts.Deployer = await tryImport(`${artifact_dir}/Deployer.sol/Deployer.json`);

  // aave imports
  artifacts.LendingPool = await tryImport(`${artifact_dir}/interface/AaveV2/ILendingPool.sol/ILendingPool.json`);
  artifacts.AToken = await tryImport(`${artifact_dir}/interface/AaveV2/IAToken.sol/IAToken.json`);
  artifacts.MockAToken = await tryImport(`${artifact_dir}/mocks/MockAToken.sol/MockAToken.json`);

  // compound imports
  artifacts.ICETH = await tryImport(`${artifact_dir}/interface/Compound/ICEth.sol/ICEth.json`);
  artifacts.ICERC20 = await tryImport(`${artifact_dir}/interface/Compound/ICErc20.sol/ICErc20.json`);
  artifacts.IComptroller = await tryImport(`${artifact_dir}/interface/Compound/IComptroller.sol/IComptroller.json`);
  artifacts.IComptrollerRinkeby = await tryImport(`${artifact_dir}/interface/Compound/IComptrollerRinkeby.sol/IComptrollerRinkeby.json`);

  // uniswapv3 imports
  artifacts.UniswapV3Factory = await tryImport("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
  artifacts.UniswapV3Pool = await tryImport("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
  artifacts.SwapRouter = await tryImport("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
  artifacts.NonfungiblePositionManager = await tryImport("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");

  // waave imports
  artifacts.IWaToken = await tryImport(`${artifact_dir}/interface/Waave/IWaToken.sol/IWaToken.json`);
  artifacts.IWaRegistry = await tryImport(`${artifact_dir}/interface/Waave/IWaRegistry.sol/IWaRegistry.json`);

  // yearn imports
  artifacts.YVault = await tryImport(`${artifact_dir}/interface/Yearn/IYVault.sol/IYVault.json`);

  // liquity imports
  artifacts.TroveManager = await tryImport(`${artifact_dir}/interface/Liquity/ITroveManager.sol/ITroveManager.json`);
  artifacts.LQTYStaking = await tryImport(`${artifact_dir}/interface/Liquity/ILQTYStaking.sol/ILQTYStaking.json`);
  artifacts.LQTYToken = await tryImport(`${artifact_dir}/interface/Liquity/ILQTYToken.sol/ILQTYToken.json`);
  artifacts.LUSDToken = await tryImport(`${artifact_dir}/interface/Liquity/ILUSDToken.sol/ILUSDToken.json`);
  artifacts.StabilityPool = await tryImport(`${artifact_dir}/interface/Liquity/IStabilityPool.sol/IStabilityPool.json`);

  // curve imports
  artifacts.CurveAddressProvider = await tryImport(`${artifact_dir}/interface/Curve/ICurveAddressProvider.sol/ICurveAddressProvider.json`);
  artifacts.CurveRegistry = await tryImport(`${artifact_dir}/interface/Curve/ICurveRegistry.sol/ICurveRegistry.json`);
  artifacts.CurvePool = await tryImport(`${artifact_dir}/interface/Curve/ICurvePool.sol/ICurvePool.json`);
  artifacts.CurveToken = await tryImport(`${artifact_dir}/interface/Curve/ICurveToken.sol/ICurveToken.json`);

  // sushiswap imports
  artifacts.SushiswapV2Factory = await tryImport(`${artifact_dir}/interface/SushiSwap/ISushiV2Factory.sol/ISushiV2Factory.json`);
  artifacts.MasterChef = await tryImport(`${artifact_dir}/interface/SushiSwap/IMasterChef.sol/IMasterChef.json`);
  artifacts.SushiLPToken = await tryImport(`${artifact_dir}/interface/SushiSwap/ISushiLPToken.sol/ISushiLPToken.json`);

  // uniswapv2 imports
  artifacts.UniswapV2Factory = await tryImport(`${artifact_dir}/interface/UniswapV2/IUniV2Factory.sol/IUniV2Factory.json`);
  artifacts.UniLPToken = await tryImport(`${artifact_dir}/interface/UniswapV2/IUniLPToken.sol/IUniLPToken.json`);

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

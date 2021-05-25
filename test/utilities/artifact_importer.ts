/**
 * Tools such as MythX require contracts to be preprocessed.
 * The main advantage of Artifact Importer is it's ability to seamlessly switch between raw and processed contracts.
 * It also removes repetitive code from the tests.
 */

import { config as dotenv_config } from 'dotenv';
dotenv_config();
import { ContractJSON } from 'ethereum-waffle/dist/esm/ContractJSON';

export interface ArtifactImports { [contract_name: string]: ContractJSON };

export const EMPTY_ARTIFACTS: ArtifactImports = {};

export async function import_artifacts() {
  let artifacts: ArtifactImports = {};

  // solace imports
  let artifact_dir = process.env.USE_PROCESSED_FILES === "true" ? "../../artifacts/contracts_processed" : "../../artifacts/contracts";
  artifacts.ClaimsAdjustor = await import(`${artifact_dir}/ClaimsAdjustor.sol/ClaimsAdjustor.json`);
  artifacts.ClaimsEscrow = await import(`${artifact_dir}/ClaimsEscrow.sol/ClaimsEscrow.json`);
  artifacts.CpFarm = await import(`${artifact_dir}/CpFarm.sol/CpFarm.json`);
  artifacts.LpAppraisor = await import(`${artifact_dir}/LpAppraisor.sol/LpAppraisor.json`);
  artifacts.Master = await import(`${artifact_dir}/Master.sol/Master.json`);
  artifacts.Registry = await import(`${artifact_dir}/Registry.sol/Registry.json`);
  artifacts.SOLACE = await import(`${artifact_dir}/SOLACE.sol/SOLACE.json`);
  artifacts.SolaceEthLpFarm = await import(`${artifact_dir}/SolaceEthLpFarm.sol/SolaceEthLpFarm.json`);
  artifacts.Treasury = await import (`${artifact_dir}/Treasury.sol/Treasury.json`);
  artifacts.WETH = await import(`${artifact_dir}/mocks/WETH9.sol/WETH9.json`);
  artifacts.Vault = await import(`${artifact_dir}/Vault.sol/Vault.json`);
  artifacts.MockERC20 = await import(`${artifact_dir}/mocks/MockERC20.sol/MockERC20.json`);
  artifacts.MockStrategy = await import(`${artifact_dir}/mocks/MockStrategy.sol/MockStrategy.json`);

  // uniswap imports
  artifacts.UniswapV3Factory = await import("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
  artifacts.UniswapV3Pool = await import("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
  artifacts.SwapRouter = await import("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
  artifacts.NonfungiblePositionManager = await import("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");

  return artifacts;
}

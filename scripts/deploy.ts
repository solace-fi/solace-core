import { waffle, ethers } from "hardhat";
const { deployContract } = waffle;
import { BigNumber as BN, Contract } from "ethers";

import { logContractAddress, createPool } from "./utils";
import { FeeAmount } from "../test/utilities/uniswap";

import SolaceArtifact from '../artifacts/contracts/SOLACE.sol/SOLACE.json';
import WETHArtifact from "../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json";
import MasterArtifact from '../artifacts/contracts/Master.sol/Master.json';
import VaultArtifact from '../artifacts/contracts/Vault.sol/Vault.json'
import CpFarmArtifact from "../artifacts/contracts/CpFarm.sol/CpFarm.json";
import SolaceEthLpFarmArtifact from "../artifacts/contracts/SolaceEthLpFarm.sol/SolaceEthLpFarm.json";
import TreasuryArtifact from "../artifacts/contracts/Treasury.sol/Treasury.json";
import RegistryArtifact from "../artifacts/contracts/Registry.sol/Registry.json";
import ClaimsAdjustorArtifact from '../artifacts/contracts/ClaimsAdjustor.sol/ClaimsAdjustor.json';
import ClaimsEscrowArtifact from '../artifacts/contracts/ClaimsEscrow.sol/ClaimsEscrow.json';
import { Solace, Vault, Master, MockWeth, CpFarm, SolaceEthLpFarm, Treasury, Registry, ClaimsAdjustor, ClaimsEscrow } from "../typechain";

// uniswap imports
import UniswapV3FactoryArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3PoolArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import SwapRouterArtifact from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";
import NonfungiblePositionManagerArtifact from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('')
  logContractAddress("Contract Name", "Address")
  console.log("-----------------------------------------------------------");

  /*
   * deploy Registry
   */
  let registry = (await deployContract(deployer,RegistryArtifact)) as Registry;
  logContractAddress("Registry", registry.address);
  /*
   * deploy SOLACE
   */
  let solace = (await deployContract(deployer, SolaceArtifact)) as Solace;
  logContractAddress("SOLACE", solace.address);
  await registry.setSolace(solace.address);
  /*
   * deploy WETH
   */
  let mockWETH = (await deployContract(deployer,WETHArtifact)) as MockWeth;
  logContractAddress("WETH", mockWETH.address);
  /*
   * deploy Master
   */
  let master = (await deployContract(deployer,MasterArtifact,[solace.address,200])) as Master;
  logContractAddress("Master", master.address);
  await registry.setMaster(master.address);
  /*
   * deploy Vault
   */
  let vault = (await deployContract(deployer,VaultArtifact,[registry.address,mockWETH.address])) as Vault;
  logContractAddress("Vault", vault.address);
  await registry.setVault(vault.address);
  /*
   * deploy CP Farm
   */
  let cpFarm = (await deployContract(deployer,CpFarmArtifact,[master.address,vault.address,solace.address,0,2000])) as CpFarm;
  logContractAddress("CpFarm", cpFarm.address);
  await master.registerFarm(cpFarm.address, 50);
  /*
   * deploy Uniswap and Uniswap accessories
   */
  // deploy uniswap factory
  let uniswapFactory = (await deployContract(deployer,UniswapV3FactoryArtifact)) as Contract;
  logContractAddress("UniswapFactory", uniswapFactory.address);
  // deploy uniswap router
  let uniswapRouter = (await deployContract(deployer,SwapRouterArtifact,[uniswapFactory.address,mockWETH.address])) as Contract;
  logContractAddress("UniswapRouter", uniswapRouter.address);
  // deploy uniswap nft / lp token
  let lpToken = (await deployContract(deployer,NonfungiblePositionManagerArtifact,[uniswapFactory.address,mockWETH.address,ZERO_ADDRESS])) as Contract;
  logContractAddress("UniswapLpToken", lpToken.address);
  // create uniswap solace-weth pool
  let pool = await createPool(deployer, uniswapFactory, mockWETH.address, solace.address, FeeAmount.MEDIUM);
  logContractAddress("UniswapPool", pool.address);
  /*
   * deploy LP Farm
   */
  let lpFarm = (await deployContract(deployer,SolaceEthLpFarmArtifact,[master.address,lpToken.address,solace.address,0,2000,pool.address,mockWETH.address])) as SolaceEthLpFarm;
  logContractAddress("LpFarm", lpFarm.address);
  await master.registerFarm(lpFarm.address, 50);
  /*
   * deploy Treasury
   */
  let treasury = (await deployContract(deployer,TreasuryArtifact,[solace.address,uniswapRouter.address,mockWETH.address])) as Treasury;
  logContractAddress("Treasury", treasury.address);
  await registry.setTreasury(treasury.address);
  /*
   * deploy Claims Escrow
   */
   let claimsEscrow = (await deployContract(deployer,ClaimsEscrowArtifact,[registry.address])) as ClaimsEscrow;
   logContractAddress("ClaimsEscrow", claimsEscrow.address);
   /*
    * deploy Claims Adjuster
    */
   let claimsAdjustor = (await deployContract(deployer,ClaimsAdjustorArtifact,[registry.address])) as ClaimsAdjustor;
   logContractAddress("ClaimsAdjustor", claimsAdjustor.address);

   console.log(``);
   console.log(`Copy and paste this into the .env file in the frontend client.`)
   console.log(``);
   console.log(`REACT_APP_REGISTRY_CONTRACT_ADDRESS=${registry.address}`);
   console.log(`REACT_APP_SOLACE_CONTRACT_ADDRESS=${solace.address}`);
   console.log(`REACT_APP_WETH_CONTRACT_ADDRESS=${mockWETH.address}`);
   console.log(`REACT_APP_MASTER_CONTRACT_ADDRESS=${master.address}`);
   console.log(`REACT_APP_CPFARM_CONTRACT_ADDRESS=${cpFarm.address}`);
   console.log(`REACT_APP_LPFARM_CONTRACT_ADDRESS=${lpFarm.address}`);
   console.log(`REACT_APP_VAULT_CONTRACT_ADDRESS=${vault.address}`);
   console.log(`REACT_APP_TREASURY_CONTRACT_ADDRESS=${treasury.address}`);
   console.log(`REACT_APP_CLAIMS_ESCROW_CONTRACT_ADDRESS=${claimsEscrow.address}`);
   console.log(`REACT_APP_CLAIMS_ADJUSTOR_CONTRACT_ADDRESS=${claimsAdjustor.address}`);
   console.log(`REACT_APP_UNISWAP_FACTORY_CONTRACT_ADDRESS=${uniswapFactory.address}`);
   console.log(`REACT_APP_UNISWAP_ROUTER_CONTRACT_ADDRESS=${uniswapRouter.address}`);
   console.log(`REACT_APP_UNISWAP_LPTOKEN_CONTRACT_ADDRESS=${lpToken.address}`);
   console.log(`REACT_APP_UNISWAP_POOL_CONTRACT_ADDRESS=${pool.address}`);
   console.log('')
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { deployContract, provider } = waffle;
import { BigNumber as BN, Contract } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();
import { LedgerSigner } from "@ethersproject/hardware-wallets";
const ledgerSigner = new LedgerSigner(provider);

import { logContractAddress, createPool } from "./utils";
import { FeeAmount } from "../test/utilities/uniswap";

import SolaceArtifact from "../artifacts/contracts/SOLACE.sol/SOLACE.json";
import MasterArtifact from "../artifacts/contracts/Master.sol/Master.json";
import VaultArtifact from "../artifacts/contracts/Vault.sol/Vault.json"
import CpFarmArtifact from "../artifacts/contracts/CpFarm.sol/CpFarm.json";
import SolaceEthLpFarmArtifact from "../artifacts/contracts/SolaceEthLpFarm.sol/SolaceEthLpFarm.json";
import TreasuryArtifact from "../artifacts/contracts/Treasury.sol/Treasury.json";
import RegistryArtifact from "../artifacts/contracts/Registry.sol/Registry.json";
import { Solace, Vault, Master, CpFarm, SolaceEthLpFarm, Treasury, Registry } from "../typechain";

// uniswap imports
import UniswapV3FactoryArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3PoolArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import SwapRouterArtifact from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";
import NonfungiblePositionManagerArtifact from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";

const MULTI_SIG_ADDRESS = "0xB0bcf50b18f0DCa889EdC4a299aF4cEd7cB4cb17";
const WETH_ADDRESS = "0x9273113C307f2f795C6d4D25c436d85435c73f9f"
const UNISWAP_FACTORY_ADDRESS = "0x815BCC87613315327E04e4A3b7c96a79Ae80760c";
const UNISWAP_ROUTER_ADDRESS = "0x483B27F0cF5AF935371d52A7F810799cD141E3dc";
const UNISWAP_LPTOKEN_ADDRESS = "0x3255160392215494bee8B5aBf8C4C40965d0986C";
const BLOCK_REWARD = BN.from("17361000000000000"); // 100 solace per day
const HUNDRED_MILLION = BN.from("100000000");

async function main() {
  // deploy Registry
  console.log("Deploying Registry");
  let registry = (await deployContract(ledgerSigner, RegistryArtifact, [await ledgerSigner.getAddress()])) as Registry;
  console.log(`Deployed Registry to ${registry.address}`);

  // deploy SOLACE
  console.log("Deploying SOLACE");
  let solace = (await deployContract(ledgerSigner, SolaceArtifact, [MULTI_SIG_ADDRESS])) as Solace;
  await registry.setSolace(solace.address);
  console.log(`Deployed SOLACE to ${solace.address}`);

  // deploy Master
  console.log("Deploying Master");
  let master = (await deployContract(ledgerSigner,MasterArtifact,[MULTI_SIG_ADDRESS,solace.address,BLOCK_REWARD])) as Master;
  await registry.setMaster(master.address);
  console.log(`Deployed Master to ${master.address}`);

  // deploy Vault
  console.log("Deploying Vault");
  let vault = (await deployContract(ledgerSigner,VaultArtifact,[MULTI_SIG_ADDRESS,registry.address,WETH_ADDRESS])) as Vault;
  await registry.setVault(vault.address);
  console.log(`Deployed Vault to ${vault.address}`);

  // deploy CP Farm
  console.log("Deploying CP Farm");
  let cpFarm = (await deployContract(ledgerSigner,CpFarmArtifact,[MULTI_SIG_ADDRESS,master.address,vault.address,solace.address,0,HUNDRED_MILLION])) as CpFarm;
  console.log(`Deployed CP Farm to ${cpFarm.address}`);

  // deploy Uniswap and Uniswap accessories
  // deploy uniswap factory
  let uniswapFactory = await ethers.getContractAt(UniswapV3FactoryArtifact.abi, UNISWAP_FACTORY_ADDRESS);
  // deploy uniswap router
  let uniswapRouter = await ethers.getContractAt(SwapRouterArtifact.abi, UNISWAP_ROUTER_ADDRESS);
  // deploy uniswap nft / lp token
  let lpToken = await ethers.getContractAt(NonfungiblePositionManagerArtifact.abi, UNISWAP_LPTOKEN_ADDRESS);
  // create uniswap solace-weth pool
  console.log("Deploying SOLACE-ETH Pool");
  let pool = await createPool(ledgerSigner, uniswapFactory, WETH_ADDRESS, solace.address, FeeAmount.MEDIUM);
  console.log(`Deployed SOLACE-ETH pool to ${pool.address}`);

  // deploy LP Farm
  let lpFarm = (await deployContract(ledgerSigner,SolaceEthLpFarmArtifact,[MULTI_SIG_ADDRESS,master.address,lpToken.address,solace.address,0,HUNDRED_MILLION,pool.address,WETH_ADDRESS])) as SolaceEthLpFarm;
  console.log(`Deployed LP Farm to ${lpFarm.address}`);

  // deploy Treasury
  console.log("Deploying Treasury");
  let treasury = (await deployContract(ledgerSigner,TreasuryArtifact,[solace.address,uniswapRouter.address,WETH_ADDRESS])) as Treasury;
  await registry.setTreasury(treasury.address);
  console.log(`Deployed Treasury to ${treasury.address}`);

  console.log("Transfering Registry");
  await registry.connect(ledgerSigner).setGovernance(MULTI_SIG_ADDRESS);

  console.log("")
  logContractAddress("Contract Name", "Address")
  console.log("-----------------------------------------------------------");
  logContractAddress("Registry", registry.address);
  logContractAddress("SOLACE", solace.address);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("Vault", vault.address);
  logContractAddress("Master", master.address);
  logContractAddress("CpFarm", cpFarm.address);
  logContractAddress("LpFarm", lpFarm.address);
  logContractAddress("Treasury", treasury.address);
  logContractAddress("UniswapFactory", uniswapFactory.address);
  logContractAddress("UniswapRouter", uniswapRouter.address);
  logContractAddress("UniswapLpToken", lpToken.address);
  logContractAddress("UniswapPool", pool.address);

  console.log(``);
  console.log(`Copy and paste this into the .env file in the frontend client.`)
  console.log(``);
  console.log(`REACT_APP_REGISTRY_CONTRACT_ADDRESS=${registry.address}`);
  console.log(`REACT_APP_SOLACE_CONTRACT_ADDRESS=${solace.address}`);
  console.log(`REACT_APP_WETH_CONTRACT_ADDRESS=${WETH_ADDRESS}`);
  console.log(`REACT_APP_MASTER_CONTRACT_ADDRESS=${master.address}`);
  console.log(`REACT_APP_CPFARM_CONTRACT_ADDRESS=${cpFarm.address}`);
  console.log(`REACT_APP_LPFARM_CONTRACT_ADDRESS=${lpFarm.address}`);
  console.log(`REACT_APP_VAULT_CONTRACT_ADDRESS=${vault.address}`);
  console.log(`REACT_APP_TREASURY_CONTRACT_ADDRESS=${treasury.address}`);
  console.log(`REACT_APP_UNISWAP_FACTORY_CONTRACT_ADDRESS=${uniswapFactory.address}`);
  console.log(`REACT_APP_UNISWAP_ROUTER_CONTRACT_ADDRESS=${uniswapRouter.address}`);
  console.log(`REACT_APP_UNISWAP_LPTOKEN_CONTRACT_ADDRESS=${lpToken.address}`);
  console.log(`REACT_APP_UNISWAP_POOL_CONTRACT_ADDRESS=${pool.address}`);
  console.log("")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

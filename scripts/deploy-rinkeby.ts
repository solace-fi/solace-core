import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { deployContract, provider } = waffle;
import { BigNumber as BN, Contract } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();
import { LedgerSigner } from "@ethersproject/hardware-wallets";
const deployer = new LedgerSigner(provider);

import { logContractAddress, createPool } from "./utils";
import { FeeAmount } from "../test/utilities/uniswap";

import SolaceArtifact from "../artifacts/contracts/SOLACE.sol/SOLACE.json";
import MasterArtifact from "../artifacts/contracts/Master.sol/Master.json";
import WETHArtifact from "../artifacts/contracts/mocks/MockWETH.sol/MockWETH.json";
import VaultArtifact from "../artifacts/contracts/Vault.sol/Vault.json"
import CpFarmArtifact from "../artifacts/contracts/CpFarm.sol/CpFarm.json";
import SolaceEthLpFarmArtifact from "../artifacts/contracts/SolaceEthLpFarm.sol/SolaceEthLpFarm.json";
import TreasuryArtifact from "../artifacts/contracts/Treasury.sol/Treasury.json";
import RegistryArtifact from "../artifacts/contracts/Registry.sol/Registry.json";
import { Solace, MockWeth, Vault, Master, CpFarm, SolaceEthLpFarm, Treasury, Registry } from "../typechain";

// uniswap imports
import UniswapV3FactoryArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import UniswapV3PoolArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import SwapRouterArtifact from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";
import NonfungiblePositionManagerArtifact from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MULTI_SIG_ADDRESS = "0xB0bcf50b18f0DCa889EdC4a299aF4cEd7cB4cb17";

// These will be empty strings before deployment.
// Fill them in as they are deployed.
// In case of failure during deployment, simply rerun the script.
// Contracts that have already been deployed will not be redeployed.
const REGISTRY_ADDRESS        = "0x218EEa1517F9CCc0f115fea6cd48f55afD49a3f8";
const SOLACE_ADDRESS          = "0x44B843794416911630e74bAB05021458122c40A0";
const WETH_ADDRESS            = "0x9273113C307f2f795C6d4D25c436d85435c73f9f"
const MASTER_ADDRESS          = "0xE458cd47D29E06CCe18a1D95AD2712F223d3a6DC";
const VAULT_ADDRESS           = "0x7DC316cC09C8A081d4Bfb632b5c3F4631d06E5A4";
const CPFARM_ADDRESS          = "0x0f56D2086779d41d95DfbA92B1aa705E75DDb991";
const LPFARM_ADDRESS          = "0x56D7cCbe87653b9d10be80D1eCC49cD48e32C881";
const TREASURY_ADDRESS        = "0x138f8EfdEbd74c613EeEF89D8157bb4481EDf8A3";
const UNISWAP_POOL_ADDRESS    = "0x4e05423247BD4f836C05281e5511633e22b9afcb";
const UNISWAP_FACTORY_ADDRESS = "0x815BCC87613315327E04e4A3b7c96a79Ae80760c";
const UNISWAP_ROUTER_ADDRESS  = "0x483B27F0cF5AF935371d52A7F810799cD141E3dc";
const UNISWAP_LPTOKEN_ADDRESS = "0x3255160392215494bee8B5aBf8C4C40965d0986C";

// farm params
const START_BLOCK = BN.from(8523000); // May 3, 2021 on Rinkeby
const END_BLOCK = START_BLOCK.add(2500000); // little over a year
const BLOCK_REWARD = BN.from("60000000000000000000"); // 60 SOLACE

let registry: Registry;
let solace: Solace;
let weth: MockWeth;
let master: Master;
let vault: Vault;
let cpFarm: CpFarm;
let lpFarm: SolaceEthLpFarm;
let treasury: Treasury;
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let lpToken: Contract;
let pool: Contract;

let signerAddress: string;
let governorAddress = MULTI_SIG_ADDRESS;

async function main() {
  signerAddress = await deployer.getAddress();

  await deployRegistry();
  await deploySolace();
  await deployWeth();
  await deployUniswapFactory();
  await deployUniswapRouter();
  await deployUniswapLpToken();
  await deployUniswapPool();
  await deployVault();
  await deployMaster();
  await deployCpFarm();
  await deployLpFarm();
  await deployTreasury();
  await transferRegistry();
  await logAddresses();
}

async function deployRegistry() {
  if(!!REGISTRY_ADDRESS) {
    registry = (await ethers.getContractAt(RegistryArtifact.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry");
    registry = (await deployContract(deployer, RegistryArtifact, [signerAddress])) as Registry;
    console.log(`Deployed Registry to ${registry.address}`);
  }
}

async function deploySolace() {
  if(!!SOLACE_ADDRESS) {
    solace = (await ethers.getContractAt(SolaceArtifact.abi, SOLACE_ADDRESS)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    solace = (await deployContract(deployer, SolaceArtifact, [governorAddress])) as Solace;
    console.log(`Deployed SOLACE to ${solace.address}`);
  }
  if(await registry.solace() != solace.address && await registry.governance() == signerAddress) {
    console.log("Registering SOLACE");
    await registry.connect(deployer).setSolace(solace.address);
  }
}

async function deployWeth() {
  if(!!WETH_ADDRESS) {
    weth = (await ethers.getContractAt(WETHArtifact.abi, WETH_ADDRESS)) as MockWeth;
  } else {
    console.log("Deploying WETH");
    weth = (await deployContract(deployer, WETHArtifact)) as MockWeth;
    console.log(`Deployed WETH to ${weth.address}`);
  }
}

async function deployMaster() {
  if(!!MASTER_ADDRESS) {
    master = (await ethers.getContractAt(MasterArtifact.abi, MASTER_ADDRESS)) as Master;
  } else {
    console.log("Deploying Master");
    master = (await deployContract(deployer,MasterArtifact,[governorAddress,solace.address,BLOCK_REWARD])) as Master;
    console.log(`Deployed Master to ${master.address}`);
  }
  if(await registry.master() != master.address && await registry.governance() == signerAddress) {
    console.log("Registering Master");
    await registry.connect(deployer).setMaster(master.address);
  }
}

async function deployVault() {
  if(!!VAULT_ADDRESS) {
    vault = (await ethers.getContractAt(VaultArtifact.abi, VAULT_ADDRESS)) as Vault;
  } else {
    console.log("Deploying Vault");
    vault = (await deployContract(deployer,VaultArtifact,[governorAddress,registry.address,weth.address])) as Vault;
    console.log(`Deployed Vault to ${vault.address}`);
  }
  if(await registry.vault() != vault.address && await registry.governance() == signerAddress) {
    console.log("Registering Vault");
    await registry.connect(deployer).setVault(vault.address);
  }
}

async function deployCpFarm() {
  if(!!CPFARM_ADDRESS) {
    cpFarm = (await ethers.getContractAt(CpFarmArtifact.abi, CPFARM_ADDRESS)) as CpFarm;
  } else {
    console.log("Deploying CP Farm");
    cpFarm = (await deployContract(deployer,CpFarmArtifact,[governorAddress,master.address,vault.address,solace.address,START_BLOCK,END_BLOCK,uniswapRouter.address,weth.address])) as CpFarm;
    console.log(`Deployed CP Farm to ${cpFarm.address}`);
  }
}

async function deployUniswapFactory() {
  if(!!UNISWAP_FACTORY_ADDRESS) {
    uniswapFactory = await ethers.getContractAt(UniswapV3FactoryArtifact.abi, UNISWAP_FACTORY_ADDRESS);
  } else {
    console.log("Deploying Uniswap Factory");
    uniswapFactory = await deployContract(deployer,UniswapV3FactoryArtifact);
    console.log(`Deployed Uniswap Factory to ${uniswapFactory.address}`);
  }
}

async function deployUniswapRouter() {
  if(!!UNISWAP_ROUTER_ADDRESS) {
    uniswapRouter = await ethers.getContractAt(SwapRouterArtifact.abi, UNISWAP_ROUTER_ADDRESS);
  } else {
    console.log("Deploying Uniswap Router");
    uniswapRouter = await deployContract(deployer,SwapRouterArtifact,[uniswapFactory.address,weth.address]);
    console.log(`Deployed Uniswap Router to ${uniswapRouter.address}`);
  }
}

async function deployUniswapLpToken() {
  if(!!UNISWAP_LPTOKEN_ADDRESS) {
    lpToken = await ethers.getContractAt(NonfungiblePositionManagerArtifact.abi, UNISWAP_LPTOKEN_ADDRESS);
  } else {
    console.log("Deploying Uniswap LP Token");
    lpToken = await deployContract(deployer,NonfungiblePositionManagerArtifact,[uniswapFactory.address,weth.address,ZERO_ADDRESS]);
    console.log(`Deployed Uniswap LP Token to ${lpToken.address}`);
  }
}

async function deployUniswapPool() {
  if(!!UNISWAP_POOL_ADDRESS) {
    pool = await ethers.getContractAt(UniswapV3PoolArtifact.abi, UNISWAP_POOL_ADDRESS);
  } else {
    console.log("Deploying then initializing SOLACE-ETH Pool");
    pool = await createPool(deployer, uniswapFactory, weth.address, solace.address, FeeAmount.MEDIUM);
    console.log(`Deployed SOLACE-ETH pool to ${pool.address}`);
  }
}

async function deployLpFarm() {
  if(!!LPFARM_ADDRESS) {
    lpFarm = (await ethers.getContractAt(SolaceEthLpFarmArtifact.abi, LPFARM_ADDRESS)) as SolaceEthLpFarm;
  } else {
    console.log("Deploying LP Farm");
    lpFarm = (await deployContract(deployer,SolaceEthLpFarmArtifact,[governorAddress,master.address,lpToken.address,solace.address,START_BLOCK,END_BLOCK,pool.address,weth.address])) as SolaceEthLpFarm;
    console.log(`Deployed LP Farm to ${lpFarm.address}`);
  }
}

async function deployTreasury() {
  if(!!TREASURY_ADDRESS) {
    treasury = (await ethers.getContractAt(TreasuryArtifact.abi, TREASURY_ADDRESS)) as Treasury;
  } else {
    console.log("Deploying Treasury");
    treasury = (await deployContract(deployer,TreasuryArtifact,[governorAddress,solace.address,uniswapRouter.address,weth.address])) as Treasury;
    console.log(`Deployed Treasury to ${treasury.address}`);
  }
  if(await registry.treasury() != treasury.address && await registry.governance() == signerAddress) {
    console.log("Registering Treasury");
    await registry.connect(deployer).setTreasury(treasury.address);
  }
}

async function transferRegistry() {
  if(await registry.governance() == signerAddress) {
    console.log("Transfering Registry");
    await registry.connect(deployer).setGovernance(governorAddress);
  }
}

async function logAddresses() {
  console.log("")
  logContractAddress("Contract Name", "Address")
  console.log("-----------------------------------------------------------");
  logContractAddress("Registry", registry.address);
  logContractAddress("SOLACE", solace.address);
  logContractAddress("WETH", weth.address);
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
  console.log(`REACT_APP_WETH_CONTRACT_ADDRESS=${weth.address}`);
  console.log(`REACT_APP_MASTER_CONTRACT_ADDRESS=${master.address}`);
  console.log(`REACT_APP_CPFARM_CONTRACT_ADDRESS=${cpFarm.address}`);
  console.log(`REACT_APP_VAULT_CONTRACT_ADDRESS=${vault.address}`);
  console.log(`REACT_APP_LPFARM_CONTRACT_ADDRESS=${lpFarm.address}`);
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

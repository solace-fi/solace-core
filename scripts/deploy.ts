import { waffle, ethers } from "hardhat";
const { deployContract } = waffle;
import { BigNumber as BN, Contract, Signer, Wallet } from "ethers";
const fs = require("fs");
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

// These will be empty strings before deployment.
// Fill them in as they are deployed.
// In case of failure during deployment, simply rerun the script.
// Contracts that have already been deployed will not be redeployed.
const REGISTRY_ADDRESS        = "";
const SOLACE_ADDRESS          = "";
const WETH_ADDRESS            = ""
const MASTER_ADDRESS          = "";
const VAULT_ADDRESS           = "";
const CPFARM_ADDRESS          = "";
const LPFARM_ADDRESS          = "";
const TREASURY_ADDRESS        = "";
const CLAIMS_ESCROW_ADDRESS   = "";
const CLAIMS_ADJUSTOR_ADDRESS = "";
const UNISWAP_POOL_ADDRESS    = "";
const UNISWAP_FACTORY_ADDRESS = "";
const UNISWAP_ROUTER_ADDRESS  = "";
const UNISWAP_LPTOKEN_ADDRESS = "";

// farm params
const START_BLOCK = BN.from(0);
const END_BLOCK = BN.from(2102400); // one year
const BLOCK_REWARD = BN.from("60000000000000000000"); // 60 SOLACE

let registry: Registry;
let solace: Solace;
let weth: MockWeth;
let master: Master;
let vault: Vault;
let cpFarm: CpFarm;
let lpFarm: SolaceEthLpFarm;
let treasury: Treasury;
let claimsAdjustor: ClaimsAdjustor;
let claimsEscrow: ClaimsEscrow;
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let lpToken: Contract;
let pool: Contract;

let deployer: Signer;
let governor: Signer;
let signerAddress: string;
let governorAddress: string;

async function main() {
  [deployer, governor] = await ethers.getSigners();
  signerAddress = await deployer.getAddress();
  governorAddress = await governor.getAddress();

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
  await deployClaimsEscrow();
  await deployClaimsAdjustor();
  await transferRegistry();
  await distributeSolace();
  await logAddresses();
}

async function deployRegistry() {
  if(!!REGISTRY_ADDRESS) {
    registry = (await ethers.getContractAt(RegistryArtifact.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry");
    registry = (await deployContract(deployer, RegistryArtifact, [signerAddress])) as Registry;
    console.log(`Deploying Registry to ${registry.address}`);
    await registry.deployed();
    console.log("Deployment confirmed");
  }
}

async function deploySolace() {
  if(!!SOLACE_ADDRESS) {
    solace = (await ethers.getContractAt(SolaceArtifact.abi, SOLACE_ADDRESS)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    solace = (await deployContract(deployer, SolaceArtifact, [governorAddress])) as Solace;
    console.log(`Deploying SOLACE to ${solace.address}`);
    await solace.deployed();
    console.log("Deployment confirmed");
  }
  if(await registry.solace() != solace.address && await registry.governance() == signerAddress) {
    console.log("Registering SOLACE");
    let tx = await registry.connect(deployer).setSolace(solace.address);
    await tx.wait();
    console.log("Registration confirmed");
  }
}

async function deployWeth() {
  if(!!WETH_ADDRESS) {
    weth = (await ethers.getContractAt(WETHArtifact.abi, WETH_ADDRESS)) as MockWeth;
  } else {
    console.log("Deploying WETH");
    weth = (await deployContract(deployer, WETHArtifact)) as MockWeth;
    console.log(`Deploying WETH to ${weth.address}`);
    await weth.deployed();
    console.log("Deployment confirmed");
  }
}

async function deployMaster() {
  if(!!MASTER_ADDRESS) {
    master = (await ethers.getContractAt(MasterArtifact.abi, MASTER_ADDRESS)) as Master;
  } else {
    console.log("Deploying Master");
    master = (await deployContract(deployer,MasterArtifact,[governorAddress,solace.address,BLOCK_REWARD])) as Master;
    console.log(`Deploying Master to ${master.address}`);
    await master.deployed();
    console.log("Deployment confirmed");
  }
  if(await registry.master() != master.address && await registry.governance() == signerAddress) {
    console.log("Registering Master");
    let tx = await registry.connect(deployer).setMaster(master.address);
    await tx.wait();
    console.log("Registration confirmed");
  }
}

async function deployVault() {
  if(!!VAULT_ADDRESS) {
    vault = (await ethers.getContractAt(VaultArtifact.abi, VAULT_ADDRESS)) as Vault;
  } else {
    console.log("Deploying Vault");
    vault = (await deployContract(deployer,VaultArtifact,[governorAddress,registry.address,weth.address])) as Vault;
    console.log(`Deploying Vault to ${vault.address}`);
    await vault.deployed();
    console.log("Deployment confirmed");
  }
  if(await registry.vault() != vault.address && await registry.governance() == signerAddress) {
    console.log("Registering Vault");
    let tx = await registry.connect(deployer).setVault(vault.address);
    await tx.wait();
    console.log("Registration confirmed");
  }
}

async function deployCpFarm() {
  if(!!CPFARM_ADDRESS) {
    cpFarm = (await ethers.getContractAt(CpFarmArtifact.abi, CPFARM_ADDRESS)) as CpFarm;
  } else {
    console.log("Deploying CP Farm");
    cpFarm = (await deployContract(deployer,CpFarmArtifact,[governorAddress,master.address,vault.address,solace.address,START_BLOCK,END_BLOCK,uniswapRouter.address,weth.address])) as CpFarm;
    console.log(`Deploying CP Farm to ${cpFarm.address}`);
    await cpFarm.deployed();
    console.log("Deployment confirmed");
  }
  if((await master.farmIndices(cpFarm.address)).eq(0)) {
    console.log("Registering CP Farm");
    let tx = await master.connect(governor).registerFarm(cpFarm.address, 50);
    await tx.wait();
    console.log("Registration confirmed");
  }
}

async function deployUniswapFactory() {
  if(!!UNISWAP_FACTORY_ADDRESS) {
    uniswapFactory = await ethers.getContractAt(UniswapV3FactoryArtifact.abi, UNISWAP_FACTORY_ADDRESS);
  } else {
    console.log("Deploying Uniswap Factory");
    uniswapFactory = await deployContract(deployer,UniswapV3FactoryArtifact);
    console.log(`Deploying Uniswap Factory to ${uniswapFactory.address}`);
    await uniswapFactory.deployed();
    console.log("Deployment confirmed");
  }
}

async function deployUniswapRouter() {
  if(!!UNISWAP_ROUTER_ADDRESS) {
    uniswapRouter = await ethers.getContractAt(SwapRouterArtifact.abi, UNISWAP_ROUTER_ADDRESS);
  } else {
    console.log("Deploying Uniswap Router");
    uniswapRouter = await deployContract(deployer,SwapRouterArtifact,[uniswapFactory.address,weth.address]);
    console.log(`Deploying Uniswap Router to ${uniswapRouter.address}`);
    await uniswapRouter.deployed();
    console.log("Deployment confirmed");
  }
}

async function deployUniswapLpToken() {
  if(!!UNISWAP_LPTOKEN_ADDRESS) {
    lpToken = await ethers.getContractAt(NonfungiblePositionManagerArtifact.abi, UNISWAP_LPTOKEN_ADDRESS);
  } else {
    console.log("Deploying Uniswap LP Token");
    lpToken = await deployContract(deployer,NonfungiblePositionManagerArtifact,[uniswapFactory.address,weth.address,ZERO_ADDRESS]);
    console.log(`Deploying Uniswap LP Token to ${lpToken.address}`);
    await lpToken.deployed();
    console.log("Deployment confirmed");
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
    console.log(`Deploying LP Farm to ${lpFarm.address}`);
    await lpFarm.deployed();
    console.log("Deployment confirmed");
  }
  if((await master.farmIndices(lpFarm.address)).eq(0)) {
    console.log("Registering LP Farm");
    let tx = await master.connect(governor).registerFarm(lpFarm.address, 50);
    await tx.wait();
    console.log("Registration confirmed");
  }
}

async function deployTreasury() {
  if(!!TREASURY_ADDRESS) {
    treasury = (await ethers.getContractAt(TreasuryArtifact.abi, TREASURY_ADDRESS)) as Treasury;
  } else {
    console.log("Deploying Treasury");
    treasury = (await deployContract(deployer,TreasuryArtifact,[governorAddress,solace.address,uniswapRouter.address,weth.address])) as Treasury;
    console.log(`Deploying Treasury to ${treasury.address}`);
    await treasury.deployed();
    console.log("Deployment confirmed");
  }
  if(await registry.treasury() != treasury.address && await registry.governance() == signerAddress) {
    console.log("Registering Treasury");
    let tx = await registry.connect(deployer).setTreasury(treasury.address);
    await tx.wait();
    console.log("Registration confirmed");
  }
}

async function deployClaimsEscrow() {
  if(!!CLAIMS_ESCROW_ADDRESS) {
    claimsEscrow = (await ethers.getContractAt(ClaimsEscrowArtifact.abi, CLAIMS_ESCROW_ADDRESS)) as ClaimsEscrow;
  }
  else {
    console.log("Deploying Claims Escrow");
    claimsEscrow = (await deployContract(deployer,ClaimsEscrowArtifact,[registry.address])) as ClaimsEscrow;
    console.log(`Deploying Claims Escrow to ${claimsEscrow.address}`);
    await claimsEscrow.deployed();
    console.log("Deployment confirmed");
  }
  if(await registry.claimsEscrow() != claimsEscrow.address && await registry.governance() == signerAddress) {
    console.log("Registering Claims Escrow");
    let tx = await registry.connect(deployer).setClaimsEscrow(claimsEscrow.address);
    await tx.wait();
    console.log("Registration confirmed");
  }
}

async function deployClaimsAdjustor() {
  if(!!CLAIMS_ADJUSTOR_ADDRESS) {
    claimsAdjustor = (await ethers.getContractAt(ClaimsAdjustorArtifact.abi, CLAIMS_ADJUSTOR_ADDRESS)) as ClaimsAdjustor;
  }
  else {
    console.log("Deploying Claims Adjustor");
    claimsAdjustor = (await deployContract(deployer,ClaimsAdjustorArtifact,[registry.address])) as ClaimsAdjustor;
    console.log(`Deploying Claims Adjustor to ${claimsAdjustor.address}`);
    await claimsAdjustor.deployed();
    console.log("Deployment confirmed");
  }
  if(await registry.claimsAdjustor() != claimsAdjustor.address && await registry.governance() == signerAddress) {
    console.log("Registering Claims Adjustor");
    let tx = await registry.connect(deployer).setClaimsAdjustor(claimsAdjustor.address);
    await tx.wait();
    console.log("Registration confirmed");
  }
}

async function transferRegistry() {
  if(await registry.governance() == signerAddress) {
    console.log("Transfering Registry");
    let tx = await registry.connect(deployer).setGovernance(governorAddress);
    await tx.wait();
    console.log("Registry transfer confirmed");
  }
}

async function distributeSolace() {
  console.log("Minting one million SOLACE to Master");
  const ONE_MILLION_ETHER = BN.from("1000000000000000000000000");
  let tx = await solace.connect(governor).mint(master.address, ONE_MILLION_ETHER);
  await tx.wait();
  console.log("Mint confirmed");
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
  logContractAddress("ClaimsEscrow", claimsEscrow.address);
  logContractAddress("ClaimsAdjustor", claimsAdjustor.address);
  logContractAddress("UniswapFactory", uniswapFactory.address);
  logContractAddress("UniswapRouter", uniswapRouter.address);
  logContractAddress("UniswapLpToken", lpToken.address);
  logContractAddress("UniswapPool", pool.address);

  let react_str = `
REACT_APP_REGISTRY_CONTRACT_ADDRESS=${registry.address}
REACT_APP_SOLACE_CONTRACT_ADDRESS=${solace.address}
REACT_APP_WETH_CONTRACT_ADDRESS=${weth.address}
REACT_APP_MASTER_CONTRACT_ADDRESS=${master.address}
REACT_APP_CPFARM_CONTRACT_ADDRESS=${cpFarm.address}
REACT_APP_VAULT_CONTRACT_ADDRESS=${vault.address}
REACT_APP_LPFARM_CONTRACT_ADDRESS=${lpFarm.address}
REACT_APP_TREASURY_CONTRACT_ADDRESS=${treasury.address}
REACT_APP_CLAIMS_ESCROW_CONTRACT_ADDRESS=${claimsEscrow.address}
REACT_APP_CLAIMS_ADJUSTOR_CONTRACT_ADDRESS=${claimsAdjustor.address}
REACT_APP_UNISWAP_FACTORY_CONTRACT_ADDRESS=${uniswapFactory.address}
REACT_APP_UNISWAP_ROUTER_CONTRACT_ADDRESS=${uniswapRouter.address}
REACT_APP_UNISWAP_LPTOKEN_CONTRACT_ADDRESS=${lpToken.address}
REACT_APP_UNISWAP_POOL_CONTRACT_ADDRESS=${pool.address}
`;

  console.log(`Copy and paste this into the .env file in the frontend client.`)
  console.log(react_str);
  fs.writeFileSync('scripts/contract_locations.txt', react_str);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

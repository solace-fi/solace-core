import { waffle, ethers, upgrades } from "hardhat";
const { deployContract } = waffle;
import { BigNumber as BN, Contract, ContractFactory, Signer, Wallet } from "ethers";
const fs = require("fs");
import { logContractAddress, createPool } from "./utils";
import { FeeAmount } from "../test/utilities/uniswap";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Solace, Vault, Master, Weth9, CpFarm, SolaceEthLpFarm, Treasury, Registry, ClaimsAdjustor, ClaimsEscrow, LpAppraisor } from "../typechain";

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
const LPAPPRAISOR_ADDRESS     = "";
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

// ugprade registry
const UPGRADE_REGISTRY = false;
const UPGRADED_REGISTRY_NAME = ""; // name of the new version of registry contract

let artifacts: ArtifactImports;
let registry: Registry;
let solace: Solace;
let weth: Weth9;
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
let lpTokenAppraisor: LpAppraisor;

let deployer: Signer;
let governor: Signer;
let signerAddress: string;
let governorAddress: string;

async function main() {
  artifacts = await import_artifacts();
  [deployer, governor] = await ethers.getSigners();
  signerAddress = await deployer.getAddress();
  governorAddress = await governor.getAddress();

  UPGRADE_REGISTRY == false ? await deployRegistry() : await upgradeRegistry(REGISTRY_ADDRESS, UPGRADED_REGISTRY_NAME);
  await deploySolace();
  await deployWeth();
  await deployUniswapFactory();
  await deployUniswapRouter();
  await deployUniswapLpToken();
  await deployUniswapPool();
  await deployVault();
  await deployMaster();
  await deployCpFarm();
  await deployLpTokenAppraisor();
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
    registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    let registryContract = await ethers.getContractFactory("contracts_processed/Registry.sol:Registry");
    console.log("Deploying Registry");
    registry = (await upgrades.deployProxy(registryContract, [signerAddress])) as Registry;
    console.log(`Deploying Registry to ${registry.address}`);
    await registry.deployed();
    console.log("Deployment confirmed");
  }
}

async function upgradeRegistry(proxyAddress: string, upgradeContractName: string) {
  if(!!proxyAddress && !!upgradeContractName) {
    console.log("Upgrading Registry");
    let registryContract = await ethers.getContractFactory(upgradeContractName);
    registry = (await upgrades.upgradeProxy(proxyAddress, registryContract)) as Registry;
    console.log(`Upgrading Registry to ${registry.address}`);
  } else {
    console.log("Proxy registry address or upgraded registry contract name is not provided!");
  }
}

async function deploySolace() {
  if(!!SOLACE_ADDRESS) {
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    solace = (await deployContract(deployer, artifacts.SOLACE, [governorAddress])) as Solace;
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
    weth = (await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS)) as Weth9;
  } else {
    console.log("Deploying WETH");
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
    console.log(`Deploying WETH to ${weth.address}`);
    await weth.deployed();
    console.log("Deployment confirmed");
  }
}

async function deployMaster() {
  if(!!MASTER_ADDRESS) {
    master = (await ethers.getContractAt(artifacts.Master.abi, MASTER_ADDRESS)) as Master;
  } else {
    console.log("Deploying Master");
    master = (await deployContract(deployer,artifacts.Master,[governorAddress,solace.address,BLOCK_REWARD])) as Master;
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
    vault = (await ethers.getContractAt(artifacts.Vault.abi, VAULT_ADDRESS)) as Vault;
  } else {
    console.log("Deploying Vault");
    vault = (await deployContract(deployer,artifacts.Vault,[governorAddress,registry.address,weth.address])) as Vault;
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
    cpFarm = (await ethers.getContractAt(artifacts.CpFarm.abi, CPFARM_ADDRESS)) as CpFarm;
  } else {
    console.log("Deploying CP Farm");
    cpFarm = (await deployContract(deployer,artifacts.CpFarm,[governorAddress,master.address,vault.address,solace.address,START_BLOCK,END_BLOCK,uniswapRouter.address,weth.address])) as CpFarm;
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
    uniswapFactory = await ethers.getContractAt(artifacts.UniswapV3Factory.abi, UNISWAP_FACTORY_ADDRESS);
  } else {
    console.log("Deploying Uniswap Factory");
    uniswapFactory = await deployContract(deployer,artifacts.UniswapV3Factory);
    console.log(`Deploying Uniswap Factory to ${uniswapFactory.address}`);
    await uniswapFactory.deployed();
    console.log("Deployment confirmed");
  }
}

async function deployUniswapRouter() {
  if(!!UNISWAP_ROUTER_ADDRESS) {
    uniswapRouter = await ethers.getContractAt(artifacts.SwapRouter.abi, UNISWAP_ROUTER_ADDRESS);
  } else {
    console.log("Deploying Uniswap Router");
    uniswapRouter = await deployContract(deployer,artifacts.SwapRouter,[uniswapFactory.address,weth.address]);
    console.log(`Deploying Uniswap Router to ${uniswapRouter.address}`);
    await uniswapRouter.deployed();
    console.log("Deployment confirmed");
  }
}

async function deployUniswapLpToken() {
  if(!!UNISWAP_LPTOKEN_ADDRESS) {
    lpToken = await ethers.getContractAt(artifacts.NonfungiblePositionManager.abi, UNISWAP_LPTOKEN_ADDRESS);
  } else {
    console.log("Deploying Uniswap LP Token");
    lpToken = await deployContract(deployer,artifacts.NonfungiblePositionManager,[uniswapFactory.address,weth.address,ZERO_ADDRESS]);
    console.log(`Deploying Uniswap LP Token to ${lpToken.address}`);
    await lpToken.deployed();
    console.log("Deployment confirmed");
  }
}

async function deployUniswapPool() {
  if(!!UNISWAP_POOL_ADDRESS) {
    pool = await ethers.getContractAt(artifacts.UniswapV3Pool.abi, UNISWAP_POOL_ADDRESS);
  } else {
    console.log("Deploying then initializing SOLACE-ETH Pool");
    pool = await createPool(deployer, uniswapFactory, weth.address, solace.address, FeeAmount.MEDIUM);
    console.log(`Deployed SOLACE-ETH pool to ${pool.address}`);
  }
}

async function deployLpTokenAppraisor() {
  if(!!LPAPPRAISOR_ADDRESS) {
    lpTokenAppraisor = (await ethers.getContractAt(artifacts.LpAppraisor.abi, LPAPPRAISOR_ADDRESS)) as LpAppraisor;
  } else {
    console.log("Deploying LP Token Appraisor");
    lpTokenAppraisor = (await deployContract(deployer,artifacts.LpAppraisor,[governorAddress,lpToken.address,20000,40000])) as LpAppraisor;
    console.log(`Deploying LP Token Appraisor to ${lpTokenAppraisor.address}`);
    await lpTokenAppraisor.deployed();
    console.log("Deployment confirmed");
  }
}

async function deployLpFarm() {
  if(!!LPFARM_ADDRESS) {
    lpFarm = (await ethers.getContractAt(artifacts.SolaceEthLpFarm.abi, LPFARM_ADDRESS)) as SolaceEthLpFarm;
  } else {
    console.log("Deploying LP Farm");
    lpFarm = (await deployContract(deployer,artifacts.SolaceEthLpFarm,[governorAddress,master.address,lpToken.address,solace.address,START_BLOCK,END_BLOCK,pool.address,weth.address,lpTokenAppraisor.address])) as SolaceEthLpFarm;
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
    treasury = (await ethers.getContractAt(artifacts.Treasury.abi, TREASURY_ADDRESS)) as Treasury;
  } else {
    console.log("Deploying Treasury");
    treasury = (await deployContract(deployer,artifacts.Treasury,[governorAddress,solace.address,uniswapRouter.address,weth.address])) as Treasury;
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
    claimsEscrow = (await ethers.getContractAt(artifacts.ClaimsEscrow.abi, CLAIMS_ESCROW_ADDRESS)) as ClaimsEscrow;
  }
  else {
    console.log("Deploying Claims Escrow");
    claimsEscrow = (await deployContract(deployer,artifacts.ClaimsEscrow,[registry.address])) as ClaimsEscrow;
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
    claimsAdjustor = (await ethers.getContractAt(artifacts.ClaimsAdjustor.abi, CLAIMS_ADJUSTOR_ADDRESS)) as ClaimsAdjustor;
  }
  else {
    console.log("Deploying Claims Adjustor");
    claimsAdjustor = (await deployContract(deployer,artifacts.ClaimsAdjustor,[registry.address])) as ClaimsAdjustor;
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
  logContractAddress("lpTokenAppraisor", lpTokenAppraisor.address);
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
REACT_APP_LPTOKENAPPRAISOR_CONTRACT_ADDRESS=${lpTokenAppraisor.address}
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

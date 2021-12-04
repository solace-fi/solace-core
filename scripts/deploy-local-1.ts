import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { deployContract, provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.LOCALHOST_ACCOUNTS || '[]')[0], provider);

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Deployer, Registry, Weth9, Vault, ClaimsEscrow, Treasury, PolicyManager, PolicyDescriptorV2, RiskManager, OptionsFarming, FarmController, CpFarm, SptFarm } from "../typechain";

const REGISTRY_ADDRESS          = "";
const VAULT_ADDRESS             = "";
const CLAIMS_ESCROW_ADDRESS     = "";
const TREASURY_ADDRESS          = "";
const POLICY_MANAGER_ADDRESS    = "";
const POLICY_DESCR_ADDRESS      = "";
const RISK_MANAGER_ADDRESS      = "";

const OPTIONS_FARMING_ADDRESS   = "";
const FARM_CONTROLLER_ADDRESS   = "";
const CP_FARM_ADDRESS           = "";
const SPT_FARM_ADDRESS          = "";

const WETH_ADDRESS              = "";

// farm params
const solacePerSecond    = BN.from("1157407407407407400"); // 100K per day across all farms
const cpFarmStartTime    = 1634515200; // Oct 17, 2021
const cpFarmEndTime      = 1666051200; // Oct 17, 2022
const cpFarmAllocPoints  = 50;
const sptFarmStartTime   = 1635897600; // Nov 3, 2021
const sptFarmEndTime     = 1667449200; // Nov 3, 2022
const sptFarmAllocPoints = 0;

let artifacts: ArtifactImports;
let deployerContract: Deployer;
let registry: Registry;
let weth: Weth9;
let vault: Vault;
let claimsEscrow: ClaimsEscrow;
let treasury: Treasury;
let policyManager: PolicyManager;
let policyDescriptor: PolicyDescriptorV2;
let riskManager: RiskManager;

let optionsFarming: OptionsFarming;
let farmController: FarmController;
let cpFarm: CpFarm;
let sptFarm: SptFarm;

let signerAddress: string;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  await deployRegistry();
  await deployWeth();
  await deployVault();
  await deployClaimsEscrow();
  await deployTreasury();
  await deployPolicyManager();
  await deployPolicyDescriptor();
  await deployRiskManager();

  await deployOptionsFarming();
  await deployFarmController();
  await deployCpFarm();
  await deploySptFarm();

  await logAddresses();
}

async function deployRegistry() {
  if(!!REGISTRY_ADDRESS) {
    registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry");
    registry = (await deployContract(deployer, artifacts.Registry, [signerAddress])) as Registry;
  }
}

async function deployWeth() {
  if(!!WETH_ADDRESS) {
    weth = (await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS)) as Weth9;
  } else {
    console.log("Deploying WETH");
    weth = (await deployContract(deployer, artifacts.WETH)) as Weth9;
  }
  if(await registry.weth() != weth.address && await registry.governance() == signerAddress) {
    console.log("Registering WETH");
    let tx = await registry.connect(deployer).setWeth(weth.address);
    await tx.wait();
  }
}

async function deployVault() {
  if(!!VAULT_ADDRESS) {
    vault = (await ethers.getContractAt(artifacts.Vault.abi, VAULT_ADDRESS)) as Vault;
  } else {
    console.log("Deploying Vault");
    vault = (await deployContract(deployer, artifacts.Vault, [signerAddress, registry.address])) as Vault;
    console.log(`Deployed Vault to ${vault.address}`);
  }
  if(await registry.vault() != vault.address && await registry.governance() == signerAddress) {
    console.log("Registering Vault");
    let tx = await registry.connect(deployer).setVault(vault.address);
    await tx.wait();
  }
}

async function deployClaimsEscrow() {
  if(!!CLAIMS_ESCROW_ADDRESS) {
    claimsEscrow = (await ethers.getContractAt(artifacts.ClaimsEscrow.abi, CLAIMS_ESCROW_ADDRESS)) as ClaimsEscrow;
  } else {
    console.log("Deploying ClaimsEscrow");
    claimsEscrow = (await deployContract(deployer, artifacts.ClaimsEscrow, [signerAddress, registry.address])) as ClaimsEscrow;
    console.log(`Deployed ClaimsEscrow to ${claimsEscrow.address}`);
  }
  if(await registry.claimsEscrow() != claimsEscrow.address && await registry.governance() == signerAddress) {
    console.log("Registering ClaimsEscrow");
    let tx = await registry.connect(deployer).setClaimsEscrow(claimsEscrow.address);
    await tx.wait();
  }
  if(!(await vault.isRequestor(claimsEscrow.address)) && await vault.governance() == signerAddress) {
    console.log("Adding ClaimsEscrow as Vault Requestor");
    let tx = await vault.connect(deployer).addRequestor(claimsEscrow.address);
    await tx.wait();
  }
}

async function deployTreasury() {
  if(!!TREASURY_ADDRESS) {
    treasury = (await ethers.getContractAt(artifacts.Treasury.abi, TREASURY_ADDRESS)) as Treasury;
  } else {
    console.log("Deploying Treasury");
    treasury = (await deployContract(deployer, artifacts.Treasury, [signerAddress, registry.address])) as Treasury;
    console.log(`Deployed Treasury to ${treasury.address}`);
  }
  if(await registry.treasury() != treasury.address && await registry.governance() == signerAddress) {
    console.log("Registering Treasury");
    let tx = await registry.connect(deployer).setTreasury(treasury.address);
    await tx.wait();
  }
  if(!(await vault.isRequestor(treasury.address)) && await vault.governance() == signerAddress) {
    console.log("Adding Treasury as Vault Requestor");
    let tx = await vault.connect(deployer).addRequestor(treasury.address);
    await tx.wait();
  }
}

async function deployPolicyManager() {
  if(!!POLICY_MANAGER_ADDRESS) {
    policyManager = (await ethers.getContractAt(artifacts.PolicyManager.abi, POLICY_MANAGER_ADDRESS)) as PolicyManager;
  } else {
    console.log("Deploying PolicyManager");
    policyManager = (await deployContract(deployer, artifacts.PolicyManager, [signerAddress])) as PolicyManager;
    console.log(`Deployed PolicyManager to ${policyManager.address}`);
  }
  if(await registry.policyManager() != policyManager.address && await registry.governance() == signerAddress) {
    console.log("Registering PolicyManager");
    let tx = await registry.connect(deployer).setPolicyManager(policyManager.address);
    await tx.wait();
  }
}

async function deployPolicyDescriptor() {
  if(!!POLICY_DESCR_ADDRESS) {
    policyDescriptor = (await ethers.getContractAt(artifacts.PolicyDescriptorV2.abi, POLICY_DESCR_ADDRESS)) as PolicyDescriptorV2;
  } else {
    console.log("Deploying PolicyDescriptor");
    policyDescriptor = (await deployContract(deployer, artifacts.PolicyDescriptorV2, [signerAddress])) as PolicyDescriptorV2;
    console.log(`Deployed PolicyDescriptor to ${policyDescriptor.address}`);
  }
  if(await policyManager.policyDescriptor() != policyDescriptor.address && await policyManager.governance() == signerAddress) {
    console.log("Registering PolicyDescriptor");
    let tx = await policyManager.connect(deployer).setPolicyDescriptor(policyDescriptor.address);
    await tx.wait();
  }
}

async function deployRiskManager() {
  if(!!RISK_MANAGER_ADDRESS) {
    riskManager = (await ethers.getContractAt(artifacts.RiskManager.abi, RISK_MANAGER_ADDRESS)) as RiskManager;
  } else {
    console.log("Deploying RiskManager");
    riskManager = (await deployContract(deployer, artifacts.RiskManager, [signerAddress, registry.address])) as RiskManager;
  }
  if(await registry.riskManager() != riskManager.address && await registry.governance() == signerAddress) {
    console.log("Registering RiskManager");
    let tx = await registry.connect(deployer).setRiskManager(riskManager.address);
    await tx.wait();
  }
}

async function deployOptionsFarming() {
  if(!!OPTIONS_FARMING_ADDRESS) {
    optionsFarming = (await ethers.getContractAt(artifacts.OptionsFarming.abi, OPTIONS_FARMING_ADDRESS)) as OptionsFarming;
  } else {
    console.log("Deploying OptionsFarming");
    optionsFarming = (await deployContract(deployer, artifacts.OptionsFarming, [signerAddress])) as OptionsFarming;
    console.log(`Deployed OptionsFarming to ${optionsFarming.address}`);
  }
  if(await registry.optionsFarming() != optionsFarming.address && await registry.governance() == signerAddress) {
    console.log("Registering OptionsFarming");
    let tx = await registry.connect(deployer).setOptionsFarming(optionsFarming.address);
    await tx.wait();
  }
}

async function deployFarmController() {
  if(!!FARM_CONTROLLER_ADDRESS) {
    farmController = (await ethers.getContractAt(artifacts.FarmController.abi, FARM_CONTROLLER_ADDRESS)) as FarmController;
  } else {
    console.log("Deploying FarmController");
    farmController = (await deployContract(deployer, artifacts.FarmController, [signerAddress, optionsFarming.address, solacePerSecond])) as FarmController;
    console.log(`Deployed FarmController to ${farmController.address}`);
  }
  if(await registry.farmController() != farmController.address && await registry.governance() == signerAddress) {
    console.log("Registering FarmController in Registry");
    let tx = await registry.connect(deployer).setFarmController(farmController.address);
    await tx.wait();
  }
  if((await optionsFarming.farmController() != farmController.address) && await optionsFarming.governance() == signerAddress) {
    console.log("Registering FarmController in OptionsFarming");
    let tx = await optionsFarming.connect(deployer).setFarmController(farmController.address);
    await tx.wait();
  }
}

async function deployCpFarm() {
  if(!!CP_FARM_ADDRESS) {
    cpFarm = (await ethers.getContractAt(artifacts.CpFarm.abi, CP_FARM_ADDRESS)) as CpFarm;
  } else {
    console.log("Deploying CpFarm");
    cpFarm = (await deployContract(deployer, artifacts.CpFarm, [signerAddress, registry.address, cpFarmStartTime, cpFarmEndTime])) as CpFarm;
    console.log(`Deployed CpFarm to ${cpFarm.address}`);
  }
  if((await farmController.farmIndices(cpFarm.address)).eq(0) && await farmController.governance() == signerAddress) {
    console.log("Registering CpFarm in FarmController");
    let tx = await farmController.connect(deployer).registerFarm(cpFarm.address, cpFarmAllocPoints);
    await tx.wait();
  }
}

async function deploySptFarm() {
  if(!!SPT_FARM_ADDRESS) {
    sptFarm = (await ethers.getContractAt(artifacts.SptFarm.abi, SPT_FARM_ADDRESS)) as SptFarm;
  } else {
    console.log("Deploying SptFarm");
    sptFarm = (await deployContract(deployer, artifacts.SptFarm, [signerAddress, registry.address, sptFarmStartTime, sptFarmEndTime])) as SptFarm;
    console.log(`Deployed SptFarm to ${sptFarm.address}`);
  }
  if((await farmController.farmIndices(sptFarm.address)).eq(0) && await farmController.governance() == signerAddress) {
    console.log("Registering SptFarm in FarmController");
    let tx = await farmController.connect(deployer).registerFarm(sptFarm.address, sptFarmAllocPoints);
    await tx.wait();
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("Registry", registry.address);
  logContractAddress("WETH", weth.address);
  logContractAddress("Vault", vault.address);
  logContractAddress("ClaimsEscrow", claimsEscrow.address);
  logContractAddress("Treasury", treasury.address);
  logContractAddress("PolicyManager", policyManager.address);
  logContractAddress("PolicyDescriptor", policyDescriptor.address);
  logContractAddress("RiskManager", riskManager.address);
  logContractAddress("OptionsFarming", optionsFarming.address);
  logContractAddress("FarmController", farmController.address);
  logContractAddress("CpFarm", cpFarm.address);

  console.log(``);
  console.log(`Copy and paste this into the .env file in the frontend client.`)
  console.log(``);
  console.log(`REACT_APP_LOCALHOST_REGISTRY_CONTRACT_ADDRESS=${registry.address}`);
  console.log(`REACT_APP_LOCALHOST_WETH_CONTRACT_ADDRESS=${weth.address}`);
  console.log(`REACT_APP_LOCALHOST_VAULT_CONTRACT_ADDRESS=${vault.address}`);
  console.log(`REACT_APP_LOCALHOST_CLAIMS_ESCROW_CONTRACT_ADDRESS=${claimsEscrow.address}`);
  console.log(`REACT_APP_LOCALHOST_TREASURY_CONTRACT_ADDRESS=${treasury.address}`);
  console.log(`REACT_APP_LOCALHOST_POLICY_MANAGER_CONTRACT_ADDRESS=${policyManager.address}`);
  console.log(`REACT_APP_LOCALHOST_POLICY_DESCRIPTOR_CONTRACT_ADDRESS=${policyDescriptor.address}`);
  console.log(`REACT_APP_LOCALHOST_RISK_MANAGER_CONTRACT_ADDRESS=${riskManager.address}`);
  console.log("")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

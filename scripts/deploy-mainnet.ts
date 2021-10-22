import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { writeFileSync } from "fs";
import { create2Contract } from "./create2Contract";

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Deployer, Registry, Weth9, Vault, ClaimsEscrow, Treasury, PolicyManager, PolicyDescriptor, RiskManager, OptionsFarming, FarmController, CpFarm, Solace } from "../typechain";

const DEPLOYER_CONTRACT_ADDRESS = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const REGISTRY_ADDRESS          = "0x501aCEE3310d98881c827d4357C970F23a30AD29";
const VAULT_ADDRESS             = "0x501AcEe83a6f269B77c167c6701843D454E2EFA0";
const CLAIMS_ESCROW_ADDRESS     = "0x501aCEA73C7f4E5fB6Bce5A53603DA611F6A854C";
const TREASURY_ADDRESS          = "0x501aCeAFb0d3e06Dc29db6Be51DFeB504c1D22ef";
const POLICY_MANAGER_ADDRESS    = "0x501ace5E9f058bB2E851675BB3fA104Da6E3A22C";
const POLICY_DESCR_ADDRESS      = "0x501ACe22C78C596227B1944D10d859c7f8a60d0a";
const RISK_MANAGER_ADDRESS      = "0x501ACe9eE0AB4D2D4204Bcf3bE6eE13Fd6337804";

const OPTIONS_FARMING_ADDRESS   = "0x501ACEB9772d1EfE5F8eA46FE5004fAd039e067A";
const FARM_CONTROLLER_ADDRESS   = "0x501aCEDD1a697654d5F53514FF09eDECD3ca6D95";
const CP_FARM_ADDRESS           = "0x501ACeb4D4C2CB7E4b07b53fbe644f3e51D25A3e";
const SOLACE_ADDRESS            = "";

const WETH_ADDRESS              = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const COMPTROLLER_ADDRESS       = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
const AAVE_DATA_PROVIDER        = "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d";
const UNISWAP_ROUTER_ADDRESS    = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const SINGLETON_FACTORY_ADDRESS = "0xce0042B868300000d44A59004Da54A005ffdcf9f";

// product params
const minPeriod = 6450; // this is about 1 day
const maxPeriod = 2354250; // this is about 1 year from https://ycharts.com/indicators/ethereum_blocks_per_day
const price = 11044; // 2.60%/yr
// farm params
const startTime = 1634515200; // Oct 17, 2021
const endTime   = 1666051200; // Oct 17, 2022
const solacePerSecond = BN.from("1157407407407407400"); // 100K per day

let artifacts: ArtifactImports;
let deployerContract: Deployer;
let registry: Registry;
let weth: Weth9;
let vault: Vault;
let claimsEscrow: ClaimsEscrow;
let treasury: Treasury;
let policyManager: PolicyManager;
let policyDescriptor: PolicyDescriptor;
let riskManager: RiskManager;

let optionsFarming: OptionsFarming;
let farmController: FarmController;
let cpFarm: CpFarm;
let solace: Solace;

let signerAddress: string;
let multisigAddress = "0xc47911f768c6fE3a9fe076B95e93a33Ed45B7B34";

let transactions: any = [];

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  if((await provider.getNetwork()).chainId == 31337) { // testnet
    console.log('funding')
    var [funder] = await hardhat.ethers.getSigners();
    let tx = await funder.sendTransaction({to: signerAddress, value: BN.from("100000000000000000000")});
    await tx.wait();
  }

  // pre-dao
  await deployDeployerContract();
  await deployRegistry();
  await deployWeth();
  await deployVault();
  await deployClaimsEscrow();
  await deployTreasury();
  await deployPolicyManager();
  await deployPolicyDescriptor();
  await deployRiskManager();
  // post-dao
  await deployOptionsFarming();
  await deployFarmController();
  await deployCpFarm();
  //await deploySOLACE();

  writeFileSync("stash/transactions/deployTransactionsMainnet.json", JSON.stringify(transactions, undefined, '  '));
  await logAddresses();
}

async function deployDeployerContract() {
  if(!!DEPLOYER_CONTRACT_ADDRESS) {
    deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  } else {
    console.log("Deploying Deployer");
    var res = await create2Contract(deployer,artifacts.Deployer);
    deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, res.address)) as Deployer;
    transactions.push({"description": "Deploy Deployer", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
    console.log(`Deployed Deployer to ${deployerContract.address}`);
  }
}

async function deployRegistry() {
  if(!!REGISTRY_ADDRESS) {
    registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry");
    var res = await create2Contract(deployer,artifacts.Registry,[signerAddress], {}, "", deployerContract.address);
    registry = (await ethers.getContractAt(artifacts.Registry.abi, res.address)) as Registry;
    transactions.push({"description": "Deploy Registry", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed Registry to ${registry.address}`);
  }
  if(await registry.governance() === signerAddress && await registry.pendingGovernance() !== multisigAddress) {
    console.log(`Registry.setPendingGovernance(${multisigAddress})`)
    let tx = await registry.connect(deployer).setPendingGovernance(multisigAddress);
    await tx.wait();
  }
}

async function deployWeth() {
  weth = (await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS)) as Weth9;
  if(await registry.weth() != weth.address && await registry.governance() == signerAddress) {
    console.log("Registering Weth");
    let tx = await registry.connect(deployer).setWeth(weth.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register WETH", "to": registry.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function deployVault() {
  if(!!VAULT_ADDRESS) {
    vault = (await ethers.getContractAt(artifacts.Vault.abi, VAULT_ADDRESS)) as Vault;
  } else {
    console.log("Deploying Vault");
    var res = await create2Contract(deployer,artifacts.Vault,[signerAddress,registry.address], {}, "", deployerContract.address);
    vault = (await ethers.getContractAt(artifacts.Vault.abi, res.address)) as Vault;
    transactions.push({"description": "Deploy Vault", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed Vault to ${vault.address}`);
  }
  if(await registry.vault() != vault.address && await registry.governance() == signerAddress) {
    console.log("Registering Vault");
    let tx = await registry.connect(deployer).setVault(vault.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register Vault", "to": registry.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await vault.governance() === signerAddress && await vault.pendingGovernance() !== multisigAddress) {
    console.log(`vault.setPendingGovernance(${multisigAddress})`)
    let tx = await vault.connect(deployer).setPendingGovernance(multisigAddress);
    await tx.wait();
  }
}

async function deployClaimsEscrow() {
  if(!!CLAIMS_ESCROW_ADDRESS) {
    claimsEscrow = (await ethers.getContractAt(artifacts.ClaimsEscrow.abi, CLAIMS_ESCROW_ADDRESS)) as ClaimsEscrow;
  } else {
    console.log("Deploying ClaimsEscrow");
    var res = await create2Contract(deployer,artifacts.ClaimsEscrow,[signerAddress,registry.address], {}, "", deployerContract.address);
    claimsEscrow = (await ethers.getContractAt(artifacts.ClaimsEscrow.abi, res.address)) as ClaimsEscrow;
    transactions.push({"description": "Deploy ClaimsEscrow", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed ClaimsEscrow to ${claimsEscrow.address}`);
  }
  if(await registry.claimsEscrow() != claimsEscrow.address && await registry.governance() == signerAddress) {
    console.log("Registering ClaimsEscrow");
    let tx = await registry.connect(deployer).setClaimsEscrow(claimsEscrow.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register ClaimsEscrow", "to": registry.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(!(await vault.isRequestor(claimsEscrow.address)) && await vault.governance() == signerAddress) {
    console.log("Adding ClaimsEscrow as Vault Requestor");
    let tx = await vault.connect(deployer).addRequestor(claimsEscrow.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Add ClaimsEscrow as Vault Requestor", "to": vault.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await claimsEscrow.governance() === signerAddress && await claimsEscrow.pendingGovernance() !== multisigAddress) {
    console.log(`claimsEscrow.setPendingGovernance(${multisigAddress})`)
    let tx = await claimsEscrow.connect(deployer).setPendingGovernance(multisigAddress);
    await tx.wait();
  }
}

async function deployTreasury() {
  if(!!TREASURY_ADDRESS) {
    treasury = (await ethers.getContractAt(artifacts.Treasury.abi, TREASURY_ADDRESS)) as Treasury;
  } else {
    console.log("Deploying Treasury");
    var res = await create2Contract(deployer,artifacts.Treasury,[signerAddress,registry.address], {}, "", deployerContract.address);
    treasury = (await ethers.getContractAt(artifacts.Treasury.abi, res.address)) as Treasury;
    transactions.push({"description": "Deploy Treasury", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed Treasury to ${treasury.address}`);
  }
  if(await registry.treasury() != treasury.address && await registry.governance() == signerAddress) {
    console.log("Registering Treasury");
    let tx = await registry.connect(deployer).setTreasury(treasury.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register Treasury", "to": registry.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(!(await vault.isRequestor(treasury.address)) && await vault.governance() == signerAddress) {
    console.log("Adding Treasury as Vault Requestor");
    let tx = await vault.connect(deployer).addRequestor(treasury.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Add Treasury as Vault Requestor", "to": vault.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await treasury.governance() === signerAddress && await treasury.pendingGovernance() !== multisigAddress) {
    console.log(`treasury.setPendingGovernance(${multisigAddress})`)
    let tx = await treasury.connect(deployer).setPendingGovernance(multisigAddress);
    await tx.wait();
  }
}

async function deployPolicyManager() {
  if(!!POLICY_MANAGER_ADDRESS) {
    policyManager = (await ethers.getContractAt(artifacts.PolicyManager.abi, POLICY_MANAGER_ADDRESS)) as PolicyManager;
  } else {
    console.log("Deploying PolicyManager");
    var res = await create2Contract(deployer,artifacts.PolicyManager,[signerAddress], {}, "", deployerContract.address);
    policyManager = (await ethers.getContractAt(artifacts.PolicyManager.abi, res.address)) as PolicyManager;
    transactions.push({"description": "Deploy PolicyManager", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed PolicyManager to ${policyManager.address}`);
  }
  if(await registry.policyManager() != policyManager.address && await registry.governance() == signerAddress) {
    console.log("Registering PolicyManager");
    let tx = await registry.connect(deployer).setPolicyManager(policyManager.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register PolicyManager", "to": registry.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await policyManager.governance() === signerAddress && await policyManager.pendingGovernance() !== multisigAddress) {
    console.log(`policyManager.setPendingGovernance(${multisigAddress})`)
    let tx = await policyManager.connect(deployer).setPendingGovernance(multisigAddress);
    await tx.wait();
  }
}

async function deployPolicyDescriptor() {
  if(!!POLICY_DESCR_ADDRESS) {
    policyDescriptor = (await ethers.getContractAt(artifacts.PolicyDescriptor.abi, POLICY_DESCR_ADDRESS)) as PolicyDescriptor;
  } else {
    console.log("Deploying PolicyDescriptor");
    var res = await create2Contract(deployer,artifacts.PolicyDescriptor,[], {}, "", deployerContract.address);
    policyDescriptor = (await ethers.getContractAt(artifacts.PolicyDescriptor.abi, res.address)) as PolicyDescriptor;
    transactions.push({"description": "Deploy PolicyDescriptor", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed PolicyDescriptor to ${policyDescriptor.address}`);
  }
  if(await policyManager.policyDescriptor() != policyDescriptor.address && await policyManager.governance() == signerAddress) {
    console.log("Registering PolicyDescriptor");
    let tx = await policyManager.connect(deployer).setPolicyDescriptor(policyDescriptor.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register PolicyDescriptor", "to": policyManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function deployRiskManager() {
  if(!!RISK_MANAGER_ADDRESS) {
    riskManager = (await ethers.getContractAt(artifacts.RiskManager.abi, RISK_MANAGER_ADDRESS)) as RiskManager;
  } else {
    console.log("Deploying RiskManager");
    var res = await create2Contract(deployer,artifacts.RiskManager,[signerAddress,registry.address], {}, "", deployerContract.address);
    riskManager = (await ethers.getContractAt(artifacts.RiskManager.abi, res.address)) as RiskManager;
    transactions.push({"description": "Deploy RiskManager", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed RiskManager to ${riskManager.address}`);
  }
  if(await registry.riskManager() != riskManager.address && await registry.governance() == signerAddress) {
    console.log("Registering RiskManager");
    let tx = await registry.connect(deployer).setRiskManager(riskManager.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register RiskManager", "to": registry.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await riskManager.governance() === signerAddress && await riskManager.pendingGovernance() !== multisigAddress) {
    console.log(`riskManager.setPendingGovernance(${multisigAddress})`)
    let tx = await riskManager.connect(deployer).setPendingGovernance(multisigAddress);
    await tx.wait();
  }
}

async function deployOptionsFarming() {
  if(!!OPTIONS_FARMING_ADDRESS) {
    optionsFarming = (await ethers.getContractAt(artifacts.OptionsFarming.abi, OPTIONS_FARMING_ADDRESS)) as OptionsFarming;
  } else {
    console.log("Deploying OptionsFarming");
    var res = await create2Contract(deployer,artifacts.OptionsFarming,[signerAddress], {}, "", deployerContract.address);
    optionsFarming = (await ethers.getContractAt(artifacts.OptionsFarming.abi, res.address)) as OptionsFarming;
    transactions.push({"description": "Deploy OptionsFarming", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed OptionsFarming to ${optionsFarming.address}`);
  }
  if(await registry.optionsFarming() != optionsFarming.address && await registry.governance() == signerAddress) {
    console.log("Registering OptionsFarming");
    let tx = await registry.connect(deployer).setOptionsFarming(optionsFarming.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register OptionsFarming", "to": registry.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await optionsFarming.governance() === signerAddress && await optionsFarming.pendingGovernance() !== multisigAddress) {
    console.log(`optionsFarming.setPendingGovernance(${multisigAddress})`)
    let tx = await optionsFarming.connect(deployer).setPendingGovernance(multisigAddress);
    await tx.wait();
  }
}

async function deployFarmController() {
  if(!!FARM_CONTROLLER_ADDRESS) {
    farmController = (await ethers.getContractAt(artifacts.FarmController.abi, FARM_CONTROLLER_ADDRESS)) as FarmController;
  } else {
    console.log("Deploying FarmController");
    var res = await create2Contract(deployer,artifacts.FarmController,[signerAddress,optionsFarming.address,solacePerSecond], {}, "", deployerContract.address);
    farmController = (await ethers.getContractAt(artifacts.FarmController.abi, res.address)) as FarmController;
    transactions.push({"description": "Deploy FarmController", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed FarmController to ${farmController.address}`);
  }
  if(await registry.farmController() != farmController.address && await registry.governance() == signerAddress) {
    console.log("Registering FarmController in Registry");
    let tx = await registry.connect(deployer).setFarmController(farmController.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register FarmController", "to": registry.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if((await optionsFarming.farmController() != farmController.address) && await optionsFarming.governance() == signerAddress) {
    console.log("Registering FarmController in OptionsFarming");
    let tx = await optionsFarming.connect(deployer).setFarmController(farmController.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register FarmController in OptionsFarming", "to": optionsFarming.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await farmController.governance() === signerAddress && await farmController.pendingGovernance() !== multisigAddress) {
    console.log(`farmController.setPendingGovernance(${multisigAddress})`)
    let tx = await farmController.connect(deployer).setPendingGovernance(multisigAddress);
    await tx.wait();
  }
}

async function deployCpFarm() {
  if(!!CP_FARM_ADDRESS) {
    cpFarm = (await ethers.getContractAt(artifacts.CpFarm.abi, CP_FARM_ADDRESS)) as CpFarm;
  } else {
    console.log("Deploying CpFarm");
    var res = await create2Contract(deployer,artifacts.CpFarm,[signerAddress,registry.address,startTime,endTime], {}, "", deployerContract.address);
    cpFarm = (await ethers.getContractAt(artifacts.CpFarm.abi, res.address)) as CpFarm;
    transactions.push({"description": "Deploy CpFarm", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed CpFarm to ${cpFarm.address}`);
  }
  if((await farmController.farmIndices(cpFarm.address)).eq(0) && await farmController.governance() == signerAddress) {
    console.log("Registering CpFarm in FarmController");
    let tx = await farmController.connect(deployer).registerFarm(cpFarm.address, 50);
    let receipt = await tx.wait();
    transactions.push({"description": "Register CpFarm in FarmController", "to": farmController.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await cpFarm.governance() === signerAddress && await cpFarm.pendingGovernance() !== multisigAddress) {
    console.log(`cpFarm.setPendingGovernance(${multisigAddress})`)
    let tx = await cpFarm.connect(deployer).setPendingGovernance(multisigAddress);
    await tx.wait();
  }
}

async function deploySOLACE() {
  if(!!SOLACE_ADDRESS) {
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    var res = await create2Contract(deployer,artifacts.SOLACE,[signerAddress], {}, "", deployerContract.address);
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, res.address)) as Solace;
    transactions.push({"description": "Deploy SOLACE", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed SOLACE to ${solace.address}`);
  }
  if(await registry.solace() != solace.address && await registry.governance() == signerAddress) {
    console.log("Registering SOLACE");
    let tx = await registry.connect(deployer).setSolace(solace.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register SOLACE", "to": registry.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name    | Address                                      |");
  console.log("|------------------|----------------------------------------------|");
  logContractAddress("DeployerContract", deployerContract.address);
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
  console.log(`REACT_APP_MAINNET_REGISTRY_CONTRACT_ADDRESS=${registry.address}`);
  console.log(`REACT_APP_MAINNET_WETH_CONTRACT_ADDRESS=${weth.address}`);
  console.log(`REACT_APP_MAINNET_VAULT_CONTRACT_ADDRESS=${vault.address}`);
  console.log(`REACT_APP_MAINNET_CLAIMS_ESCROW_CONTRACT_ADDRESS=${claimsEscrow.address}`);
  console.log(`REACT_APP_MAINNET_TREASURY_CONTRACT_ADDRESS=${treasury.address}`);
  console.log(`REACT_APP_MAINNET_POLICY_MANAGER_CONTRACT_ADDRESS=${policyManager.address}`);
  console.log(`REACT_APP_MAINNET_POLICY_DESCRIPTOR_CONTRACT_ADDRESS=${policyDescriptor.address}`);
  console.log(`REACT_APP_MAINNET_RISK_MANAGER_CONTRACT_ADDRESS=${riskManager.address}`);
  console.log("")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

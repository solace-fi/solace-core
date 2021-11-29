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
import { Deployer, Registry, Weth9, Vault, ClaimsEscrow, Treasury, PolicyManager, PolicyDescriptorV2, RiskManager, OptionsFarming, FarmController, CpFarm, SptFarm, CompoundProductRinkeby, WaaveProduct, LiquityProduct } from "../typechain";

const DEPLOYER_CONTRACT_ADDRESS = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";
const REGISTRY_ADDRESS          = "0x501aCEE3310d98881c827d4357C970F23a30AD29";
const VAULT_ADDRESS             = "0x501AcEe83a6f269B77c167c6701843D454E2EFA0";
const CLAIMS_ESCROW_ADDRESS     = "0x501aCEA73C7f4E5fB6Bce5A53603DA611F6A854C";
const TREASURY_ADDRESS          = "0x501aCeAFb0d3e06Dc29db6Be51DFeB504c1D22ef";
const POLICY_MANAGER_ADDRESS    = "0x501ace5E9f058bB2E851675BB3fA104Da6E3A22C";
const POLICY_DESCR_ADDRESS      = "0x501acEF3315c5DcFE37be35fB59e33d755898E1A";
const RISK_MANAGER_ADDRESS      = "0x501ACe9eE0AB4D2D4204Bcf3bE6eE13Fd6337804";

const OPTIONS_FARMING_ADDRESS   = "0x501ACEB9772d1EfE5F8eA46FE5004fAd039e067A";
const FARM_CONTROLLER_ADDRESS   = "0x501aCEDD1a697654d5F53514FF09eDECD3ca6D95";
const CP_FARM_ADDRESS           = "0x501ACeb4D4C2CB7E4b07b53fbe644f3e51D25A3e";
const SPT_FARM_ADDRESS          = "0x501acE7644A3482F7358BE05454278cF2c699581";

const COMPOUND_PRODUCT_ADDRESS  = "0x501AcE207C72f084B172816e1CB8EC2A90bdaAE8";
const WAAVE_PRODUCT_ADDRESS     = "0x501Ace33747Bc56c78ae7eDd58De6790ea5D824b";
const LIQUITY_PRODUCT_ADDRESS   = "0x501Ace989C1e23E4fEdcab0C2d2A5d78bf906ef4";

const COMPTROLLER_ADDRESS       = "0x2EAa9D77AE4D8f9cdD9FAAcd44016E746485bddb";
const UNISWAP_ROUTER_ADDRESS    = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const WAAVE_REGISTRY_ADDRESS    = "0x670Fc618C48964F806Cd655600541807ed83a9C5";
const TROVE_MANAGER_ADDRESS     = "0x04d630Bff6dea193Fd644dEcfC460db249854a02";
const SINGLETON_FACTORY_ADDRESS = "0xce0042B868300000d44A59004Da54A005ffdcf9f";

const WETH_ADDRESS              = "0xc778417E063141139Fce010982780140Aa0cD5Ab";

const PACLAS_SIGNER_ADDRESS     = "0xA32b8838Ba639A1a8a70C149a924C8Bc07d803a7";

// product params
const minPeriod = 6450; // this is about 1 day
const maxPeriod = 2354250; // this is about 1 year from https://ycharts.com/indicators/ethereum_blocks_per_day
const price = 11044; // 2.60%/yr
// farm params
const solacePerSecond    = BN.from("1273148148148148148"); // 110K per day across all farms
const cpFarmStartTime    = 1634515200; // Oct 17, 2021
const cpFarmEndTime      = 1666051200; // Oct 17, 2022
const cpFarmAllocPoints  = 100000;     // 100K per day
const sptFarmStartTime   = 1635897600; // Nov 3, 2021
const sptFarmEndTime     = 1667449200; // Nov 3, 2022
const sptFarmAllocPoints = 10000;      // 10K per day

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

let compoundProduct: CompoundProductRinkeby;
let waaveProduct: WaaveProduct;
let liquityProduct: LiquityProduct;

let signerAddress: string;

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
  await deploySptFarm();
  // products
  await deployCompoundProduct();
  await deployWaaveProduct();
  await deployLiquityProduct();

  await addSigners();

  writeFileSync("stash/transactions/deployTransactionsRinkeby.json", JSON.stringify(transactions, undefined, '  '));
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
}

async function deployPolicyDescriptor() {
  if(!!POLICY_DESCR_ADDRESS) {
    policyDescriptor = (await ethers.getContractAt(artifacts.PolicyDescriptorV2.abi, POLICY_DESCR_ADDRESS)) as PolicyDescriptorV2;
  } else {
    console.log("Deploying PolicyDescriptor");
    var res = await create2Contract(deployer,artifacts.PolicyDescriptorV2, [signerAddress], {}, "", deployerContract.address);
    policyDescriptor = (await ethers.getContractAt(artifacts.PolicyDescriptorV2.abi, res.address)) as PolicyDescriptorV2;
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
}

async function deployCpFarm() {
  if(!!CP_FARM_ADDRESS) {
    cpFarm = (await ethers.getContractAt(artifacts.CpFarm.abi, CP_FARM_ADDRESS)) as CpFarm;
  } else {
    console.log("Deploying CpFarm");
    var res = await create2Contract(deployer,artifacts.CpFarm,[signerAddress,registry.address,cpFarmStartTime,cpFarmEndTime], {}, "", deployerContract.address);
    cpFarm = (await ethers.getContractAt(artifacts.CpFarm.abi, res.address)) as CpFarm;
    transactions.push({"description": "Deploy CpFarm", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed CpFarm to ${cpFarm.address}`);
  }
  if((await farmController.farmIndices(cpFarm.address)).eq(0) && await farmController.governance() == signerAddress) {
    console.log("Registering CpFarm in FarmController");
    let tx = await farmController.connect(deployer).registerFarm(cpFarm.address, cpFarmAllocPoints);
    let receipt = await tx.wait();
    transactions.push({"description": "Register CpFarm in FarmController", "to": farmController.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function deploySptFarm() {
  if(!!SPT_FARM_ADDRESS) {
    sptFarm = (await ethers.getContractAt(artifacts.SptFarm.abi, SPT_FARM_ADDRESS)) as SptFarm;
  } else {
    console.log("Deploying SptFarm");
    var res = await create2Contract(deployer,artifacts.SptFarm,[signerAddress,registry.address,sptFarmStartTime,sptFarmEndTime], {}, "", deployerContract.address);
    sptFarm = (await ethers.getContractAt(artifacts.SptFarm.abi, res.address)) as SptFarm;
    transactions.push({"description": "Deploy SptFarm", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed SptFarm to ${sptFarm.address}`);
  }
  if((await farmController.farmIndices(sptFarm.address)).eq(0) && await farmController.governance() == signerAddress) {
    console.log("Registering SptFarm in FarmController");
    let tx = await farmController.connect(deployer).registerFarm(sptFarm.address, sptFarmAllocPoints);
    let receipt = await tx.wait();
    transactions.push({"description": "Register SptFarm in FarmController", "to": farmController.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function deployCompoundProduct() {
  if(!!COMPOUND_PRODUCT_ADDRESS) {
    compoundProduct = (await ethers.getContractAt(artifacts.CompoundProductRinkeby.abi, COMPOUND_PRODUCT_ADDRESS)) as CompoundProductRinkeby;
  } else {
    console.log("Deploying CompoundProduct");
    var res = await create2Contract(deployer,artifacts.CompoundProductRinkeby,[signerAddress,policyManager.address,registry.address,COMPTROLLER_ADDRESS,minPeriod,maxPeriod], {}, "", deployerContract.address);
    compoundProduct = (await ethers.getContractAt(artifacts.CompoundProductRinkeby.abi, res.address)) as CompoundProductRinkeby;
    transactions.push({"description": "Deploy CompoundProduct", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed CompoundProduct to ${compoundProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(compoundProduct.address))) {
    console.log("Registering CompoundProduct in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(compoundProduct.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register CompoundProduct in PolicyManager", "to": policyManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(compoundProduct.address))) {
    let tx = await riskManager.connect(deployer).addProduct(compoundProduct.address,10000,price,10);
    let receipt = await tx.wait();
    transactions.push({"description": "Register CompoundProduct in RiskManager", "to": riskManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function deployWaaveProduct() {
  if(!!WAAVE_PRODUCT_ADDRESS) {
    waaveProduct = (await ethers.getContractAt(artifacts.WaaveProduct.abi, WAAVE_PRODUCT_ADDRESS)) as WaaveProduct;
  } else {
    console.log("Deploying WaaveProduct");
    var res = await create2Contract(deployer,artifacts.WaaveProduct,[signerAddress,policyManager.address,registry.address,WAAVE_REGISTRY_ADDRESS,minPeriod,maxPeriod], {}, "", deployerContract.address);
    waaveProduct = (await ethers.getContractAt(artifacts.WaaveProduct.abi, res.address)) as WaaveProduct;
    transactions.push({"description": "Deploy WaaveProduct", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed WaaveProduct to ${waaveProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(waaveProduct.address))) {
    console.log("Registering WaaveProduct in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(waaveProduct.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register WaaveProduct in PolicyManager", "to": policyManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(waaveProduct.address))) {
    console.log("Registering WaaveProduct in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(waaveProduct.address,100,price,10);
    let receipt = await tx.wait();
    transactions.push({"description": "Register WaaveProduct in RiskManager", "to": riskManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function deployLiquityProduct() {
  if(!!LIQUITY_PRODUCT_ADDRESS) {
    liquityProduct = (await ethers.getContractAt(artifacts.LiquityProduct.abi, LIQUITY_PRODUCT_ADDRESS)) as LiquityProduct;
  } else {
    console.log("Deploying LiquityProduct");
    var res = await create2Contract(deployer,artifacts.LiquityProduct,[signerAddress,policyManager.address,registry.address,TROVE_MANAGER_ADDRESS,minPeriod,maxPeriod], {}, "", deployerContract.address);
    liquityProduct = (await ethers.getContractAt(artifacts.LiquityProduct.abi, res.address)) as LiquityProduct;
    transactions.push({"description": "Deploy LiquityProduct", "to": deployerContract.address, "gasLimit": res.gasUsed});
    console.log(`Deployed LiquityProduct to ${liquityProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(liquityProduct.address))) {
    console.log("Registering LiquityProduct in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(liquityProduct.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register LiquityProduct in PolicyManager", "to": policyManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await riskManager.governance() == signerAddress && !(await riskManager.productIsActive(liquityProduct.address))) {
    console.log("Registering LiquityProduct in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(liquityProduct.address,10000,price,10);
    let receipt = await tx.wait();
    transactions.push({"description": "Register LiquityProduct in RiskManager", "to": riskManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function addSigners() {
  console.log("Adding signers");
  let productNames = ["CompoundProduct", "WaaveProduct", "LiquityProduct"];
  let productAddresses = [compoundProduct.address, waaveProduct.address, liquityProduct.address];
  for(let i = 0; i < productAddresses.length; ++i) {
    let name = productNames[i];
    let addr = productAddresses[i];
    let productContract = await ethers.getContractAt(artifacts.BaseProduct.abi, addr);
    if(await productContract.governance() == signerAddress && !(await productContract.isAuthorizedSigner(PACLAS_SIGNER_ADDRESS))) {
      console.log(`Adding signer to ${name} ${addr}`);
      let tx = await productContract.connect(deployer).addSigner(PACLAS_SIGNER_ADDRESS);
      await tx.wait();
      console.log(`Added signer to ${name} ${addr}\n`);
    }
  }
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
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
  logContractAddress("SptFarm", sptFarm.address);

  logContractAddress("CompoundProduct", compoundProduct.address);
  logContractAddress("WaaveProduct", waaveProduct.address);
  logContractAddress("LiquityProduct", liquityProduct.address);

  console.log(``);
  console.log(`Copy and paste this into the .env file in the frontend client.`)
  console.log(``);
  console.log(`REACT_APP_RINKEBY_REGISTRY_CONTRACT_ADDRESS=${registry.address}`);
  console.log(`REACT_APP_RINKEBY_WETH_CONTRACT_ADDRESS=${weth.address}`);
  console.log(`REACT_APP_RINKEBY_VAULT_CONTRACT_ADDRESS=${vault.address}`);
  console.log(`REACT_APP_RINKEBY_CLAIMS_ESCROW_CONTRACT_ADDRESS=${claimsEscrow.address}`);
  console.log(`REACT_APP_RINKEBY_TREASURY_CONTRACT_ADDRESS=${treasury.address}`);
  console.log(`REACT_APP_RINKEBY_POLICY_MANAGER_CONTRACT_ADDRESS=${policyManager.address}`);
  console.log(`REACT_APP_RINKEBY_POLICY_DESCRIPTOR_CONTRACT_ADDRESS=${policyDescriptor.address}`);
  console.log(`REACT_APP_RINKEBY_RISK_MANAGER_CONTRACT_ADDRESS=${riskManager.address}`);
  console.log(`REACT_APP_RINKEBY_COMPOUND_PRODUCT_CONTRACT_ADDRESS=${compoundProduct.address}`);
  console.log(`REACT_APP_RINKEBY_WAAVE_PRODUCT_CONTRACT_ADDRESS=${waaveProduct.address}`);
  console.log(`REACT_APP_RINKEBY_LIQUITY_PRODUCT_CONTRACT_ADDRESS=${liquityProduct.address}`);
  console.log("")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

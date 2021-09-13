import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
import { config as dotenv_config } from "dotenv";
const BN = ethers.BigNumber;
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { writeFileSync } from "fs";
import { create2Contract } from "./create2Contract";

import { logContractAddress } from "./utils";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Registry, Weth9, Vault, ClaimsEscrow, Treasury, PolicyManager, PolicyDescriptor, RiskManager, ExchangeQuoterManual, CompoundProductRinkeby, WaaveProduct } from "../typechain";

const REGISTRY_ADDRESS          = "0x501ACEe6AAf57d5e37488145844f47c079a8F253";
const VAULT_ADDRESS             = "0x501AcebC38338bC8c18843dc14fD4345f4DecF33";
const CLAIMS_ESCROW_ADDRESS     = "0x501AcE79a4b961cf86C5cCA36B7157Faf78A248D";
const TREASURY_ADDRESS          = "0x501acE64D1B4dddAD50a579d28e8F9805651307D";
const POLICY_MANAGER_ADDRESS    = "0x501ACeDE6cb432a1AA5590C04b88a6E92C00F381";
const POLICY_DESCR_ADDRESS      = "0x501ACEA6EA69f4a4B68c8496243D3614256AC242";
const RISK_MANAGER_ADDRESS      = "0x501aCE0596b8Fdb2Eb7b2CF4644c7bb4485Ec971";

const QUOTER_MANUAL_ADDRESS     = "0x501Ace288Bc04Dd86CEC06A56168F2abFaacA8Af";
const COMPOUND_PRODUCT_ADDRESS  = "0x501acEdD6d13CE6597fb1fEc45eC0b2e66BbF2A3";
const WAAVE_PRODUCT_ADDRESS     = "0x501ACE7070A38fA4398afaac304308D3a0912C50";

const WETH_ADDRESS              = "0xc778417E063141139Fce010982780140Aa0cD5Ab";
const COMPTROLLER_ADDRESS       = "0x2EAa9D77AE4D8f9cdD9FAAcd44016E746485bddb";
const UNISWAP_ROUTER_ADDRESS    = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const WAAVE_REGISTRY_ADDRESS    = "0x670Fc618C48964F806Cd655600541807ed83a9C5";
const SINGLETON_FACTORY_ADDRESS = "0xce0042B868300000d44A59004Da54A005ffdcf9f";

// product params
const minPeriod = 6450; // this is about 1 day
const maxPeriod = 2354250; // this is about 1 year from https://ycharts.com/indicators/ethereum_blocks_per_day
const price = 11044; // 2.60%/yr

let artifacts: ArtifactImports;
let registry: Registry;
let weth: Weth9;
let vault: Vault;
let claimsEscrow: ClaimsEscrow;
let treasury: Treasury;
let policyManager: PolicyManager;
let policyDescriptor: PolicyDescriptor;
let riskManager: RiskManager;

let quoterManual: ExchangeQuoterManual;

let compoundProduct: CompoundProductRinkeby;
let waaveProduct: WaaveProduct;

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
  await deployRegistry();
  await deployWeth();
  await deployVault();
  await deployClaimsEscrow();
  await deployTreasury();
  await deployPolicyManager();
  await deployPolicyDescriptor();
  await deployRiskManager();
  // quoters
  await deployQuoterManual();
  // products
  await deployCompoundProduct();
  await deployWaaveProduct();

  writeFileSync("stash/transactions/deployTransactionsRinkeby.json", JSON.stringify(transactions, undefined, '  '));
  await logAddresses();
}

async function deployRegistry() {
  if(!!REGISTRY_ADDRESS) {
    registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry");
    var res = await create2Contract(deployer,artifacts.Registry,[signerAddress]);
    registry = (await ethers.getContractAt(artifacts.Registry.abi, res.address)) as Registry;
    transactions.push({"description": "Deploy Registry", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
    console.log(`Deployed Registry to ${registry.address}`);
  }
}

async function deployWeth() {
  weth = (new ethers.Contract(WETH_ADDRESS, artifacts.WETH.abi, provider)) as Weth9;
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
    var res = await create2Contract(deployer,artifacts.Vault,[signerAddress,registry.address]);
    vault = (await ethers.getContractAt(artifacts.Vault.abi, res.address)) as Vault;
    transactions.push({"description": "Deploy Vault", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
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
    var res = await create2Contract(deployer,artifacts.ClaimsEscrow,[signerAddress,registry.address]);
    claimsEscrow = (await ethers.getContractAt(artifacts.ClaimsEscrow.abi, res.address)) as ClaimsEscrow;
    transactions.push({"description": "Deploy ClaimsEscrow", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
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
    let tx = await vault.connect(deployer).setRequestor(claimsEscrow.address, true);
    let receipt = await tx.wait();
    transactions.push({"description": "Add ClaimsEscrow as Vault Requestor", "to": vault.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function deployTreasury() {
  if(!!TREASURY_ADDRESS) {
    treasury = (await ethers.getContractAt(artifacts.Treasury.abi, TREASURY_ADDRESS)) as Treasury;
  } else {
    console.log("Deploying Treasury");
    var res = await create2Contract(deployer,artifacts.Treasury,[signerAddress,UNISWAP_ROUTER_ADDRESS,registry.address]);
    treasury = (await ethers.getContractAt(artifacts.Treasury.abi, res.address)) as Treasury;
    transactions.push({"description": "Deploy Treasury", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
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
    let tx = await vault.connect(deployer).setRequestor(treasury.address, true);
    let receipt = await tx.wait();
    transactions.push({"description": "Add Treasury as Vault Requestor", "to": vault.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function deployPolicyManager() {
  if(!!POLICY_MANAGER_ADDRESS) {
    policyManager = (await ethers.getContractAt(artifacts.PolicyManager.abi, POLICY_MANAGER_ADDRESS)) as PolicyManager;
  } else {
    console.log("Deploying PolicyManager");
    var res = await create2Contract(deployer,artifacts.PolicyManager,[signerAddress]);
    policyManager = (await ethers.getContractAt(artifacts.PolicyManager.abi, res.address)) as PolicyManager;
    transactions.push({"description": "Deploy PolicyManager", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
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
    policyDescriptor = (await ethers.getContractAt(artifacts.PolicyDescriptor.abi, POLICY_DESCR_ADDRESS)) as PolicyDescriptor;
  } else {
    console.log("Deploying PolicyDescriptor");
    var res = await create2Contract(deployer,artifacts.PolicyDescriptor);
    policyDescriptor = (await ethers.getContractAt(artifacts.PolicyDescriptor.abi, res.address)) as PolicyDescriptor;
    transactions.push({"description": "Deploy PolicyDescriptor", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
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
    var res = await create2Contract(deployer,artifacts.RiskManager,[signerAddress,registry.address]);
    riskManager = (await ethers.getContractAt(artifacts.RiskManager.abi, res.address)) as RiskManager;
    transactions.push({"description": "Deploy RiskManager", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
    console.log(`Deployed RiskManager to ${riskManager.address}`);
  }
  if(await registry.riskManager() != riskManager.address && await registry.governance() == signerAddress) {
    console.log("Registering RiskManager");
    let tx = await registry.connect(deployer).setRiskManager(riskManager.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register RiskManager", "to": registry.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function deployQuoterManual() {
  if(!!QUOTER_MANUAL_ADDRESS) {
    quoterManual = (await ethers.getContractAt(artifacts.ExchangeQuoterManual.abi, QUOTER_MANUAL_ADDRESS)) as ExchangeQuoterManual;
  } else {
    console.log("Deploying ExchangeQuoterManual");
    var res = await create2Contract(deployer,artifacts.ExchangeQuoterManual,[signerAddress]);
    quoterManual = (await ethers.getContractAt(artifacts.ExchangeQuoterManual.abi, res.address)) as ExchangeQuoterManual;
    transactions.push({"description": "Deploy ExchangeQuoterManual", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
    console.log(`Deployed ExchangeQuoterManual to ${quoterManual.address}`);
  }
}

async function deployCompoundProduct() {
  if(!!COMPOUND_PRODUCT_ADDRESS) {
    compoundProduct = (await ethers.getContractAt(artifacts.CompoundProductRinkeby.abi, COMPOUND_PRODUCT_ADDRESS)) as CompoundProductRinkeby;
  } else {
    console.log("Deploying CompoundProduct");
    var res = await create2Contract(deployer,artifacts.CompoundProductRinkeby,[signerAddress,policyManager.address,registry.address,COMPTROLLER_ADDRESS,minPeriod,maxPeriod,price,10]);
    compoundProduct = (await ethers.getContractAt(artifacts.CompoundProductRinkeby.abi, res.address)) as CompoundProductRinkeby;
    transactions.push({"description": "Deploy CompoundProduct", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
    console.log(`Deployed CompoundProduct to ${compoundProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(compoundProduct.address))) {
    console.log("Registering CompoundProduct in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(compoundProduct.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register CompoundProduct in PolicyManager", "to": policyManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await riskManager.governance() == signerAddress && (await riskManager.weight(compoundProduct.address) == 0)) {
    console.log("Registering CompoundProduct in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(compoundProduct.address,10000);
    let receipt = await tx.wait();
    transactions.push({"description": "Register CompoundProduct in RiskManager", "to": riskManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function deployWaaveProduct() {
  if(!!WAAVE_PRODUCT_ADDRESS) {
    waaveProduct = (await ethers.getContractAt(artifacts.WaaveProduct.abi, WAAVE_PRODUCT_ADDRESS)) as WaaveProduct;
  } else {
    console.log("Deploying WaaveProduct");
    var res = await create2Contract(deployer,artifacts.WaaveProduct,[signerAddress,policyManager.address,registry.address,WAAVE_REGISTRY_ADDRESS,minPeriod,maxPeriod,price,10]);
    waaveProduct = (await ethers.getContractAt(artifacts.WaaveProduct.abi, res.address)) as WaaveProduct;
    transactions.push({"description": "Deploy WaaveProduct", "to": SINGLETON_FACTORY_ADDRESS, "gasLimit": res.gasUsed});
    console.log(`Deployed WaaveProduct to ${waaveProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(waaveProduct.address))) {
    console.log("Registering WaaveProduct in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(waaveProduct.address);
    let receipt = await tx.wait();
    transactions.push({"description": "Register WaaveProduct in PolicyManager", "to": policyManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
  if(await riskManager.governance() == signerAddress && (await riskManager.weight(waaveProduct.address) == 0)) {
    console.log("Registering WaaveProduct in RiskManager");
    let tx = await riskManager.connect(deployer).addProduct(waaveProduct.address,10000);
    let receipt = await tx.wait();
    transactions.push({"description": "Register WaaveProduct in RiskManager", "to": riskManager.address, "gasLimit": receipt.gasUsed.toString()});
  }
}

async function logAddresses() {
  console.log("")
  logContractAddress("Contract Name", "Address")
  console.log("-------------------------------------------------------------");
  logContractAddress("Registry", registry.address);
  logContractAddress("WETH", weth.address);
  logContractAddress("Vault", vault.address);
  logContractAddress("ClaimsEscrow", claimsEscrow.address);
  logContractAddress("Treasury", treasury.address);
  logContractAddress("PolicyManager", policyManager.address);
  logContractAddress("PolicyDescriptor", policyDescriptor.address);
  logContractAddress("RiskManager", riskManager.address);

  logContractAddress("QuoterManual", quoterManual.address);
  logContractAddress("CompoundProduct", compoundProduct.address);
  logContractAddress("WaaveProduct", waaveProduct.address);

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
  console.log("")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

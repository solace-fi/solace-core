import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { deployContract, provider } = waffle;
import { BigNumber as BN, Contract, constants } from "ethers";
import { config as dotenv_config } from "dotenv";
dotenv_config();
import { LedgerSigner } from "@ethersproject/hardware-wallets";
const deployer = new LedgerSigner(provider);

import { logContractAddress, createPool } from "./utils";
import { FeeAmount } from "../test/utilities/uniswap";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Solace, Weth9, Vault, Master, CpFarm, SolaceEthLpFarm, Treasury, Registry, LpAppraisor, PolicyManager, ExchangeQuoterManual, CompoundProductRinkeby } from "../typechain";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MULTI_SIG_ADDRESS = "0xB0bcf50b18f0DCa889EdC4a299aF4cEd7cB4cb17";
const PACLAS_SIGNER = "0x5b9Fa5eF9D366d7cB5296E1f3F4013D55EBdf4A4";

// These will be empty strings before deployment.
// Fill them in as they are deployed.
// In case of failure during deployment, simply rerun the script.
// Contracts that have already been deployed will not be redeployed.
const REGISTRY_ADDRESS         = "0x218EEa1517F9CCc0f115fea6cd48f55afD49a3f8";
const SOLACE_ADDRESS           = "0x44B843794416911630e74bAB05021458122c40A0";
const WETH_ADDRESS             = "0xc778417E063141139Fce010982780140Aa0cD5Ab"
const MASTER_ADDRESS           = "0xE458cd47D29E06CCe18a1D95AD2712F223d3a6DC";
const VAULT_ADDRESS            = "0xB01866e0Ef4D87368F675A83Fd3491072561A9C4";
const CPFARM_ADDRESS           = "0xD3F4db71939D91c9efcA23FCA60318E3099e3e8B";
const LPFARM_ADDRESS           = "0xC6cdf0093981f52991b8aaCe63800eAC9f2c96E9";
const LPAPPRAISOR_ADDRESS      = "0x5c764BE8890fA09A71122342D53cCbdc748da39C";
const TREASURY_ADDRESS         = "0xBE89BC18af93Cb31c020a826C10B90b8BdcDC483";

//const POLICY_MANAGER_ADDRESS   = "0x0B27dD1660406e170ff4c4315D65Bd085F31a07a";
const POLICY_MANAGER_ADDRESS   = "0x5682b79F24e999576Ab8A9C9C0E81Bfc168B960F";
const QUOTER_MANUAL_ADDRESS    = "0xAC162c43D533CE1fd732bcE94894e7EF212A77a1";
//const COMPOUND_PRODUCT_ADDRESS = "0x660985613a2257107C9aE41EfBd9074932609893";
const COMPOUND_PRODUCT_ADDRESS = "0xB08807D96dC2bF753Cee983353aF57d7cA530173";

const UNISWAP_FACTORY_ADDRESS  = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const UNISWAP_ROUTER_ADDRESS   = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const UNISWAP_LPTOKEN_ADDRESS  = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const UNISWAP_POOL_ADDRESS     = "0x29998355C51F2eddff0B12a183B8BDD590EDaed1";
const COMPTROLLER_ADDRESS      = "0x2EAa9D77AE4D8f9cdD9FAAcd44016E746485bddb";

// farm params
const START_BLOCK = BN.from(8523000); // May 3, 2021 on Rinkeby
const END_BLOCK = START_BLOCK.add(2500000); // little over a year
const BLOCK_REWARD = BN.from("60000000000000000000"); // 60 SOLACE

const minPeriod = 6450; // this is about 1 day
const maxPeriod = 2354250; // this is about 1 year from https://ycharts.com/indicators/ethereum_blocks_per_day
const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
const maxCoverPerUser = BN.from("10000000000000000000"); // 10 Ether in wei
const cancelFee = BN.from("100000000000000000"); // 0.1 Ether in wei
const price = 11044; // 2.60%/yr

let artifacts: ArtifactImports;
let registry: Registry;
let solace: Solace;
let weth: Weth9;
let master: Master;
let vault: Vault;
let cpFarm: CpFarm;
let lpFarm: SolaceEthLpFarm;
let treasury: Treasury;
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let lpToken: Contract;
let pool: Contract;
let lpTokenAppraisor: LpAppraisor;

let policyManager: PolicyManager;
let quoterManual: ExchangeQuoterManual;
let compoundProduct: CompoundProductRinkeby;

let signerAddress: string;
let governorAddress = MULTI_SIG_ADDRESS;

async function main() {
  artifacts = await import_artifacts();
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
  await deployLpTokenAppraisor();
  await deployLpFarm();
  await deployTreasury();
  await transferRegistry();

  await deployPolicyManager();
  await deployQuoterManual();
  await deployCompoundProduct();

  await logAddresses();
}

async function deployRegistry() {
  if(!!REGISTRY_ADDRESS) {
    registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry");
    registry = (await deployContract(deployer,artifacts.Registry, [signerAddress])) as Registry;
    console.log(`Deployed Registry to ${registry.address}`);
  }
}

async function deploySolace() {
  if(!!SOLACE_ADDRESS) {
    solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    solace = (await deployContract(deployer, artifacts.SOLACE, [governorAddress])) as Solace;
    console.log(`Deployed SOLACE to ${solace.address}`);
  }
  if(await registry.solace() != solace.address && await registry.governance() == signerAddress) {
    console.log("Registering SOLACE");
    await registry.connect(deployer).setSolace(solace.address);
  }
}

async function deployWeth() {
  if(!!WETH_ADDRESS) {
    weth = (await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS)) as Weth9;
  } else {
    console.log("Deploying WETH");
    weth = (await deployContract(deployer,artifacts.WETH)) as Weth9;
    console.log(`Deployed WETH to ${weth.address}`);
  }
}

async function deployMaster() {
  if(!!MASTER_ADDRESS) {
    master = (await ethers.getContractAt(artifacts.Master.abi, MASTER_ADDRESS)) as Master;
  } else {
    console.log("Deploying Master");
    master = (await deployContract(deployer,artifacts.Master,[governorAddress,solace.address,BLOCK_REWARD])) as Master;
    console.log(`Deployed Master to ${master.address}`);
  }
  if(await registry.master() != master.address && await registry.governance() == signerAddress) {
    console.log("Registering Master");
    await registry.connect(deployer).setMaster(master.address);
  }
}

async function deployVault() {
  if(!!VAULT_ADDRESS) {
    vault = (await ethers.getContractAt(artifacts.Vault.abi, VAULT_ADDRESS)) as Vault;
  } else {
    console.log("Deploying Vault");
    vault = (await deployContract(deployer,artifacts.Vault,[governorAddress,registry.address,weth.address])) as Vault;
    console.log(`Deployed Vault to ${vault.address}`);
  }
  if(await registry.vault() != vault.address && await registry.governance() == signerAddress) {
    console.log("Registering Vault");
    await registry.connect(deployer).setVault(vault.address);
  }
}

async function deployCpFarm() {
  if(!!CPFARM_ADDRESS) {
    cpFarm = (await ethers.getContractAt(artifacts.CpFarm.abi, CPFARM_ADDRESS)) as CpFarm;
  } else {
    console.log("Deploying CP Farm");
    cpFarm = (await deployContract(deployer,artifacts.CpFarm,[governorAddress,master.address,vault.address,solace.address,START_BLOCK,END_BLOCK,uniswapRouter.address,weth.address])) as CpFarm;
    console.log(`Deployed CP Farm to ${cpFarm.address}`);
  }
}

async function deployUniswapFactory() {
  if(!!UNISWAP_FACTORY_ADDRESS) {
    uniswapFactory = await ethers.getContractAt(artifacts.UniswapV3Factory.abi, UNISWAP_FACTORY_ADDRESS);
  } else {
    console.log("Deploying Uniswap Factory");
    uniswapFactory = await deployContract(deployer,artifacts.UniswapV3Factory);
    console.log(`Deployed Uniswap Factory to ${uniswapFactory.address}`);
  }
}

async function deployUniswapRouter() {
  if(!!UNISWAP_ROUTER_ADDRESS) {
    uniswapRouter = await ethers.getContractAt(artifacts.SwapRouter.abi, UNISWAP_ROUTER_ADDRESS);
  } else {
    console.log("Deploying Uniswap Router");
    uniswapRouter = await deployContract(deployer,artifacts.SwapRouter,[uniswapFactory.address,weth.address]);
    console.log(`Deployed Uniswap Router to ${uniswapRouter.address}`);
  }
}

async function deployUniswapLpToken() {
  if(!!UNISWAP_LPTOKEN_ADDRESS) {
    lpToken = await ethers.getContractAt(artifacts.NonfungiblePositionManager.abi, UNISWAP_LPTOKEN_ADDRESS);
  } else {
    console.log("Deploying Uniswap LP Token");
    lpToken = await deployContract(deployer,artifacts.NonfungiblePositionManager,[uniswapFactory.address,weth.address,ZERO_ADDRESS]);
    console.log(`Deployed Uniswap LP Token to ${lpToken.address}`);
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

    console.log(`Deployed LP Farm to ${lpFarm.address}`);
  }
}

async function deployTreasury() {
  if(!!TREASURY_ADDRESS) {
    treasury = (await ethers.getContractAt(artifacts.Treasury.abi, TREASURY_ADDRESS)) as Treasury;
  } else {
    console.log("Deploying Treasury");
    treasury = (await deployContract(deployer,artifacts.Treasury,[governorAddress,solace.address,uniswapRouter.address,weth.address])) as Treasury;
    console.log(`Deployed Treasury to ${treasury.address}`);
  }
  if(await registry.treasury() != treasury.address && await registry.governance() == signerAddress) {
    console.log("Registering Treasury");
    await registry.connect(deployer).setTreasury(treasury.address);
  }
}

async function deployPolicyManager() {
  if(!!POLICY_MANAGER_ADDRESS) {
    policyManager = (await ethers.getContractAt(artifacts.PolicyManager.abi, POLICY_MANAGER_ADDRESS)) as PolicyManager;
  } else {
    console.log("Deploying PolicyManager");
    policyManager = (await deployContract(deployer,artifacts.PolicyManager)) as PolicyManager;
    console.log(`Deployed PolicyManager to ${policyManager.address}`);
  }
}

async function deployQuoterManual() {
  if(!!QUOTER_MANUAL_ADDRESS) {
    quoterManual = (await ethers.getContractAt(artifacts.ExchangeQuoterManual.abi, QUOTER_MANUAL_ADDRESS)) as ExchangeQuoterManual;
  } else {
    console.log("Deploying ExchangeQuoterManual");
    quoterManual = (await deployContract(deployer,artifacts.ExchangeQuoterManual,[signerAddress])) as ExchangeQuoterManual;
    console.log(`Deployed ExchangeQuoterManual to ${quoterManual.address}`);
  }
}

async function deployCompoundProduct() {
  if(!!COMPOUND_PRODUCT_ADDRESS) {
    compoundProduct = (await ethers.getContractAt(artifacts.CompoundProductRinkeby.abi, COMPOUND_PRODUCT_ADDRESS)) as CompoundProductRinkeby;
  } else {
    console.log("Deploying CompoundProduct");
    compoundProduct = (await deployContract(deployer,artifacts.CompoundProductRinkeby,[policyManager.address,treasury.address,COMPTROLLER_ADDRESS,ZERO_ADDRESS,price,cancelFee,minPeriod,maxPeriod,maxCoverAmount,maxCoverPerUser,quoterManual.address])) as CompoundProductRinkeby;
    console.log(`Deployed CompoundProduct to ${compoundProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await compoundProduct.isAuthorizedSigner(PACLAS_SIGNER))){
    console.log("Adding paclas as authorized signer");
    await compoundProduct.connect(deployer).addSigner(PACLAS_SIGNER);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(compoundProduct.address))) {
    console.log("Registering CompoundProduct in PolicyManager");
    await policyManager.connect(deployer).addProduct(compoundProduct.address);
  }
  if((await policyManager.totalSupply()).eq(0)) {
    console.log("buying policy");
    var quote = await compoundProduct.getQuote("0x0fb78424e5021404093aa0cfcf50b176b30a3c1d", "0xd6801a1dffcd0a410336ef88def4320d6df1883e", 5000, 19350);
    quote = quote.mul(11).div(10);
    await compoundProduct.connect(deployer).buyPolicy("0x0fb78424e5021404093aa0cfcf50b176b30a3c1d", "0xd6801a1dffcd0a410336ef88def4320d6df1883e", 5000, 19350, {value: quote});
    console.log("buying another");
    await compoundProduct.connect(deployer).buyPolicy("0x0fb78424e5021404093aa0cfcf50b176b30a3c1d", "0xd6801a1dffcd0a410336ef88def4320d6df1883e", 5000, 19350, {value: quote});
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
  logContractAddress("PolicyManager", policyManager.address);
  logContractAddress("QuoterManual", quoterManual.address);
  logContractAddress("CompoundProduct", compoundProduct.address);
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
  console.log(`REACT_APP_POLICY_MANAGER_CONTRACT_ADDRESS=${policyManager.address}`);
  console.log(`REACT_APP_COMPOUND_PRODUCT_CONTRACT_ADDRESS=${compoundProduct.address}`);
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

import { config as dotenv_config } from "dotenv";
dotenv_config();
import { BigNumber as BN, Contract, constants, ethers } from "ethers";
let provider = new ethers.providers.AlchemyProvider(42, process.env.KOVAN_ALCHEMY_KEY);
//import { LedgerSigner } from "@ethersproject/hardware-wallets";
//const deployer = new LedgerSigner(provider);
const deployer = new ethers.Wallet(JSON.parse(process.env.KOVAN_ACCOUNTS || '[]')[0], provider);
import { deployContract } from "ethereum-waffle";

import { logContractAddress, createPool } from "./utils";
import { FeeAmount } from "../test/utilities/uniswap";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Solace, Weth9, Vault, Master, CpFarm, SolaceEthLpFarm, Treasury, Registry, LpAppraisor, PolicyManager, ExchangeQuoterManual, AaveV2Product, ClaimsEscrow } from "../typechain";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PACLAS_SIGNER = "0x5b9Fa5eF9D366d7cB5296E1f3F4013D55EBdf4A4";

// These will be empty strings before deployment.
// Fill them in as they are deployed.
// In case of failure during deployment, simply rerun the script.
// Contracts that have already been deployed will not be redeployed.
const REGISTRY_ADDRESS         = "0x3C79D096F74e2900f29A3d54A62296baE1D8d979";
const SOLACE_ADDRESS           = "0x656F8EC5745623B8C5286d77987668716B20ac06";
const WETH_ADDRESS             = "0xd0A1E359811322d97991E03f863a0C30C2cF029C"
const CLAIMS_ESCROW_ADDRESS    = "0x4f13d2330169184a208871b17483b0f67a12D93c";
const VAULT_ADDRESS            = "0xbc24DE8Ec8a8c19BC4f84514A604537c6466Ec3D";
const MASTER_ADDRESS           = "0xC9EBCAEa83fcE6A0f1931847D9bA35f6B7C3Dbd4";
const CPFARM_ADDRESS           = "0x76fE1cc7643F172b946A028A489C9431E5B74dA6";
const LPAPPRAISOR_ADDRESS      = "0x8D9eC7Dc6153b624294015d93D031A343050A8D0";
const LPFARM_ADDRESS           = "0x4172805b024e800Bd9A7A3AaaAb09E24bf15af3b";
const TREASURY_ADDRESS         = "0xbB16ebD85b0D0e752F34CAb7763D6Ee14264bAD8";

const POLICY_MANAGER_ADDRESS   = "0x1d3397Ba5Dfd05b7c220A0f69B425a8c15d8De4b";
const QUOTER_MANUAL_ADDRESS    = "0x9Fb3B6b3CC825c01DD1853745E8c2b747c46Ea37";
const AAVE_PRODUCT_ADDRESS     = "0x999083fe30fa6eB975d2b24AeF4751a0012173e4";

const UNISWAP_FACTORY_ADDRESS  = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const UNISWAP_ROUTER_ADDRESS   = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const UNISWAP_LPTOKEN_ADDRESS  = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const UNISWAP_POOL_ADDRESS     = "0x2da3C98C158Ae16274Ad04bbc2EF114F167C5AAF";

const AAVE_DATA_PROVIDER       = "0x3c73A5E5785cAC854D468F727c606C07488a29D6";
const AAVE_LENDING_POOL        = "0xE0fBa4Fc209b4948668006B2bE61711b7f465bAe";

// farm params
const START_BLOCK = BN.from(26000000); // July 2021 on Rinkeby
const END_BLOCK = START_BLOCK.add(2500000); // little over a year
const BLOCK_REWARD = BN.from("60000000000000000000"); // 60 SOLACE

const minPeriod = 6450; // this is about 1 day
const maxPeriod = 2354250; // this is about 1 year from https://ycharts.com/indicators/ethereum_blocks_per_day
const maxCoverAmount = BN.from("1000000000000000000000"); // 1000 Ether in wei
const maxCoverPerUser = BN.from("10000000000000000000"); // 10 Ether in wei
const cancelFee = BN.from("1000000000000000"); // 0.001 Ether in wei
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
let claimsEscrow: ClaimsEscrow;

let policyManager: PolicyManager;
let quoterManual: ExchangeQuoterManual;
let aaveProduct: AaveV2Product;

let signerAddress: string;

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
  await deployClaimsEscrow();
  await deployVault();
  await deployMaster();
  await deployCpFarm();
  await deployLpTokenAppraisor();
  await deployLpFarm();
  await deployTreasury();

  await deployPolicyManager();
  await deployQuoterManual();
  await deployAaveProduct();

  await logAddresses();
}

async function deployRegistry() {
  if(!!REGISTRY_ADDRESS) {
    //registry = (await ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
    registry = (new ethers.Contract(REGISTRY_ADDRESS, artifacts.Registry.abi, provider)) as Registry;
  } else {
    console.log("Deploying Registry");
    registry = (await deployContract(deployer,artifacts.Registry, [signerAddress])) as Registry;
    console.log(`Deployed Registry to ${registry.address}`);
  }
}

async function deploySolace() {
  if(!!SOLACE_ADDRESS) {
    //solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
    solace = (new ethers.Contract(SOLACE_ADDRESS, artifacts.SOLACE.abi, provider)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    solace = (await deployContract(deployer, artifacts.SOLACE, [signerAddress])) as Solace;
    console.log(`Deployed SOLACE to ${solace.address}`);
  }
  if(await registry.solace() != solace.address && await registry.governance() == signerAddress) {
    console.log("Registering SOLACE");
    await registry.connect(deployer).setSolace(solace.address);
  }
}

async function deployWeth() {
  if(!!WETH_ADDRESS) {
    //weth = (await ethers.getContractAt(artifacts.WETH.abi, WETH_ADDRESS)) as Weth9;
    weth = (new ethers.Contract(WETH_ADDRESS, artifacts.WETH.abi, provider)) as Weth9;
  } else {
    console.log("Deploying WETH");
    weth = (await deployContract(deployer,artifacts.WETH)) as Weth9;
    console.log(`Deployed WETH to ${weth.address}`);
  }
}

async function deployMaster() {
  if(!!MASTER_ADDRESS) {
    //master = (await ethers.getContractAt(artifacts.Master.abi, MASTER_ADDRESS)) as Master;
    master = (new ethers.Contract(MASTER_ADDRESS, artifacts.Master.abi, provider)) as Master;
  } else {
    console.log("Deploying Master");
    master = (await deployContract(deployer,artifacts.Master,[signerAddress,solace.address,BLOCK_REWARD])) as Master;
    console.log(`Deployed Master to ${master.address}`);
  }
  if(await registry.master() != master.address && await registry.governance() == signerAddress) {
    console.log("Registering Master");
    await registry.connect(deployer).setMaster(master.address);
  }
}

async function deployClaimsEscrow() {
  if(!!CLAIMS_ESCROW_ADDRESS) {
    //claimsEscrow = (await ethers.getContractAt(artifacts.ClaimsEscrow.abi, CLAIMS_ESCROW_ADDRESS)) as ClaimsEscrow;
    claimsEscrow = (new ethers.Contract(CLAIMS_ESCROW_ADDRESS, artifacts.ClaimsEscrow.abi, provider)) as ClaimsEscrow;
  } else {
    console.log("Deploying ClaimsEscrow");
    claimsEscrow = (await deployContract(deployer,artifacts.ClaimsEscrow,[signerAddress,registry.address])) as ClaimsEscrow;
    console.log(`Deployed ClaimsEscrow to ${claimsEscrow.address}`);
  }
  if(await registry.claimsEscrow() != claimsEscrow.address && await registry.governance() == signerAddress) {
    console.log("Registering ClaimsEscrow");
    await registry.connect(deployer).setClaimsEscrow(claimsEscrow.address);
  }
}

async function deployVault() {
  if(!!VAULT_ADDRESS) {
    //vault = (await ethers.getContractAt(artifacts.Vault.abi, VAULT_ADDRESS)) as Vault;
    vault = (new ethers.Contract(VAULT_ADDRESS, artifacts.Vault.abi, provider)) as Vault;
  } else {
    console.log("Deploying Vault");
    vault = (await deployContract(deployer,artifacts.Vault,[signerAddress,registry.address,weth.address])) as Vault;
    console.log(`Deployed Vault to ${vault.address}`);
  }
  if(await registry.vault() != vault.address && await registry.governance() == signerAddress) {
    console.log("Registering Vault");
    await registry.connect(deployer).setVault(vault.address);
  }
}

async function deployCpFarm() {
  if(!!CPFARM_ADDRESS) {
    //cpFarm = (await ethers.getContractAt(artifacts.CpFarm.abi, CPFARM_ADDRESS)) as CpFarm;
    cpFarm = (new ethers.Contract(CPFARM_ADDRESS, artifacts.CpFarm.abi, provider)) as CpFarm;
  } else {
    console.log("Deploying CP Farm");
    console.log("args")

    cpFarm = (await deployContract(deployer,artifacts.CpFarm,[signerAddress,master.address,vault.address,solace.address,START_BLOCK,END_BLOCK,uniswapRouter.address,weth.address])) as CpFarm;
    console.log(`Deployed CP Farm to ${cpFarm.address}`);
  }
  if((await master.farmIndices(cpFarm.address)).eq(0) && await master.governance() == signerAddress) {
    console.log("Registering CpFarm");
    await master.connect(deployer).registerFarm(cpFarm.address, 50);
  }
}

async function deployUniswapFactory() {
  if(!!UNISWAP_FACTORY_ADDRESS) {
    //uniswapFactory = await ethers.getContractAt(artifacts.UniswapV3Factory.abi, UNISWAP_FACTORY_ADDRESS);
    uniswapFactory = (new ethers.Contract(UNISWAP_FACTORY_ADDRESS, artifacts.UniswapV3Factory.abi, provider));
  } else {
    console.log("Deploying Uniswap Factory");
    uniswapFactory = await deployContract(deployer,artifacts.UniswapV3Factory);
    console.log(`Deployed Uniswap Factory to ${uniswapFactory.address}`);
  }
}

async function deployUniswapRouter() {
  if(!!UNISWAP_ROUTER_ADDRESS) {
    //uniswapRouter = await ethers.getContractAt(artifacts.SwapRouter.abi, UNISWAP_ROUTER_ADDRESS);
    uniswapRouter = (new ethers.Contract(UNISWAP_ROUTER_ADDRESS, artifacts.SwapRouter.abi, provider));
  } else {
    console.log("Deploying Uniswap Router");
    uniswapRouter = await deployContract(deployer,artifacts.SwapRouter,[uniswapFactory.address,weth.address]);
    console.log(`Deployed Uniswap Router to ${uniswapRouter.address}`);
  }
}

async function deployUniswapLpToken() {
  if(!!UNISWAP_LPTOKEN_ADDRESS) {
    //lpToken = await ethers.getContractAt(artifacts.NonfungiblePositionManager.abi, UNISWAP_LPTOKEN_ADDRESS);
    lpToken = (new ethers.Contract(UNISWAP_LPTOKEN_ADDRESS, artifacts.NonfungiblePositionManager.abi, provider));
  } else {
    console.log("Deploying Uniswap LP Token");
    lpToken = await deployContract(deployer,artifacts.NonfungiblePositionManager,[uniswapFactory.address,weth.address,ZERO_ADDRESS]);
    console.log(`Deployed Uniswap LP Token to ${lpToken.address}`);
  }
}

async function deployUniswapPool() {
  if(!!UNISWAP_POOL_ADDRESS) {
    //pool = await ethers.getContractAt(artifacts.UniswapV3Pool.abi, UNISWAP_POOL_ADDRESS);
    pool = (new ethers.Contract(UNISWAP_POOL_ADDRESS, artifacts.UniswapV3Pool.abi, provider));
  } else {
    console.log("Deploying then initializing SOLACE-ETH Pool");
    pool = await createPool(deployer, uniswapFactory, weth.address, solace.address, FeeAmount.MEDIUM);
    console.log(`Deployed SOLACE-ETH pool to ${pool.address}`);
  }
}

async function deployLpTokenAppraisor() {
  if(!!LPAPPRAISOR_ADDRESS) {
    //lpTokenAppraisor = (await ethers.getContractAt(artifacts.LpAppraisor.abi, LPAPPRAISOR_ADDRESS)) as LpAppraisor;
    lpTokenAppraisor = (new ethers.Contract(LPAPPRAISOR_ADDRESS, artifacts.LpAppraisor.abi, provider)) as LpAppraisor;
  } else {
    console.log("Deploying LP Token Appraisor");
    lpTokenAppraisor = (await deployContract(deployer,artifacts.LpAppraisor,[signerAddress,lpToken.address,20000,40000])) as LpAppraisor;
    console.log(`Deploying LP Token Appraisor to ${lpTokenAppraisor.address}`);
    await lpTokenAppraisor.deployed();
    console.log("Deployment confirmed");
  }
}

async function deployLpFarm() {
  if(!!LPFARM_ADDRESS) {
    //lpFarm = (await ethers.getContractAt(artifacts.SolaceEthLpFarm.abi, LPFARM_ADDRESS)) as SolaceEthLpFarm;
    lpFarm = (new ethers.Contract(LPFARM_ADDRESS, artifacts.SolaceEthLpFarm.abi, provider)) as SolaceEthLpFarm;
  } else {
    console.log("Deploying LP Farm");
    lpFarm = (await deployContract(deployer,artifacts.SolaceEthLpFarm,[signerAddress,master.address,lpToken.address,solace.address,START_BLOCK,END_BLOCK,pool.address,weth.address,lpTokenAppraisor.address])) as SolaceEthLpFarm;
    console.log(`Deployed LP Farm to ${lpFarm.address}`);
  }
  if((await master.farmIndices(lpFarm.address)).eq(0) && await master.governance() == signerAddress) {
    console.log("Registering LpFarm");
    await master.connect(deployer).registerFarm(lpFarm.address, 50);
  }
}

async function deployTreasury() {
  if(!!TREASURY_ADDRESS) {
    //treasury = (await ethers.getContractAt(artifacts.Treasury.abi, TREASURY_ADDRESS)) as Treasury;
    treasury = (new ethers.Contract(TREASURY_ADDRESS, artifacts.Treasury.abi, provider)) as Treasury;
  } else {
    console.log("Deploying Treasury");
    treasury = (await deployContract(deployer,artifacts.Treasury,[signerAddress,uniswapRouter.address,weth.address,registry.address])) as Treasury;
    console.log(`Deployed Treasury to ${treasury.address}`);
  }
  if(await registry.treasury() != treasury.address && await registry.governance() == signerAddress) {
    console.log("Registering Treasury");
    await registry.connect(deployer).setTreasury(treasury.address);
  }
}

async function deployPolicyManager() {
  if(!!POLICY_MANAGER_ADDRESS) {
    //policyManager = (await ethers.getContractAt(artifacts.PolicyManager.abi, POLICY_MANAGER_ADDRESS)) as PolicyManager;
    policyManager = (new ethers.Contract(POLICY_MANAGER_ADDRESS, artifacts.PolicyManager.abi, provider)) as PolicyManager;
  } else {
    console.log("Deploying PolicyManager");
    policyManager = (await deployContract(deployer,artifacts.PolicyManager,[signerAddress])) as PolicyManager;
    console.log(`Deployed PolicyManager to ${policyManager.address}`);
  }
}

async function deployQuoterManual() {
  if(!!QUOTER_MANUAL_ADDRESS) {
    //quoterManual = (await ethers.getContractAt(artifacts.ExchangeQuoterManual.abi, QUOTER_MANUAL_ADDRESS)) as ExchangeQuoterManual;
    quoterManual = (new ethers.Contract(QUOTER_MANUAL_ADDRESS, artifacts.ExchangeQuoterManual.abi, provider)) as ExchangeQuoterManual;
  } else {
    console.log("Deploying ExchangeQuoterManual");
    quoterManual = (await deployContract(deployer,artifacts.ExchangeQuoterManual,[signerAddress])) as ExchangeQuoterManual;
    console.log(`Deployed ExchangeQuoterManual to ${quoterManual.address}`);
  }
}

async function deployAaveProduct() {
  if(!!AAVE_PRODUCT_ADDRESS) {
    //aaveProduct = (await ethers.getContractAt(artifacts.AaveV2Product.abi, AAVE_PRODUCT_ADDRESS)) as AaveV2Product;
    aaveProduct = (new ethers.Contract(AAVE_PRODUCT_ADDRESS, artifacts.AaveV2Product.abi, provider)) as unknown as AaveV2Product;
  } else {
    console.log("Deploying AaveV2Product");
    aaveProduct = (await deployContract(deployer,artifacts.AaveV2Product,[signerAddress,policyManager.address,registry.address,AAVE_LENDING_POOL,maxCoverAmount,maxCoverPerUser,minPeriod,maxPeriod,cancelFee,price,quoterManual.address,AAVE_DATA_PROVIDER])) as unknown as AaveV2Product;
    console.log(`Deployed AaveV2Product to ${aaveProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await aaveProduct.isAuthorizedSigner(PACLAS_SIGNER))){
    console.log("Adding paclas as authorized signer");
    await aaveProduct.connect(deployer).addSigner(PACLAS_SIGNER);
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(aaveProduct.address))) {
    console.log("Registering AaveV2Product in PolicyManager");
    await policyManager.connect(deployer).addProduct(aaveProduct.address);
  }

  if(!AAVE_PRODUCT_ADDRESS) {
    let policyholder = "0x0fb78424e5021404093aA0cFcf50B176B30a3c1d";
    let positionContract = "0xeD9044cA8F7caCe8eACcD40367cF2bee39eD1b04";
    console.log("buying policy");
    var quote = await aaveProduct.getQuote(policyholder, positionContract, 5000, 19350);
    quote = quote.mul(10001).div(10000);
    await aaveProduct.connect(deployer).buyPolicy(policyholder, positionContract, 5000, 19350, {value: quote});
    console.log("buying another");
    quote = await aaveProduct.getQuote(policyholder, positionContract, 7500, 100000);
    quote = quote.mul(10001).div(10000);
    await aaveProduct.connect(deployer).buyPolicy(policyholder, positionContract, 7500, 100000, {value: quote});
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
  logContractAddress("ClaimsEscrow", claimsEscrow.address);
  logContractAddress("PolicyManager", policyManager.address);
  logContractAddress("QuoterManual", quoterManual.address);
  logContractAddress("AaveV2Product", aaveProduct.address);
  logContractAddress("UniswapFactory", uniswapFactory.address);
  logContractAddress("UniswapRouter", uniswapRouter.address);
  logContractAddress("UniswapLpToken", lpToken.address);
  logContractAddress("UniswapPool", pool.address);

  console.log(``);
  console.log(`Copy and paste this into the .env file in the frontend client.`)
  console.log(``);
  console.log(`REACT_APP_KOVAN_REGISTRY_CONTRACT_ADDRESS=${registry.address}`);
  console.log(`REACT_APP_KOVAN_SOLACE_CONTRACT_ADDRESS=${solace.address}`);
  console.log(`REACT_APP_KOVAN_WETH_CONTRACT_ADDRESS=${weth.address}`);
  console.log(`REACT_APP_KOVAN_MASTER_CONTRACT_ADDRESS=${master.address}`);
  console.log(`REACT_APP_KOVAN_CPFARM_CONTRACT_ADDRESS=${cpFarm.address}`);
  console.log(`REACT_APP_KOVAN_VAULT_CONTRACT_ADDRESS=${vault.address}`);
  console.log(`REACT_APP_KOVAN_LPFARM_CONTRACT_ADDRESS=${lpFarm.address}`);
  console.log(`REACT_APP_KOVAN_TREASURY_CONTRACT_ADDRESS=${treasury.address}`);
  console.log(`REACT_APP_KOVAN_CLAIMS_ESCROW_CONTRACT_ADDRESS=${claimsEscrow.address}`);
  console.log(`REACT_APP_KOVAN_POLICY_MANAGER_CONTRACT_ADDRESS=${policyManager.address}`);
  console.log(`REACT_APP_KOVAN_AAVE_PRODUCT_CONTRACT_ADDRESS=${aaveProduct.address}`);
  console.log(`REACT_APP_KOVAN_UNISWAP_FACTORY_CONTRACT_ADDRESS=${uniswapFactory.address}`);
  console.log(`REACT_APP_KOVAN_UNISWAP_ROUTER_CONTRACT_ADDRESS=${uniswapRouter.address}`);
  console.log(`REACT_APP_KOVAN_UNISWAP_LPTOKEN_CONTRACT_ADDRESS=${lpToken.address}`);
  console.log(`REACT_APP_KOVAN_UNISWAP_POOL_CONTRACT_ADDRESS=${pool.address}`);
  console.log("")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

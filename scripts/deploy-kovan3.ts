import hardhat from "hardhat";
const { waffle, upgrades } = hardhat;
const { deployContract, provider } = waffle;
import { config as dotenv_config } from "dotenv";
dotenv_config();
import { BigNumber as BN, Contract, constants, ethers, Wallet } from "ethers";
//let provider = new ethers.providers.AlchemyProvider(4, process.env.RINKEBY_ALCHEMY_KEY);
//import { LedgerSigner } from "@ethersproject/hardware-wallets";
//const deployer = new LedgerSigner(provider);
const deployer = new ethers.Wallet(JSON.parse(process.env.KOVAN_ACCOUNTS || '[]')[0], provider);
//import { deployContract } from "ethereum-waffle";
import { create2Contract } from "./create2Contract";

import { logContractAddress, createPool } from "./utils";
import { FeeAmount } from "../test/utilities/uniswap";

import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { Solace, Weth9, Vault, Master, CpFarm, SolaceEthLpFarm, Treasury, Registry, LpAppraisor, PolicyManager, RiskManager, ExchangeQuoterManual, AaveV2Product, ClaimsEscrow } from "../typechain";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MULTI_SIG_ADDRESS = "0xB0bcf50b18f0DCa889EdC4a299aF4cEd7cB4cb17";
const PACLAS_SIGNER = "0x5b9Fa5eF9D366d7cB5296E1f3F4013D55EBdf4A4";

// These will be empty strings before deployment.
// Fill them in as they are deployed.
// In case of failure during deployment, simply rerun the script.
// Contracts that have already been deployed will not be redeployed.
const REGISTRY_ADDRESS         = "0x26a2491B3Ae5D3c082e649c487EeE3F4d65A92e5";
const WETH_ADDRESS             = "0xd0A1E359811322d97991E03f863a0C30C2cF029C";
const VAULT_ADDRESS            = "0x501aCe6c3abd6280b430C907c96D7F44d91Bc2a2";
const CLAIMS_ESCROW_ADDRESS    = "0x501ACe8A390f7135cbAA6E894a0dF55fCD3046f9";
const TREASURY_ADDRESS         = "0x501ACeB63afBbae0DfADE20323B27C37254e661a";
const POLICY_MANAGER_ADDRESS   = "0x501aCeFC7BBEec76a50D634F53128e55C785eAE5";
const RISK_MANAGER_ADDRESS     = "0x501ACE15F7D2cF5b98565F9aF0c428B4e0450950";
const QUOTER_MANUAL_ADDRESS    = "0x501ACeEaa408F9bd4dda57c481bF95f03E22bdB0";
const AAVE_PRODUCT_ADDRESS     = "0x501ACE8a947ffBc7149Ca265438fec01211F61ef";

const SOLACE_ADDRESS           = "0x501ACE0f4Bb5CF45766b09e34545025BC22d3A9d";
const MASTER_ADDRESS           = "0x501AcE863d8B419f3154aeFb0065cebE58eb2B24";
const CPFARM_ADDRESS           = "0x501aCe3935b0a62Baf5faa74DF9C0240EA1E837C";
const LPAPPRAISOR_ADDRESS      = "0x501ACea58852cE4a15d27Bb7D5C981aD967fBB19";
const LPFARM_ADDRESS           = "0x501AceCc59b3A17799e9690a0749a9992032CA55";

const UNISWAP_FACTORY_ADDRESS  = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const UNISWAP_ROUTER_ADDRESS   = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const UNISWAP_LPTOKEN_ADDRESS  = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const UNISWAP_POOL_ADDRESS     = "0x12fea2c7d2e140021e8804cb6ab1cd4913799e4c";

const AAVE_DATA_PROVIDER       = "0x3c73A5E5785cAC854D468F727c606C07488a29D6";

// farm params
const START_BLOCK = BN.from(26000000); // July 2021 on Kovan
const END_BLOCK = START_BLOCK.add(2500000); // little over a year
const BLOCK_REWARD = BN.from("60000000000000000000"); // 60 SOLACE

const minPeriod = 6450; // this is about 1 day
const maxPeriod = 2354250; // this is about 1 year from https://ycharts.com/indicators/ethereum_blocks_per_day
const price = 11044; // 2.60%/yr

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
let uniswapFactory: Contract;
let uniswapRouter: Contract;
let lpToken: Contract;
let pool: Contract;
let lpTokenAppraisor: LpAppraisor;
let claimsEscrow: ClaimsEscrow;

let policyManager: PolicyManager;
let riskManager: RiskManager;
let quoterManual: ExchangeQuoterManual;
let aaveProduct: AaveV2Product;

let signerAddress: string;
let governorAddress = MULTI_SIG_ADDRESS;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();

  // pre-dao
  await deployRegistry();
  await deployWeth();
  await deployVault();
  await deployClaimsEscrow();
  await deployUniswapRouter();
  await deployTreasury();
  await deployPolicyManager();
  await deployRiskManager();
  await deployQuoterManual();
  await deployAaveProduct();
  // post-dao
  await deploySolace();
  await deployMaster();
  await deployCpFarm();
  await deployUniswapFactory();
  await deployUniswapLpToken();
  await deployUniswapPool();
  await deployLpTokenAppraisor();
  await deployLpFarm();
  //await transferRegistry();

  await logAddresses();
}

async function deployRegistry() {
  if(!!REGISTRY_ADDRESS) {
    registry = (await hardhat.ethers.getContractAt(artifacts.Registry.abi, REGISTRY_ADDRESS)) as Registry;
  } else {
    console.log("Deploying Registry");
    var addr = await create2Contract(deployer,artifacts.Registry,[signerAddress]);
    registry = (new ethers.Contract(addr, artifacts.Registry.abi, provider)) as Registry;
    console.log(`Deployed Registry to ${registry.address}`);
  }
}

async function deployWeth() {
  if(!!WETH_ADDRESS) {
    weth = (new ethers.Contract(WETH_ADDRESS, artifacts.WETH.abi, provider)) as Weth9;
  } else {
    console.log("Deploying WETH");
    weth = (await deployContract(deployer,artifacts.WETH)) as Weth9;
    console.log(`Deployed WETH to ${weth.address}`);
  }
}

async function deployVault() {
  if(!!VAULT_ADDRESS) {
    vault = (new ethers.Contract(VAULT_ADDRESS, artifacts.Vault.abi, provider)) as Vault;
  } else {
    console.log("Deploying Vault");
    var addr = await create2Contract(deployer,artifacts.Vault,[signerAddress,registry.address,weth.address]);
    vault = (new ethers.Contract(addr, artifacts.Vault.abi, provider)) as Vault;
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
    claimsEscrow = (new ethers.Contract(CLAIMS_ESCROW_ADDRESS, artifacts.ClaimsEscrow.abi, provider)) as ClaimsEscrow;
  } else {
    console.log("Deploying ClaimsEscrow");
    var addr = await create2Contract(deployer,artifacts.ClaimsEscrow,[signerAddress,registry.address]);
    claimsEscrow = (new ethers.Contract(addr, artifacts.ClaimsEscrow.abi, provider)) as ClaimsEscrow;
    console.log(`Deployed ClaimsEscrow to ${claimsEscrow.address}`);
  }
  if(await registry.claimsEscrow() != claimsEscrow.address && await registry.governance() == signerAddress) {
    console.log("Registering ClaimsEscrow");
    let tx = await registry.connect(deployer).setClaimsEscrow(claimsEscrow.address);
    await tx.wait();
  }
  if(!(await vault.isRequestor(claimsEscrow.address)) && await vault.governance() == signerAddress) {
    console.log("Adding ClaimsEscrow as Vault Requestor");
    let tx = await vault.connect(deployer).setRequestor(claimsEscrow.address, true);
    await tx.wait();
  }
}

async function deployTreasury() {
  if(!!TREASURY_ADDRESS) {
    treasury = (new ethers.Contract(TREASURY_ADDRESS, artifacts.Treasury.abi, provider)) as Treasury;
  } else {
    console.log("Deploying Treasury");
    var addr = await create2Contract(deployer,artifacts.Treasury,[signerAddress,uniswapRouter.address,weth.address,registry.address]);
    treasury = (new ethers.Contract(addr, artifacts.Treasury.abi, provider)) as Treasury;
    console.log(`Deployed Treasury to ${treasury.address}`);
  }
  if(await registry.treasury() != treasury.address && await registry.governance() == signerAddress) {
    console.log("Registering Treasury");
    let tx = await registry.connect(deployer).setTreasury(treasury.address);
    await tx.wait();
  }
  if(!(await vault.isRequestor(treasury.address)) && await vault.governance() == signerAddress) {
    console.log("Adding Treasury as Vault Requestor");
    let tx = await vault.connect(deployer).setRequestor(treasury.address, true);
    await tx.wait();
  }
}

async function deployPolicyManager() {
  if(!!POLICY_MANAGER_ADDRESS) {
    policyManager = (new ethers.Contract(POLICY_MANAGER_ADDRESS, artifacts.PolicyManager.abi, provider)) as PolicyManager;
  } else {
    console.log("Deploying PolicyManager");
    var addr = await create2Contract(deployer,artifacts.PolicyManager,[signerAddress]);
    policyManager = (new ethers.Contract(addr, artifacts.PolicyManager.abi, provider)) as PolicyManager;
    console.log(`Deployed PolicyManager to ${policyManager.address}`);
  }
  if(await registry.policyManager() != policyManager.address && await registry.governance() == signerAddress) {
    console.log("Registering PolicyManager");
    let tx = await registry.connect(deployer).setPolicyManager(policyManager.address);
    await tx.wait();
  }
}

async function deployRiskManager() {
  if(!!RISK_MANAGER_ADDRESS) {
    riskManager = (new ethers.Contract(RISK_MANAGER_ADDRESS, artifacts.RiskManager.abi, provider)) as RiskManager;
  } else {
    console.log("Deploying RiskManager");
    var addr = await create2Contract(deployer,artifacts.RiskManager,[signerAddress,registry.address]);
    riskManager = (new ethers.Contract(addr, artifacts.RiskManager.abi, provider)) as RiskManager;
    console.log(`Deployed RiskManager to ${riskManager.address}`);
  }
  if(await registry.riskManager() != riskManager.address && await registry.governance() == signerAddress) {
    console.log("Registering RiskManager");
    let tx = await registry.connect(deployer).setRiskManager(riskManager.address);
    await tx.wait();
  }
}

async function deployQuoterManual() {
  if(!!QUOTER_MANUAL_ADDRESS) {
    quoterManual = (new ethers.Contract(QUOTER_MANUAL_ADDRESS, artifacts.ExchangeQuoterManual.abi, provider)) as ExchangeQuoterManual;
  } else {
    console.log("Deploying ExchangeQuoterManual");
    var addr = await create2Contract(deployer,artifacts.ExchangeQuoterManual,[signerAddress]);
    quoterManual = (new ethers.Contract(addr, artifacts.ExchangeQuoterManual.abi, provider)) as ExchangeQuoterManual;
    console.log(`Deployed ExchangeQuoterManual to ${quoterManual.address}`);
  }
}

async function deployAaveProduct() {
  if(!!AAVE_PRODUCT_ADDRESS) {
    aaveProduct = (new ethers.Contract(AAVE_PRODUCT_ADDRESS, artifacts.AaveV2Product.abi, provider)) as unknown as AaveV2Product;
  } else {
    console.log("Deploying AaveV2Product");
    var addr = await create2Contract(deployer,artifacts.AaveV2Product,[signerAddress,policyManager.address,registry.address,AAVE_DATA_PROVIDER,minPeriod,maxPeriod,price,10]);
    aaveProduct = (new ethers.Contract(addr, artifacts.AaveV2Product.abi, provider)) as AaveV2Product;
    console.log(`Deployed AaveV2Product to ${aaveProduct.address}`);
  }
  if(await policyManager.governance() == signerAddress && !(await aaveProduct.isAuthorizedSigner(PACLAS_SIGNER))){
    console.log("Adding paclas as authorized signer");
    let tx = await aaveProduct.connect(deployer).addSigner(PACLAS_SIGNER);
    await tx.wait();
  }
  if(await policyManager.governance() == signerAddress && !(await policyManager.productIsActive(aaveProduct.address))) {
    console.log("Registering AaveV2Product in PolicyManager");
    let tx = await policyManager.connect(deployer).addProduct(aaveProduct.address);
    await tx.wait();
  }
  if(await riskManager.governance() == signerAddress && (await riskManager.weights(aaveProduct.address) == 0)) {
    console.log("Registering AaveV2Product in RiskManager");
    let tx = await riskManager.connect(deployer).setProductWeights([aaveProduct.address],[1]);
    await tx.wait();
  }

  if(!AAVE_PRODUCT_ADDRESS) {
    let policyholder = "0x0fb78424e5021404093aA0cFcf50B176B30a3c1d";
    let positionContract = "0xeD9044cA8F7caCe8eACcD40367cF2bee39eD1b04";
    console.log("buying policy");
    //var positionValue = await aaveProduct.appraisePosition(policyholder, positionContract);
    let coverAmount = "1000000000000000"; // 0.1% of an eth
    var quote = await aaveProduct.getQuote(policyholder, positionContract, coverAmount, 19350);
    let tx1 = await aaveProduct.connect(deployer).buyPolicy(policyholder, positionContract, coverAmount, 19350, {value: quote});
    await tx1.wait();
    console.log("buying another");
    coverAmount = "800000000000000"; // 0.08% of an eth
    quote = await aaveProduct.getQuote(policyholder, positionContract, coverAmount, 100000);
    let tx2 = await aaveProduct.connect(deployer).buyPolicy(policyholder, positionContract, coverAmount, 100000, {value: quote});
    await tx2.wait();
  }
}

async function transferRegistry() {
  if(await registry.governance() == signerAddress) {
    console.log("Transfering Registry");
    let tx = await registry.connect(deployer).setGovernance(governorAddress);
    await tx.wait();
  }
}

async function deploySolace() {
  if(!!SOLACE_ADDRESS) {
    solace = (new ethers.Contract(SOLACE_ADDRESS, artifacts.SOLACE.abi, provider)) as Solace;
  } else {
    console.log("Deploying SOLACE");
    var addr = await create2Contract(deployer, artifacts.SOLACE, [signerAddress]);
    solace = (new ethers.Contract(addr, artifacts.SOLACE.abi, provider)) as Solace;
    console.log(`Deployed SOLACE to ${solace.address}`);
  }
  if(await registry.solace() != solace.address && await registry.governance() == signerAddress) {
    console.log("Registering SOLACE");
    let tx = await registry.connect(deployer).setSolace(solace.address);
    await tx.wait();
  }
}

async function deployMaster() {
  if(!!MASTER_ADDRESS) {
    master = (new ethers.Contract(MASTER_ADDRESS, artifacts.Master.abi, provider)) as Master;
  } else {
    console.log("Deploying Master");
    var addr = await create2Contract(deployer,artifacts.Master,[signerAddress,solace.address,BLOCK_REWARD]);
    master = (new ethers.Contract(addr, artifacts.Master.abi, provider)) as Master;
    console.log(`Deployed Master to ${master.address}`);
  }
  if(await registry.master() != master.address && await registry.governance() == signerAddress) {
    console.log("Registering Master");
    let tx = await registry.connect(deployer).setMaster(master.address);
    await tx.wait();
  }
  if(await solace.minters(signerAddress) && (await solace.balanceOf(master.address)).eq(0)) {
    console.log("Minting SOLACE");
    let tx = await solace.connect(deployer).mint(master.address, "150000000000000000000000000");
    await tx.wait();
  }
}

async function deployCpFarm() {
  if(!!CPFARM_ADDRESS) {
    cpFarm = (new ethers.Contract(CPFARM_ADDRESS, artifacts.CpFarm.abi, provider)) as CpFarm;
  } else {
    console.log("Deploying CP Farm");
    var addr = await create2Contract(deployer,artifacts.CpFarm,[signerAddress,master.address,vault.address,solace.address,START_BLOCK,END_BLOCK,uniswapRouter.address,weth.address]);
    cpFarm = (new ethers.Contract(addr, artifacts.CpFarm.abi, provider)) as CpFarm;
    console.log(`Deployed CP Farm to ${cpFarm.address}`);
  }
  if((await master.farmIndices(cpFarm.address)).eq(0) && await master.governance() == signerAddress) {
    console.log("Registering CpFarm");
    let tx = await master.connect(deployer).registerFarm(cpFarm.address, 50);
    await tx.wait();
  }
}

async function deployUniswapFactory() {
  if(!!UNISWAP_FACTORY_ADDRESS) {
    uniswapFactory = (new ethers.Contract(UNISWAP_FACTORY_ADDRESS, artifacts.UniswapV3Factory.abi, provider));
  } else {
    console.log("Deploying Uniswap Factory");
    uniswapFactory = await deployContract(deployer,artifacts.UniswapV3Factory);
    console.log(`Deployed Uniswap Factory to ${uniswapFactory.address}`);
  }
}

async function deployUniswapRouter() {
  if(!!UNISWAP_ROUTER_ADDRESS) {
    uniswapRouter = (new ethers.Contract(UNISWAP_ROUTER_ADDRESS, artifacts.SwapRouter.abi, provider));
  } else {
    console.log("Deploying Uniswap Router");
    uniswapRouter = await deployContract(deployer,artifacts.SwapRouter,[uniswapFactory.address,weth.address]);
    console.log(`Deployed Uniswap Router to ${uniswapRouter.address}`);
  }
}

async function deployUniswapLpToken() {
  if(!!UNISWAP_LPTOKEN_ADDRESS) {
    lpToken = (new ethers.Contract(UNISWAP_LPTOKEN_ADDRESS, artifacts.NonfungiblePositionManager.abi, provider));
  } else {
    console.log("Deploying Uniswap LP Token");
    lpToken = await deployContract(deployer,artifacts.NonfungiblePositionManager,[uniswapFactory.address,weth.address,ZERO_ADDRESS]);
    console.log(`Deployed Uniswap LP Token to ${lpToken.address}`);
  }
}

async function deployUniswapPool() {
  if(!!UNISWAP_POOL_ADDRESS) {
    pool = (new ethers.Contract(UNISWAP_POOL_ADDRESS, artifacts.UniswapV3Pool.abi, provider));
  } else {
    console.log("Deploying then initializing SOLACE-ETH Pool");
    pool = await createPool(deployer, uniswapFactory, weth.address, solace.address, FeeAmount.MEDIUM);
    console.log(`Deployed SOLACE-ETH pool to ${pool.address}`);
  }
}

async function deployLpTokenAppraisor() {
  if(!!LPAPPRAISOR_ADDRESS) {
    lpTokenAppraisor = (new ethers.Contract(LPAPPRAISOR_ADDRESS, artifacts.LpAppraisor.abi, provider)) as LpAppraisor;
  } else {
    console.log("Deploying LP Token Appraisor");
    var addr = await create2Contract(deployer,artifacts.LpAppraisor,[signerAddress,lpToken.address,20000,40000]);
    lpTokenAppraisor = (new ethers.Contract(addr, artifacts.LpAppraisor.abi, provider)) as LpAppraisor;
    console.log(`Deployed LP Token Appraisor to ${lpTokenAppraisor.address}`);
  }
}

async function deployLpFarm() {
  if(!!LPFARM_ADDRESS) {
    lpFarm = (new ethers.Contract(LPFARM_ADDRESS, artifacts.SolaceEthLpFarm.abi, provider)) as SolaceEthLpFarm;
  } else {
    console.log("Deploying LP Farm");
    var addr = await create2Contract(deployer,artifacts.SolaceEthLpFarm,[signerAddress,master.address,lpToken.address,solace.address,START_BLOCK,END_BLOCK,pool.address,weth.address,lpTokenAppraisor.address]);
    lpFarm = (new ethers.Contract(addr, artifacts.SolaceEthLpFarm.abi, provider)) as SolaceEthLpFarm;
    console.log(`Deployed LP Farm to ${lpFarm.address}`);
  }
  if((await master.farmIndices(lpFarm.address)).eq(0) && await master.governance() == signerAddress) {
    console.log("Registering LpFarm");
    let tx = await master.connect(deployer).registerFarm(lpFarm.address, 50);
    await tx.wait();
  }
}

async function logAddresses() {
  console.log("")
  logContractAddress("Contract Name", "Address")
  console.log("-----------------------------------------------------------");
  logContractAddress("Registry", registry.address);
  logContractAddress("WETH", weth.address);
  logContractAddress("Vault", vault.address);
  logContractAddress("ClaimsEscrow", claimsEscrow.address);
  logContractAddress("Treasury", treasury.address);
  logContractAddress("PolicyManager", policyManager.address);
  logContractAddress("RiskManager", riskManager.address);
  logContractAddress("QuoterManual", quoterManual.address);
  logContractAddress("AaveV2Product", aaveProduct.address);

  logContractAddress("SOLACE", solace.address);
  logContractAddress("Master", master.address);
  logContractAddress("CpFarm", cpFarm.address);
  logContractAddress("LpFarm", lpFarm.address);
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
  console.log(`REACT_APP_KOVAN_RISK_MANAGER_CONTRACT_ADDRESS=${riskManager.address}`);
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

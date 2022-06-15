// deploys the bond contracts

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.PRIVATE_KEYS || '[]')[0], provider);

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Solace, BondDepository, BondTellerErc20, BondTellerEth, BondTellerMatic, BondTellerFtm } from "../../typechain";
import { BytesLike } from "ethers";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2Contract } from "./../create2Contract";
import { create2ContractStashed } from "../create2ContractStashed";
import { abiEncodeArgs } from "../../test/utilities/setStorage";
import { logContractAddress } from "./../utils";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const XSLOCKER_ADDRESS              = "0x501Ace47c5b0C2099C4464f681c3fa2ECD3146C1";
const DAO_ADDRESS                   = "0x4999d2076Ec9388a742A400B7632B8A07d59ae06";
const UNDERWRITING_POOL_ADDRESS     = "0xd1108a800363C262774B990e9DF75a4287d5c075";
const BOND_DEPO_ADDRESS             = "0x501ACe2f00EC599D4FDeA408680e192f88D94D0D";

const WMATIC_ADDRESS                = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
const MATIC_BOND_TELLER_ADDRESS     = "0x501aCe133452D4Df83CA68C684454fCbA608b9DD";

const DAI_ADDRESS                   = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
const DAI_BOND_TELLER_ADDRESS       = "0x501ACe677634Fd09A876E88126076933b686967a";

const WETH_ADDRESS                  = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
const WETH_BOND_TELLER_ADDRESS      = "0x501Ace367f1865DEa154236D5A8016B80a49e8a9";

const USDC_ADDRESS                  = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_BOND_TELLER_ADDRESS      = "0x501ACE7E977e06A3Cb55f9c28D5654C9d74d5cA9";

const WBTC_ADDRESS                  = "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6";
const WBTC_BOND_TELLER_ADDRESS      = "0x501aCEF0d0c73BD103337e6E9Fd49d58c426dC27";

const USDT_ADDRESS                  = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const USDT_BOND_TELLER_ADDRESS      = "0x501ACe5CeEc693Df03198755ee80d4CE0b5c55fE";

const FRAX_ADDRESS                  = "0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89";
const FRAX_BOND_TELLER_ADDRESS      = "0x501aCef4F8397413C33B13cB39670aD2f17BfE62";

let artifacts: ArtifactImports;

let solace: Solace;
let bondDepo: BondDepository;

let maticTeller: BondTellerMatic;
let daiTeller: BondTellerErc20;
let wethTeller: BondTellerErc20;
let usdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;
let fraxTeller: BondTellerErc20;

let signerAddress: string;
let networkSettings: any;

async function main() {
  artifacts = await import_artifacts();
  signerAddress = await deployer.getAddress();
  console.log(`Using ${signerAddress} as deployer and governor`);

  let chainID = (await provider.getNetwork()).chainId;
  networkSettings = getNetworkSettings(chainID);

  solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(SOLACE_ADDRESS);
  await expectDeployed(XSLOCKER_ADDRESS);
  await expectDeployed(DAO_ADDRESS);
  await expectDeployed(UNDERWRITING_POOL_ADDRESS);

  await expectDeployed(WMATIC_ADDRESS);
  await expectDeployed(DAI_ADDRESS);
  await expectDeployed(WETH_ADDRESS);
  await expectDeployed(USDC_ADDRESS);
  await expectDeployed(WBTC_ADDRESS);
  await expectDeployed(USDT_ADDRESS);
  await expectDeployed(FRAX_ADDRESS);

  // new underwriting
  await deployBondDepo();

  await deployMaticTeller();
  await deployDaiTeller();
  await deployEthTeller();
  await deployUsdcTeller();
  await deployWbtcTeller();
  await deployUsdtTeller();
  await deployFraxTeller();

  await logAddresses();
}

async function deployBondDepo() {
  if(await isDeployed(BOND_DEPO_ADDRESS)) {
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
  } else {
    console.log("Deploying BondDepository");
    await create2ContractStashed(
      "BondDepository",
      "scripts/contract_deploy_bytecodes/bonds/BondDepository.txt",
      "stash/contracts_processed/bonds/BondDepository.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      BOND_DEPO_ADDRESS,
      abiEncodeArgs([signerAddress, SOLACE_ADDRESS])
    );
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
    console.log(`Deployed BondDepository to ${bondDepo.address}`);
    await expectDeployed(bondDepo.address);

    if(!(await solace.isMinter(bondDepo.address)) && (await solace.governance()) == signerAddress) {
      console.log('Adding BondDepo as SOLACE minter');
      let tx2 = await solace.connect(deployer).addMinter(bondDepo.address);
      await tx2.wait(networkSettings.confirmations);
      console.log('Added BondDepo as SOLACE minter');
    }
  }
}

async function deployMaticTeller() {
  const NAME = "Solace MATIC Bond";

  if(await isDeployed(MATIC_BOND_TELLER_ADDRESS)) {
    maticTeller = (await ethers.getContractAt(artifacts.BondTellerMATIC.abi, MATIC_BOND_TELLER_ADDRESS)) as BondTellerMatic;
  } else {
    console.log("MATIC Teller - deploy");
    await create2ContractStashed(
      "BondTellerMatic",
      "scripts/contract_deploy_bytecodes/bonds/BondTellerMatic.txt",
      "stash/contracts_processed/bonds/BondTellerMatic.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      MATIC_BOND_TELLER_ADDRESS,
      ""
    );
    maticTeller = (await ethers.getContractAt(artifacts.BondTellerMATIC.abi, MATIC_BOND_TELLER_ADDRESS)) as BondTellerMatic;
    console.log(`MATIC Teller - deployed to ${maticTeller.address}`);
    await expectDeployed(maticTeller.address);
    console.log('MATIC teller - init');
    let tx1 = await maticTeller.connect(deployer).initialize(NAME, signerAddress, SOLACE_ADDRESS, XSLOCKER_ADDRESS, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, WMATIC_ADDRESS, false, bondDepo.address);
    await tx1.wait(networkSettings.confirmations);
    console.log('MATIC teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(maticTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('MATIC teller - set fees');
    let tx4 = await maticTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('MATIC teller - done');
  }
}

async function deployDaiTeller() {
  const NAME = "Solace DAI Bond";

  if(await isDeployed(DAI_BOND_TELLER_ADDRESS)) {
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("DAI Teller - deploy");
    await create2ContractStashed(
      "BondTellerErc20",
      "scripts/contract_deploy_bytecodes/bonds/BondTellerErc20.txt",
      "stash/contracts_processed/bonds/BondTellerErc20.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      DAI_BOND_TELLER_ADDRESS,
      ""
    );
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
    console.log(`DAI Teller - deployed to ${daiTeller.address}`);
    await expectDeployed(daiTeller.address);
    console.log('DAI teller - init');
    let tx1 = await daiTeller.connect(deployer).initialize(NAME, signerAddress, SOLACE_ADDRESS, XSLOCKER_ADDRESS, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, DAI_ADDRESS, false, bondDepo.address, networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);
    console.log('DAI teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(daiTeller.address, networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations);
    console.log('DAI teller - set fees');
    let tx4 = await daiTeller.connect(deployer).setFees(500, networkSettings.overrides);
    await tx4.wait(networkSettings.confirmations);
    console.log('DAI teller - done');
  }
}

async function deployEthTeller() {
  const NAME = "Solace ETH Bond";

  if(await isDeployed(WETH_BOND_TELLER_ADDRESS)) {
    wethTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, WETH_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("WETH Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000003ba0308";
    wethTeller = await cloneTeller(daiTeller, NAME, WETH_ADDRESS, false, salt);
    console.log(`WETH Teller - deployed to ${wethTeller.address}`);
    await expectDeployed(wethTeller.address);
    console.log('WETH teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(wethTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('WETH teller - set fees');
    let tx4 = await wethTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('WETH teller - done');
  }
}

async function deployUsdcTeller() {
  const NAME = "Solace USDC Bond";

  if(await isDeployed(USDC_BOND_TELLER_ADDRESS)) {
    usdcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("USDC Teller - deploy");
    var salt = "0x00000000000000000000000000000000000000000000000000000000019004c0";
    usdcTeller = await cloneTeller(daiTeller, NAME, USDC_ADDRESS, false, salt);
    console.log(`USDC Teller - deployed to ${usdcTeller.address}`);
    console.log('USDC teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(usdcTeller.address, networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations);
    console.log('USDC Teller - set fees');
    let tx4 = await usdcTeller.connect(deployer).setFees(500, networkSettings.overrides);
    await tx4.wait(networkSettings.confirmations);
    console.log('USDC Teller - done');
  }
}

async function deployWbtcTeller() {
  const NAME = "Solace WBTC Bond";

  if(await isDeployed(WBTC_BOND_TELLER_ADDRESS)) {
    wbtcTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, WBTC_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("WBTC Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000001f0cd1b";
    wbtcTeller = await cloneTeller(daiTeller, NAME, WBTC_ADDRESS, false, salt);
    console.log(`WBTC Teller - deployed to ${wbtcTeller.address}`);
    console.log('WBTC teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(wbtcTeller.address, networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations);
    console.log('WBTC Teller - set fees');
    let tx4 = await wbtcTeller.connect(deployer).setFees(500, networkSettings.overrides);
    await tx4.wait(networkSettings.confirmations);
    console.log('WBTC Teller - done');
  }
}

async function deployUsdtTeller() {
  const NAME = "Solace USDT Bond";

  if(await isDeployed(USDT_BOND_TELLER_ADDRESS)) {
    usdtTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, USDT_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("USDT Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000002153a56";
    usdtTeller = await cloneTeller(daiTeller, NAME, USDT_ADDRESS, false, salt);
    console.log(`USDT Teller - deployed to ${usdtTeller.address}`);
    console.log('USDT teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(usdtTeller.address, networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations);
    console.log('USDT Teller - set fees');
    let tx4 = await usdtTeller.connect(deployer).setFees(500, networkSettings.overrides);
    await tx4.wait(networkSettings.confirmations);
    console.log('USDT Teller - done');
  }
}

async function deployFraxTeller() {
  const NAME = "Solace FRAX Bond";

  if(await isDeployed(FRAX_BOND_TELLER_ADDRESS)) {
    fraxTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, FRAX_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("FRAX Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000002e3569f";
    fraxTeller = await cloneTeller(daiTeller, NAME, FRAX_ADDRESS, false, salt);
    console.log(`FRAX Teller - deployed to ${fraxTeller.address}`);
    console.log('FRAX teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(fraxTeller.address, networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations);
    console.log('FRAX Teller - set fees');
    let tx4 = await fraxTeller.connect(deployer).setFees(500, networkSettings.overrides);
    await tx4.wait(networkSettings.confirmations);
    console.log('FRAX Teller - done');
  }
}

async function cloneTeller(sourceTeller: BondTellerErc20, name: string, principal: string, isPermittable: boolean, salt: BytesLike) {
  await expectDeployed(sourceTeller.address);
  let addr = await sourceTeller.calculateMinimalProxyDeploymentAddress(salt);
  console.log(`cloning ${sourceTeller.address} to ${addr}`);
  let tx = await sourceTeller.clone(name, signerAddress, principal, isPermittable, salt, {...networkSettings.overrides, gasLimit: 500000});
  await tx.wait(networkSettings.confirmations);
  let newTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, addr)) as BondTellerErc20;
  await expectDeployed(newTeller.address);
  return newTeller;
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("BondDepository", bondDepo.address);
  logContractAddress("MATIC Bond Teller", maticTeller.address);
  logContractAddress("WETH Bond Teller", wethTeller.address);
  logContractAddress("DAI Bond Teller", daiTeller.address);
  logContractAddress("USDC Bond Teller", usdcTeller.address);
  logContractAddress("WBTC Bond Teller", wbtcTeller.address);
  logContractAddress("USDT Bond Teller", usdtTeller.address);
  logContractAddress("FRAX Bond Teller", fraxTeller.address);
  logContractAddress("WMATIC", WMATIC_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("USDT", USDT_ADDRESS);
  logContractAddress("FRAX", FRAX_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

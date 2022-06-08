// deploys the bond contracts

import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import fs from "fs";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const deployer = new ethers.Wallet(JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')[0], provider);

import { create2Contract } from "./../create2Contract";

import { logContractAddress } from "./../utils";

import { import_artifacts, ArtifactImports } from "./../../test/utilities/artifact_importer";
import { Deployer, Solace, BondDepository, BondTellerErc20, BondTellerEth, XsLocker, BondTellerFtm } from "../../typechain";
import { BytesLike, constants } from "ethers";
import { expectDeployed, isDeployed } from "../../test/utilities/expectDeployed";
import { getNetworkSettings } from "../getNetworkSettings";
import { create2ContractStashed } from "../create2ContractStashed";
import { abiEncodeArgs } from "../../test/utilities/setStorage";

const DEPLOYER_CONTRACT_ADDRESS    = "0x501aCe4732E4A80CC1bc5cd081BEe7f88ff694EF";

const BOND_START_TIME = BN.from("1638205200"); // 5 PM UTC November 29 2021
const MAX_UINT40 = BN.from("1099511627775");
const MAX_UINT128 = BN.from(1).shl(128).sub(1);
const ONE_ETHER = BN.from("1000000000000000000");

const SOLACE_ADDRESS                = "0x501acE9c35E60f03A2af4d484f49F9B1EFde9f40";
const XSLOCKER_ADDRESS              = "0x501Ace47c5b0C2099C4464f681c3fa2ECD3146C1";
const DAO_ADDRESS                   = "0x93F467AD42056fe34b27e658923bfae7AD26c5d7";
const UNDERWRITING_POOL_ADDRESS     = "0x2971f45c0952437934B3F055C401241e5C339F93";
const BOND_DEPO_ADDRESS             = "0x501ACe2f00EC599D4FDeA408680e192f88D94D0D";

const DAI_ADDRESS                   = "0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E";
const DAI_BOND_TELLER_ADDRESS       = "0x501ACe677634Fd09A876E88126076933b686967a";

const WETH_ADDRESS                  = "0x74b23882a30290451A17c44f4F05243b6b58C76d";
const WETH_BOND_TELLER_ADDRESS      = "0x501Ace367f1865DEa154236D5A8016B80a49e8a9";

const USDC_ADDRESS                  = "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75";
const USDC_BOND_TELLER_ADDRESS      = "0x501ACE7E977e06A3Cb55f9c28D5654C9d74d5cA9";

const WBTC_ADDRESS                  = "0x321162Cd933E2Be498Cd2267a90534A804051b11";
const WBTC_BOND_TELLER_ADDRESS      = "0x501aCEF0d0c73BD103337e6E9Fd49d58c426dC27";

const USDT_ADDRESS                  = "0x049d68029688eAbF473097a2fC38ef61633A3C7A";
const USDT_BOND_TELLER_ADDRESS      = "0x501ACe5CeEc693Df03198755ee80d4CE0b5c55fE";

const FRAX_ADDRESS                  = "0xdc301622e621166BD8E82f2cA0A26c13Ad0BE355";
const FRAX_BOND_TELLER_ADDRESS      = "0x501aCef4F8397413C33B13cB39670aD2f17BfE62";

const WFTM_ADDRESS                  = "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83";
const FTM_BOND_TELLER_ADDRESS       = "0x501ACE43A70b62744037c0ec78dD043BE35EF653";

let artifacts: ArtifactImports;
let deployerContract: Deployer;

let solace: Solace;
let xslocker: XsLocker;
let bondDepo: BondDepository;

let ftmTeller: BondTellerFtm;
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

  deployerContract = (await ethers.getContractAt(artifacts.Deployer.abi, DEPLOYER_CONTRACT_ADDRESS)) as Deployer;
  solace = (await ethers.getContractAt(artifacts.SOLACE.abi, SOLACE_ADDRESS)) as Solace;
  xslocker = (await ethers.getContractAt(artifacts.xsLocker.abi, XSLOCKER_ADDRESS)) as XsLocker;

  await expectDeployed(DEPLOYER_CONTRACT_ADDRESS);
  await expectDeployed(SOLACE_ADDRESS);
  await expectDeployed(XSLOCKER_ADDRESS);
  await expectDeployed(DAO_ADDRESS);
  await expectDeployed(UNDERWRITING_POOL_ADDRESS);

  await expectDeployed(WFTM_ADDRESS);
  await expectDeployed(DAI_ADDRESS);
  await expectDeployed(WETH_ADDRESS);
  await expectDeployed(USDC_ADDRESS);
  await expectDeployed(WBTC_ADDRESS);
  await expectDeployed(USDT_ADDRESS);
  await expectDeployed(FRAX_ADDRESS);

  // new underwriting
  await deployBondDepo();

  await deployFtmTeller();
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
  }
  /*
  console.log("Adding BondDepo as SOLACE minter");
  let tx2 = await solace.connect(deployer).addMinter(bondDepo.address, networkSettings.overrides);
  await tx2.wait(networkSettings.confirmations);
  */
}

async function deployFtmTeller() {
  const NAME = "Solace FTM Bond";

  if(await isDeployed(FTM_BOND_TELLER_ADDRESS)) {
    ftmTeller = (await ethers.getContractAt(artifacts.BondTellerFTM.abi, FTM_BOND_TELLER_ADDRESS)) as BondTellerFtm;
  } else {
    console.log("FTM Teller - deploy");
    var res = await create2Contract(deployer,artifacts.BondTellerFTM, [], {}, "", deployerContract.address);
    ftmTeller = (await ethers.getContractAt(artifacts.BondTellerFTM.abi, res.address)) as BondTellerFtm;
    console.log(`FTM Teller - deployed to ${ftmTeller.address}`);
    await expectDeployed(ftmTeller.address);
    console.log('FTM teller - init');
    let tx1 = await ftmTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xslocker.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, WFTM_ADDRESS, false, bondDepo.address);
    await tx1.wait(networkSettings.confirmations);
    console.log('FTM teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(ftmTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('FTM teller - set fees');
    let tx4 = await ftmTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('FTM teller - done');
  }
}

async function deployDaiTeller() {
  const NAME = "Solace DAI Bond";

  if(await isDeployed(DAI_BOND_TELLER_ADDRESS)) {
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("DAI Teller - deploy");
    //var res = await create2Contract(deployer, artifacts.BondTellerERC20, [], {}, "", deployerContract.address);
    //let bytecode = fs.readFileSync("scripts/contract_deploy_bytecodes/bonds/BondTellerErc20.txt").toString().trim();
    //let tx = await deployer.sendTransaction({...networkSettings.overrides, to: DEPLOYER_CONTRACT_ADDRESS, gasLimit: 6000000, data: bytecode});
    //await tx.wait(networkSettings.confirmations);
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
    let tx1 = await daiTeller.connect(deployer).initialize(NAME, signerAddress, solace.address, xslocker.address, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, DAI_ADDRESS, false, bondDepo.address, networkSettings.overrides);
    await tx1.wait(networkSettings.confirmations);
    console.log('DAI teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(daiTeller.address, networkSettings.overrides);
    await tx3.wait(networkSettings.confirmations);
    console.log('DAI teller - set fees');
    let tx4 = await daiTeller.connect(deployer).setFees(500, networkSettings.overrides);
    await tx4.wait(networkSettings.confirmations);
    console.log('DAI teller - done');
  }
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
  let tx = await sourceTeller.connect(deployer).clone(name, signerAddress, principal, isPermittable, salt, {...networkSettings.overrides, gasLimit: 500000});
  await tx.wait(networkSettings.confirmations);
  let newTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, addr)) as BondTellerErc20;
  await expectDeployed(newTeller.address);
  return newTeller;
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("SOLACE", solace.address);
  logContractAddress("xsLocker", xslocker.address);
  logContractAddress("BondDepository", bondDepo.address);
  logContractAddress("FTM Bond Teller", ftmTeller.address);
  logContractAddress("WETH Bond Teller", wethTeller.address);
  logContractAddress("DAI Bond Teller", daiTeller.address);
  logContractAddress("USDC Bond Teller", usdcTeller.address);
  logContractAddress("WBTC Bond Teller", wbtcTeller.address);
  logContractAddress("USDT Bond Teller", usdtTeller.address);
  logContractAddress("FRAX Bond Teller", fraxTeller.address);
  logContractAddress("WFTM", WFTM_ADDRESS);
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

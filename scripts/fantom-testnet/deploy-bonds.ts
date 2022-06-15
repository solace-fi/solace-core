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

const DEPLOYER_CONTRACT_ADDRESS     = "0x501acE4b4F9085348F60b61Fe3C95937a34565E7";

const SOLACE_ADDRESS                = "0x501ACE0C6DeA16206bb2D120484a257B9F393891";
const XSLOCKER_ADDRESS              = "0x501ACebF0918c99546b65cEdCD430e0D4A8E9167";
const DAO_ADDRESS                   = "0x501aceB2Ff39b3aC0189ba1ACe497C3dAB486F7B";
const UNDERWRITING_POOL_ADDRESS     = "0x501ace27A074471F099ffFeC008Bd1b151c7F7dE";
const BOND_DEPO_ADDRESS             = "0x501ace1DB88958A47CE7d968A23e7e66d1a95092";

const DAI_ADDRESS                   = "0xC709a8965eF42fD80b28F226E253283539ddBb12";
const DAI_BOND_TELLER_ADDRESS       = "0x501acED0B949D96B3289A1b37791cA8bD93B0D65";

const WETH_ADDRESS                  = "0x82b2c5950955cfEf23AD73675F7dC8C66cE23150";
const ETH_BOND_TELLER_ADDRESS       = "0x501AcE1CaC9c5c5c5e8Ac61575c7928E0A3397e7";

const USDC_ADDRESS                  = "0x1EE27c7c11E12dBa0F4b3aeEF9599D51Df06bB14";
const USDC_BOND_TELLER_ADDRESS      = "0x501AcE2248c1bB34f709f2768263A64A9805cCdB";

const WBTC_ADDRESS                  = "0xe3a5001b027168dc9b4b64311fc7a9eb87363d78";
const WBTC_BOND_TELLER_ADDRESS      = "0x501Ace54C7a2Cf564ae37538053902550a859D39";

const USDT_ADDRESS                  = "0xC382931bF0D86B0Fd04ecAC093676A61446F3E2d";
const USDT_BOND_TELLER_ADDRESS      = "0x501aCEa6ff6dcE05D108D616cE886AF74f00EAAa";

const FRAX_ADDRESS                  = "0x87Eba7597721C156240Ae7d8aE26e269118AFdca";
const FRAX_BOND_TELLER_ADDRESS      = "0x501acE87fF4E7A1498320ABB674a4960A87792E4";

const WFTM_ADDRESS                  = "0x4701b4535CDcC6541292fCef468836486D871250";
const FTM_BOND_TELLER_ADDRESS       = "0x501acEDb97de787b1A760AbD0e0FC1E5DfC033D8";

let artifacts: ArtifactImports;

let solace: Solace;
let bondDepo: BondDepository;

let daiTeller: BondTellerErc20;
let ethTeller: BondTellerErc20;
let usdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;
let fraxTeller: BondTellerErc20;
let ftmTeller: BondTellerFtm;

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
  //await expectDeployed(DAO_ADDRESS);
  //await expectDeployed(UNDERWRITING_POOL_ADDRESS);

  await expectDeployed(DAI_ADDRESS);
  await expectDeployed(WETH_ADDRESS);
  await expectDeployed(USDC_ADDRESS);
  await expectDeployed(WBTC_ADDRESS);
  await expectDeployed(USDT_ADDRESS);
  await expectDeployed(FRAX_ADDRESS);
  await expectDeployed(WFTM_ADDRESS);

  // new underwriting
  await deployBondDepo();

  await deployDaiTeller();
  await deployEthTeller();
  await deployUsdcTeller();
  await deployWbtcTeller();
  await deployUsdtTeller();
  await deployFraxTeller();
  await deployFtmTeller();

  await logAddresses();
}

async function deployBondDepo() {
  if(await isDeployed(BOND_DEPO_ADDRESS)) {
    bondDepo = (await ethers.getContractAt(artifacts.BondDepository.abi, BOND_DEPO_ADDRESS)) as BondDepository;
  } else {
    console.log("Deploying BondDepository");
    await create2ContractStashed(
      "BondDepository",
      "scripts/contract_deploy_bytecodes_aurora_testnet/bonds/BondDepository.txt",
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

async function deployDaiTeller() {
  const NAME = "Solace DAI Bond";

  if(await isDeployed(DAI_BOND_TELLER_ADDRESS)) {
    daiTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, DAI_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("DAI Teller - deploy");
    await create2ContractStashed(
      "BondTellerErc20",
      "scripts/contract_deploy_bytecodes_aurora_testnet/bonds/BondTellerErc20.txt",
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

  if(await isDeployed(ETH_BOND_TELLER_ADDRESS)) {
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, ETH_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("ETH Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000005089e28";
    ethTeller = await cloneTeller(daiTeller, NAME, WETH_ADDRESS, false, salt);
    await expectDeployed(ethTeller.address);
    console.log(`ETH Teller - deployed to ${ethTeller.address}`);
    console.log('ETH teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(ethTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('ETH teller - set fees');
    let tx4 = await ethTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('ETH teller - done');
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
    let tx3 = await bondDepo.connect(deployer).addTeller(usdcTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('USDC Teller - set fees');
    let tx4 = await usdcTeller.connect(deployer).setFees(500);
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
    let tx3 = await bondDepo.connect(deployer).addTeller(wbtcTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('WBTC Teller - set fees');
    let tx4 = await wbtcTeller.connect(deployer).setFees(500);
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
    let tx3 = await bondDepo.connect(deployer).addTeller(usdtTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('USDT Teller - set fees');
    let tx4 = await usdtTeller.connect(deployer).setFees(500);
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
    let tx3 = await bondDepo.connect(deployer).addTeller(fraxTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('FRAX Teller - set fees');
    let tx4 = await fraxTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('FRAX Teller - done');
  }
}

async function deployFtmTeller() {
  const NAME = "Solace FTM Bond";

  if(await isDeployed(FTM_BOND_TELLER_ADDRESS)) {
    ftmTeller = (await ethers.getContractAt(artifacts.BondTellerFTM.abi, FTM_BOND_TELLER_ADDRESS)) as BondTellerFtm;
  } else {
    console.log("FTM Teller - deploy");
    var res = await create2Contract(deployer,artifacts.BondTellerFTM, [], {}, "", DEPLOYER_CONTRACT_ADDRESS);
    ftmTeller = (await ethers.getContractAt(artifacts.BondTellerFTM.abi, res.address)) as BondTellerFtm;
    console.log(`FTM Teller - deployed to ${ftmTeller.address}`);
    await expectDeployed(ftmTeller.address);
    console.log('FTM teller - init');
    let tx1 = await ftmTeller.connect(deployer).initialize(NAME, signerAddress, SOLACE_ADDRESS, XSLOCKER_ADDRESS, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, WFTM_ADDRESS, false, bondDepo.address);
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

async function cloneTeller(sourceTeller: BondTellerErc20, name: string, principal: string, isPermittable: boolean, salt: BytesLike) {
  await expectDeployed(sourceTeller.address);
  let addr = await sourceTeller.calculateMinimalProxyDeploymentAddress(salt);
  console.log(`cloning ${sourceTeller.address} to ${addr}`);
  let tx = await sourceTeller.connect(deployer).clone(name, signerAddress, principal, isPermittable, salt, {...networkSettings.overrides, gasLimit: 500000});
  let receipt = await tx.wait(networkSettings.confirmations);
  let newTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, addr)) as BondTellerErc20;
  await expectDeployed(newTeller.address);
  return newTeller;
}

async function logAddresses() {
  console.log("");
  console.log("| Contract Name                | Address                                      |");
  console.log("|------------------------------|----------------------------------------------|");
  logContractAddress("BondDepository", bondDepo.address);
  logContractAddress("DAI Bond Teller", daiTeller.address);
  logContractAddress("ETH Bond Teller", ethTeller.address);
  logContractAddress("USDC Bond Teller", usdcTeller.address);
  logContractAddress("WBTC Bond Teller", wbtcTeller.address);
  logContractAddress("USDT Bond Teller", usdtTeller.address);
  logContractAddress("FRAX Bond Teller", fraxTeller.address);
  logContractAddress("FTM Bond Teller", ftmTeller.address);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("USDT", USDT_ADDRESS);
  logContractAddress("FRAX", FRAX_ADDRESS);
  logContractAddress("WFTM", WFTM_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

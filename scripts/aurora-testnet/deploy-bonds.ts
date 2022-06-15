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

const DAI_ADDRESS                   = "0x87Eba7597721C156240Ae7d8aE26e269118AFdca";
const DAI_BOND_TELLER_ADDRESS       = "0x501acED0B949D96B3289A1b37791cA8bD93B0D65";

const WETH_ADDRESS                  = "0xfBc3957C8448824D6b7928f160331ec595D0dC0E";
const ETH_BOND_TELLER_ADDRESS       = "0x501aCE92490feCEFACa6F9c9Fbe91caCBc823be1";

const USDC_ADDRESS                  = "0xd0062b097a077F1c9DC97aE082a7FE58a0Be03a8";
const USDC_BOND_TELLER_ADDRESS      = "0x501AcE2248c1bB34f709f2768263A64A9805cCdB";

const WBTC_ADDRESS                  = "0x952349F445Ee8A2D546E1E8c963f3004A87e5f93";
const WBTC_BOND_TELLER_ADDRESS      = "0x501Ace54C7a2Cf564ae37538053902550a859D39";

const USDT_ADDRESS                  = "0xb9D6BB8D150a566Eb93d097b9b65dc9b7455Dd67";
const USDT_BOND_TELLER_ADDRESS      = "0x501aCEa6ff6dcE05D108D616cE886AF74f00EAAa";

const FRAX_ADDRESS                  = "0x5405059004A74d191a07badC3e32501ac8A39788";
const FRAX_BOND_TELLER_ADDRESS      = "0x501acE87fF4E7A1498320ABB674a4960A87792E4";

const NEAR_ADDRESS                  = "0x80dAF9794A2b6f0A6B1E58c6Ae99803c028c00f8";
const NEAR_BOND_TELLER_ADDRESS      = "0x501AcE9D730dcf60d6bbD1FDDca9c1b69CAF0A61";

const AURORA_ADDRESS                = "0x034c971902b0B2EF37abd249c1A5DEc5Dc5bE14B";
const AURORA_BOND_TELLER_ADDRESS    = "0x501ACef4fDF8C0597aA40b5Cb82035FFe5Ad3552";

let artifacts: ArtifactImports;

let solace: Solace;
let bondDepo: BondDepository;

let daiTeller: BondTellerErc20;
let ethTeller: BondTellerEth;
let usdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;
let fraxTeller: BondTellerErc20;
let nearTeller: BondTellerErc20;
let auroraTeller: BondTellerErc20;

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
  await expectDeployed(NEAR_ADDRESS);
  await expectDeployed(AURORA_ADDRESS);

  // new underwriting
  await deployBondDepo();

  await deployDaiTeller();
  await deployEthTeller();
  await deployUsdcTeller();
  await deployWbtcTeller();
  await deployUsdtTeller();
  await deployFraxTeller();
  await deployNearTeller();
  await deployAuroraTeller();

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
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, ETH_BOND_TELLER_ADDRESS)) as BondTellerEth;
  } else {
    console.log("ETH Teller - deploy");
    await create2ContractStashed(
      "BondTellerErc20",
      "scripts/contract_deploy_bytecodes_aurora_testnet/bonds/BondTellerEth.txt",
      "stash/contracts_processed/bonds/BondTellerEth.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      ETH_BOND_TELLER_ADDRESS,
      ""
    );
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, ETH_BOND_TELLER_ADDRESS)) as BondTellerEth;
    console.log(`ETH Teller - deployed to ${ethTeller.address}`);
    await expectDeployed(ethTeller.address);
    console.log('ETH teller - init');
    let tx1 = await ethTeller.connect(deployer).initialize(NAME, signerAddress, SOLACE_ADDRESS, XSLOCKER_ADDRESS, UNDERWRITING_POOL_ADDRESS, DAO_ADDRESS, WETH_ADDRESS, false, bondDepo.address);
    await tx1.wait(networkSettings.confirmations);
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

async function deployNearTeller() {
  const NAME = "Solace NEAR Bond";

  if(await isDeployed(NEAR_BOND_TELLER_ADDRESS)) {
    nearTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, NEAR_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("NEAR Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000004843332";
    nearTeller = await cloneTeller(daiTeller, NAME, NEAR_ADDRESS, false, salt);
    console.log(`NEAR Teller - deployed to ${nearTeller.address}`);
    await expectDeployed(nearTeller.address);
    console.log('NEAR teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(nearTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('NEAR Teller - set fees');
    let tx4 = await nearTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('NEAR Teller - done');
  }
}

async function deployAuroraTeller() {
  const NAME = "Solace AURORA Bond";

  if(await isDeployed(AURORA_BOND_TELLER_ADDRESS)) {
    auroraTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, AURORA_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("AURORA Teller - deploy");
    var salt = "0x0000000000000000000000000000000000000000000000000000000005201ba9";
    auroraTeller = await cloneTeller(daiTeller, NAME, AURORA_ADDRESS, false, salt);
    console.log(`AURORA Teller - deployed to ${auroraTeller.address}`);
    await expectDeployed(auroraTeller.address);
    console.log('AURORA teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(auroraTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('AURORA Teller - set fees');
    let tx4 = await auroraTeller.connect(deployer).setFees(500);
    await tx4.wait(networkSettings.confirmations);
    console.log('AURORA Teller - done');
  }
}

async function cloneTeller(sourceTeller: BondTellerErc20, name: string, principal: string, isPermittable: boolean, salt: BytesLike) {
  await expectDeployed(sourceTeller.address);
  let addr = await sourceTeller.calculateMinimalProxyDeploymentAddress(salt);
  console.log(`cloning ${sourceTeller.address} to ${addr}`);
  let tx = await sourceTeller.clone(name, signerAddress, principal, isPermittable, salt, {...networkSettings.overrides, gasLimit: 500000});
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
  logContractAddress("NEAR Bond Teller", nearTeller.address);
  logContractAddress("AURORA Bond Teller", auroraTeller.address);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
  logContractAddress("USDC", USDC_ADDRESS);
  logContractAddress("WBTC", WBTC_ADDRESS);
  logContractAddress("USDT", USDT_ADDRESS);
  logContractAddress("FRAX", FRAX_ADDRESS);
  logContractAddress("NEAR", NEAR_ADDRESS);
  logContractAddress("AURORA", AURORA_ADDRESS);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

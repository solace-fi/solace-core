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
const DAO_ADDRESS                   = "0x501aceB2Ff39b3aC0189ba1ACe497C3dAB486F7B";
const UNDERWRITING_POOL_ADDRESS     = "0x501ace27A074471F099ffFeC008Bd1b151c7F7dE";
const BOND_DEPO_ADDRESS             = "0x501ACe2f00EC599D4FDeA408680e192f88D94D0D";

const DAI_ADDRESS                   = "0x31a1D59460a9619ec6965a5684C6d3Ae470D0fE5";
const DAI_BOND_TELLER_ADDRESS       = "0x501ACe677634Fd09A876E88126076933b686967a";

const WETH_ADDRESS                  = "0xd0A1E359811322d97991E03f863a0C30C2cF029C";
const ETH_BOND_TELLER_ADDRESS       = "0x501ACe95141F3eB59970dD64af0405f6056FB5d8";

const USDC_ADDRESS                  = "0x512d93ADc3DF4E24cb4b26c44A91682Ec073F559";
const USDC_BOND_TELLER_ADDRESS      = "0x501ACE7E977e06A3Cb55f9c28D5654C9d74d5cA9";

const WBTC_ADDRESS                  = "0x1063bf969F8D3D7296a2A94274D3df9202da2A3A";
const WBTC_BOND_TELLER_ADDRESS      = "0x501aCEF0d0c73BD103337e6E9Fd49d58c426dC27";

const USDT_ADDRESS                  = "0xAEA2B0F4763c8Ffc33A4c454CD08F803B02B6B53";
const USDT_BOND_TELLER_ADDRESS      = "0x501ACe5CeEc693Df03198755ee80d4CE0b5c55fE";

const SCP_ADDRESS                   = "0x501AcEe83a6f269B77c167c6701843D454E2EFA0";
const SCP_BOND_TELLER_ADDRESS       = "0x501ACe00FD8e5dB7C3be5e6D254ba4995e1B45b7";

const FRAX_ADDRESS                  = "0x58B23b32a9774153E1E344762751aDfdca2764DD";
const FRAX_BOND_TELLER_ADDRESS      = "0x501aCef4F8397413C33B13cB39670aD2f17BfE62";

let artifacts: ArtifactImports;

let solace: Solace;
let bondDepo: BondDepository;

let daiTeller: BondTellerErc20;
let ethTeller: BondTellerEth;
let usdcTeller: BondTellerErc20;
let wbtcTeller: BondTellerErc20;
let usdtTeller: BondTellerErc20;
let scpTeller: BondTellerErc20;
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
  //await expectDeployed(DAO_ADDRESS);
  //await expectDeployed(UNDERWRITING_POOL_ADDRESS);

  await expectDeployed(DAI_ADDRESS);
  await expectDeployed(WETH_ADDRESS);
  await expectDeployed(USDC_ADDRESS);
  await expectDeployed(WBTC_ADDRESS);
  await expectDeployed(USDT_ADDRESS);
  await expectDeployed(SCP_ADDRESS);
  await expectDeployed(FRAX_ADDRESS);

  // new underwriting
  await deployBondDepo();

  await deployDaiTeller();
  await deployEthTeller();
  await deployUsdcTeller();
  await deployWbtcTeller();
  await deployUsdtTeller();
  await deployScpTeller();
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

  if(await isDeployed(ETH_BOND_TELLER_ADDRESS)) {
    ethTeller = (await ethers.getContractAt(artifacts.BondTellerETH.abi, ETH_BOND_TELLER_ADDRESS)) as BondTellerEth;
  } else {
    console.log("ETH Teller - deploy");
    await create2ContractStashed(
      "BondTellerErc20",
      "scripts/contract_deploy_bytecodes/bonds/BondTellerEth.txt",
      "stash/contracts_processed/bonds/BondTellerEth.sol",
      deployer,
      DEPLOYER_CONTRACT_ADDRESS,
      DAI_BOND_TELLER_ADDRESS,
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

async function deployScpTeller() {
  const NAME = "Solace SCP Bond";

  if(await isDeployed(SCP_BOND_TELLER_ADDRESS)) {
    scpTeller = (await ethers.getContractAt(artifacts.BondTellerERC20.abi, SCP_BOND_TELLER_ADDRESS)) as BondTellerErc20;
  } else {
    console.log("SCP Teller - deploy");
    var salt = "0x000000000000000000000000000000000000000000000000000000000244cea9";
    scpTeller = await cloneTeller(daiTeller, NAME, SCP_ADDRESS, true, salt);
    console.log(`SCP Teller - deployed to ${scpTeller.address}`);
    console.log('SCP teller - add to bond depo');
    let tx3 = await bondDepo.connect(deployer).addTeller(scpTeller.address);
    await tx3.wait(networkSettings.confirmations);
    console.log('SCP Teller - done');
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
  logContractAddress("DAI Bond Teller", daiTeller.address);
  logContractAddress("ETH Bond Teller", ethTeller.address);
  logContractAddress("USDC Bond Teller", usdcTeller.address);
  logContractAddress("WBTC Bond Teller", wbtcTeller.address);
  logContractAddress("USDT Bond Teller", usdtTeller.address);
  logContractAddress("FRAX Bond Teller", fraxTeller.address);
  logContractAddress("DAI", DAI_ADDRESS);
  logContractAddress("WETH", WETH_ADDRESS);
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

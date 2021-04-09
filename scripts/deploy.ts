import { ethers } from "hardhat";

async function main() {
    /*
     * deploy SOLACE
     */
    const solaceFactory = await ethers.getContractFactory("SOLACE");
    // If a contract has constructor arguments, they are passed into deploy()
    let solace = await solaceFactory.deploy();
    // The address the contracts WILL have once mined
    console.log("SOLACE deployed to: ", solace.address);
    // The transaction that was sent to the network to deploy the contract
    console.log("SOLACE deployment TX hash: ", solace.deployTransaction.hash);
    // The contract is NOT deployed yet; we must wait until the TX is mined
    await solace.deployed();
    /*
     * deploy WETH
     */
    const mockWETHFactory = await ethers.getContractFactory("MockWETH");
    // If a contract has constructor arguments, they are passed into deploy()
    let mockWETH = await mockWETHFactory.deploy();
    // The address the contracts WILL have once mined
    console.log("WETH deployed to: ", mockWETH.address);
    // The transaction that was sent to the network to deploy the contract
    console.log("WETH deployment TX hash: ", mockWETH.deployTransaction.hash);
    // The contract is NOT deployed yet; we must wait until the TX is mined
    await mockWETH.deployed();
    /*
     * deploy Master
     */
    const masterFactory = await ethers.getContractFactory("Master");
    // If a contract has constructor arguments, they are passed into deploy()
    let Master = await masterFactory.deploy(solace.address, 200);
    // The address the contracts WILL have once mined
    console.log("Master deployed to: ", Master.address);
    // The transaction that was sent to the network to deploy the contract
    console.log("Master deployment TX hash: ", Master.deployTransaction.hash);
    // The contract is NOT deployed yet; we must wait until the TX is mined
    await Master.deployed();
    /*
     * deploy Vault
     */
    const vaultFactory = await ethers.getContractFactory("Vault");
    // If a contract has constructor arguments, they are passed into deploy()
    let Vault = await vaultFactory.deploy(mockWETH.address);
    // The address the contracts WILL have once mined
    console.log("Vault deployed to: ", Vault.address);
    // The transaction that was sent to the network to deploy the contract
    console.log("Vault deployment TX hash: ", Vault.deployTransaction.hash);
    // The contract is NOT deployed yet; we must wait until the TX is mined
    await Vault.deployed();
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });
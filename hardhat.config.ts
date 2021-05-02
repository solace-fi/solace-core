import { HardhatUserConfig } from "hardhat/types";
import { task } from "hardhat/config";
import "hardhat-contract-sizer";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import "hardhat-abi-exporter";
import { config as dotenv_config } from 'dotenv';
dotenv_config();

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: { },
    localhost: { url: "http://127.0.0.1:8545" },
    rinkeby: {
      url: process.env.RINKEBY_URL,
      chainId: 4,
      accounts: JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')
    }
  },
  solidity: {
    compilers: [{
      version: "0.8.0",
      settings: {
        optimizer: {
          enabled: true,
          runs: 800
        }
      }
    }],
  },
  abiExporter: {
    path: './client/src/constants/abi',
    clear: true,
    flat: false,
    only: [],
    spacing: 2
  },
  mocha: {
    timeout: 3600000 // one hour
  }
};

// If you are defining tasks, they need to access the Hardhat Runtime Environment (hre) explicitly, as a parameter.
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});


export default config;

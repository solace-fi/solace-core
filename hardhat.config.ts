import { HardhatUserConfig } from "hardhat/types";
import { task } from "hardhat/config";
import "hardhat-contract-sizer";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import "hardhat-abi-exporter";
import "solidity-coverage";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const USE_PROCESSED_FILES = process.env.USE_PROCESSED_FILES === "true";

const mainnet_fork = { url: process.env.MAINNET_URL || '', blockNumber: 13707321 };
const rinkeby_fork = { url: process.env.RINKEBY_URL || '', blockNumber: 9725873 };
const kovan_fork = { url: process.env.KOVAN_URL || '', blockNumber: 28583461 };
const no_fork = { url: '', blockNumber: 0 };
const forking = (
    process.env.FORK_NETWORK === "mainnet" ? mainnet_fork
  : process.env.FORK_NETWORK === "rinkeby" ? rinkeby_fork
  : process.env.FORK_NETWORK === "kovan"   ? kovan_fork
  : no_fork
);
const hardhat_network = process.env.FORK_NETWORK ? {forking} : {};

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: hardhat_network,
    localhost: { url: "http://127.0.0.1:8545" },
    mainnet: {
      url: process.env.MAINNET_URL || '',
      chainId: 1,
      accounts: JSON.parse(process.env.MAINNET_ACCOUNTS || '[]')
    },
    rinkeby: {
      url: process.env.RINKEBY_URL || '',
      chainId: 4,
      accounts: JSON.parse(process.env.RINKEBY_ACCOUNTS || '[]')
    },
    kovan: {
      url: process.env.KOVAN_URL || '',
      chainId: 42,
      accounts: JSON.parse(process.env.KOVAN_ACCOUNTS || '[]')
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.8.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
    ],
  },
  paths: {
    sources: USE_PROCESSED_FILES ? "./contracts_processed" : "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  abiExporter: {
    path: "./client/src/constants/abi",
    clear: true,
    flat: false,
    only: [],
    spacing: 2,
  },
  mocha: {
    timeout: 3600000, // one hour
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 100,
    coinmarketcap: process.env.CMC_API_KEY || "",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
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

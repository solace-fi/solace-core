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

const mainnet_fork = { url: process.env.MAINNET_URL || '', blockNumber: 13741230 };
const rinkeby_fork = { url: process.env.RINKEBY_URL || '', blockNumber: 9757125 };
const kovan_fork = { url: process.env.KOVAN_URL || '', blockNumber: 28627875 };
const no_fork = undefined;
const forking = (
    process.env.FORK_NETWORK === "mainnet" ? mainnet_fork
  : process.env.FORK_NETWORK === "rinkeby" ? rinkeby_fork
  : process.env.FORK_NETWORK === "kovan"   ? kovan_fork
  : no_fork
);

const accounts = {
  accountsBalance: "2000000000000000000000000" // Default to start with 2,000,000 ether in each Hardhat provided wallet. Needed increase from default of 10000 ether because unit tests in SoteriaCoverageProduct failing with maxCover being denominated in ETH and rest of contract in DAI
}

const hardhat_network = process.env.FORK_NETWORK ? {forking, accounts} : {};

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

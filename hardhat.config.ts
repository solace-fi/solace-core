import { HardhatUserConfig } from "hardhat/types";
import { task } from "hardhat/config";
import "hardhat-contract-sizer";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import "hardhat-abi-exporter";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [{
      version: "0.8.0",
      settings: {
        optimizer: {
          enabled: true,
          runs: 800
        }
      }
    },
    {
      version: '0.7.6',
      settings: {
        optimizer: {
          enabled: true,
          runs: 800,
        },
        metadata: {
          // do not include the metadata hash, since this is machine dependent
          // and we want all generated code to be deterministic
          // https://docs.soliditylang.org/en/v0.7.6/metadata.html
          bytecodeHash: 'none',
        },
      }
    }
  ]},
  abiExporter: {
    path: './client/src/constants/abi',
    clear: true,
    flat: false,
    only: [],
    spacing: 2
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

// chainlist
// 1: ethereum
// 4: rinkeby
// 5: goerli
// 42: kovan
// 1313161554: aurora
// 1313161554: aurora testnet
// 137: polygon
// 80001: polygon mumbai
// 250: fantom
// 4002: fantom testnet
// 31337: hardhat testnet

import { config as dotenv_config } from "dotenv";
dotenv_config();

// given a chainID, returns some settings to use for the network
export function getNetworkSettings(chainID: number) {
  // number of blocks to wait to ensure finality
  const CONFIRMATIONS: any = {
    [1]: 1,
    [4]: 1,
    [5]: 1,
    [42]: 1,
    [1313161554]: 5,
    [1313161555]: 5,
    [137]: 5,
    [80001]: 5,
    [250]: 5,
    [4002]: 5,
    [31337]: 0
  };
  let confirmations = CONFIRMATIONS.hasOwnProperty(chainID) ? CONFIRMATIONS[chainID] : 1;

  // gas settings
  const ONE_GWEI = 1000000000;
  const OVERRIDES: any = {
    [1]: {maxFeePerGas: 40 * ONE_GWEI, maxPriorityFeePerGas: 2 * ONE_GWEI},
    [4]: {},
    [5]: {},
    [42]: {},
    [1313161554]: {},
    [1313161555]: {},
    [137]: {maxFeePerGas: 31 * ONE_GWEI, maxPriorityFeePerGas: 31 * ONE_GWEI},
    [80001]: {maxFeePerGas: 31 * ONE_GWEI, maxPriorityFeePerGas: 31 * ONE_GWEI},
    [250]: {gasPrice: 90 * ONE_GWEI},
    [4002]: {},
    [31337]: {},
  };
  let overrides = OVERRIDES.hasOwnProperty(chainID) ? OVERRIDES[chainID] : {};

  const ETHERSCAN_SETTINGS: any = {
    [1]: {url: "", apikey: process.env.ETHERSCAN_API_KEY},
    [4]: {url: "", apikey: process.env.ETHERSCAN_API_KEY},
    [5]: {url: "", apikey: process.env.ETHERSCAN_API_KEY},
    [42]: {url: "", apikey: process.env.ETHERSCAN_API_KEY},
    [1313161554]: {url: "", apikey: process.env.AURORASCAN_API_KEY},
    [1313161555]: {url: "", apikey: process.env.AURORASCAN_API_KEY},
    [137]: {url: "", apikey: process.env.POLYGONSCAN_API_KEY},
    [80001]: {url: "", apikey: process.env.POLYGONSCAN_API_KEY},
    [250]: {url: "https://api.ftmscan.com/api", apikey: process.env.FTMSCAN_API_KEY},
    [4002]: {url: "https://api-testnet.ftmscan.com/api", apikey: process.env.FTMSCAN_API_KEY},
  }
  let etherscanSettings = ETHERSCAN_SETTINGS.hasOwnProperty(chainID) ? ETHERSCAN_SETTINGS[chainID] : undefined;

  // testnets
  const TESTNETS: any = [4, 5, 42, 1313161555, 80001, 4002, 31337];
  let isTestnet = TESTNETS.includes(chainID);

  let networkSettings = {confirmations, overrides, isTestnet, etherscanSettings};
  return networkSettings;
}

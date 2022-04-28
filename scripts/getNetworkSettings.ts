// given a chainID, returns some settings to use for the network
export function getNetworkSettings(chainID: number) {
  // number of blocks to wait to ensure finality
  const CONFIRMATIONS: any = {
    [1]: 1,
    [4]: 1,
    [5]: 1,
    [42]: 1,
    [137]: 5,
    [80001]: 5,
    [1313161554]: 5,
    [1313161555]: 5,
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
    [137]: {maxFeePerGas: 31 * ONE_GWEI, maxPriorityFeePerGas: 31 * ONE_GWEI},
    [80001]: {maxFeePerGas: 31 * ONE_GWEI, maxPriorityFeePerGas: 31 * ONE_GWEI},
    [1313161554]: {},
    [1313161555]: {},
    [31337]: {},
  };
  let overrides = OVERRIDES.hasOwnProperty(chainID) ? OVERRIDES[chainID] : {};

  // testnets
  const TESTNETS: any = [4, 5, 42, 80001, 1313161555, 31137];
  let isTestnet = TESTNETS.includes(chainID);

  let networkSettings = {confirmations, overrides, isTestnet};
  return networkSettings;
}

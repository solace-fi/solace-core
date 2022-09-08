import { ethers } from "hardhat";
import { BigNumber as BN, Contract, Signer } from "ethers";
import { encodePriceSqrt, FeeAmount } from "./../test/utilities/uniswap";
import UniswapV3PoolArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";

// helper functions

export function expandStr(str: String, len: number) {
  let s = str;
  if(s === undefined || s === null) s = ""
  while(s.length < len) s = `${s} `
  return s;
}

export function logContractAddress(contractName: String, address: String) {
  console.log(`| ${expandStr(contractName,28)} | \`${expandStr(address,42)}\` |`)
}

// uniswap requires tokens to be in order
export function sortTokens(tokenA: string, tokenB: string) {
  return BN.from(tokenA).lt(BN.from(tokenB)) ? [tokenA, tokenB] : [tokenB, tokenA];
}

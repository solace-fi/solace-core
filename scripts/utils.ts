import { ethers } from "hardhat";
import { BigNumber as BN, Contract, Signer } from "ethers";
import { encodePriceSqrt, FeeAmount } from "./../test/utilities/uniswap";
import UniswapV3PoolArtifact from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";

// helper functions

export function expandStr(str: String, len: number) {
  let s = str;
  while(s.length < len) s = `${s} `
  return s;
}

export function logContractAddress(contractName: String, address: String) {
  console.log(`${expandStr(contractName,16)} | ${address}`)
}

// uniswap requires tokens to be in order
export function sortTokens(tokenA: string, tokenB: string) {
  return BN.from(tokenA).lt(BN.from(tokenB)) ? [tokenA, tokenB] : [tokenB, tokenA];
}

// creates, initializes, and returns a pool
export async function createPool(creator: Signer, uniswapFactory: Contract, tokenA: string, tokenB: string, fee: FeeAmount) {
  let [token0, token1] = sortTokens(tokenA, tokenB);
  let pool: Contract;
  let tx = await uniswapFactory.connect(creator).createPool(token0, token1, fee);
  let events = (await tx.wait()).events;
  let poolAddress = events[0].args.pool;
  pool = await ethers.getContractAt(UniswapV3PoolArtifact.abi, poolAddress);
  let sqrtPrice = encodePriceSqrt(1,1);
  let tx2 = await pool.connect(creator).initialize(sqrtPrice);
  await tx2.wait();
  return pool;
}

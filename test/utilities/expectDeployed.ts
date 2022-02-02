import chai from "chai";
import { waffle, ethers } from "hardhat";
const { expect } = chai;
const provider = waffle.provider;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function expectDeployed(address: string) {
  expect(await isDeployed(address)).to.be.true;
}

export async function isDeployed(address: string) {
  if(address === undefined || address === null) return false;
  if(address.length !== 42) return false;
  if(address == ZERO_ADDRESS) return false;
  if((await provider.getCode(address)).length <= 2) return false;
  return true;
}

import chai from "chai";
import { waffle, ethers } from "hardhat";
const { expect } = chai;
const provider = waffle.provider;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function expectDeployed(address: string) {
  expect(address.length).eq(42);
  expect(address).not.eq(ZERO_ADDRESS);
  expect((await provider.getCode(address)).length).gt(2);
}

import { ethers } from "hardhat";
import { BigNumber as BN } from "ethers";

export function toBytes32(bn: BN) {
  return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
};

export async function setStorageAt(address: string, index: string, value: string) {
  index = ethers.utils.hexStripZeros(index);
  await ethers.provider.send("hardhat_setStorageAt", [address, index, value]);
  await ethers.provider.send("evm_mine", []); // Just mines to the next block
};

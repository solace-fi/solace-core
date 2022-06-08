import { ethers } from "hardhat";
import { BigNumber as BN, BigNumberish } from "ethers";

// returns a number in its full 32 byte hex representation
export function toBytes32(bn: BigNumberish) {
  return ethers.utils.hexlify(ethers.utils.zeroPad(BN.from(bn).toHexString(), 32));
};

// same as above without leading 0x
export function toAbiEncoded(bn: BigNumberish) {
  return toBytes32(bn).substring(2);
};

// same as above but a list
export function abiEncodeArgs(list: BigNumberish[]) {
  return list.map(toAbiEncoded).join('');
}

// manipulates storage in the hardhat test network
export async function setStorageAt(address: string, index: string, value: string) {
  index = ethers.utils.hexStripZeros(index);
  await ethers.provider.send("hardhat_setStorageAt", [address, index, value]);
  await ethers.provider.send("evm_mine", []); // Just mines to the next block
};

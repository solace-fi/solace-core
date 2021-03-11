import { waffle } from "hardhat";
import { MockProvider } from "ethereum-waffle";
const DEFAULT_PROVIDER: MockProvider = waffle.provider;
import { BigNumber as BN, BigNumberish, constants } from "ethers";

// burns an amount of blocks
export async function burnBlocks(
  blocks: BigNumberish,
  provider: MockProvider = DEFAULT_PROVIDER
) {
  let _blocks: BN = BN.from(blocks);
  for(var burnedBlocks:BN = constants.Zero; burnedBlocks.lt(_blocks); burnedBlocks = burnedBlocks.add(constants.One)) {
    await provider.send("evm_mine", []);
  }
}

// burns blocks until reached desired end block
export async function burnBlocksUntil(
  endBlock: BigNumberish,
  validate: boolean = true,
  provider: MockProvider = DEFAULT_PROVIDER
) {
  let _endBlock: BN = BN.from(endBlock);
  var curBlock: BN = BN.from(await provider.getBlockNumber());
  if(validate && curBlock.gt(_endBlock)) throw "past block"; // optional sanity check
  var burnedBlocks: BN = constants.Zero;
  for(; curBlock.lt(_endBlock); curBlock = curBlock.add(constants.One)) {
    await provider.send("evm_mine", []);
    burnedBlocks = burnedBlocks.add(constants.One);
  }
  return burnedBlocks;
}

import { BigNumber as BN, BigNumberish } from "ethers";
import chai from "chai";
const { expect } = chai;

// expect a number to be close to another, within a threshold of tolerance
export function expectClose(value1: BigNumberish, value2: BigNumberish, delta: BigNumberish = 10) {
  let num1 = BN.from(value1);
  let num2 = BN.from(value2);
  let del = BN.from(delta);
  let min = num2.sub(del);
  let max = num2.add(del);
  expect(num1).to.be.gte(min);
  expect(num1).to.be.lte(max);
}

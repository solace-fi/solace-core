import { BigNumber as BN, BigNumberish } from "ethers";

// multiplies and divides a set of big numbers
export function bnMulDiv(
  muls: BigNumberish[] = [],
  divs: BigNumberish[] = []
) {
  let num = BN.from("1");
  for(var i = 0; i < muls.length; ++i) {
    num = num.mul(BN.from(muls[i]));
  }
  let den = BN.from("1");
  for(var i = 0; i < divs.length; ++i) {
    den = den.mul(BN.from(divs[i]));
  }
  return num.div(den);
}

// adds and subtracts a set of big numbers
export function bnAddSub(
  adds: BigNumberish[] = [],
  subs: BigNumberish[] = []
) {
  let res = BN.from("0");
  for(var i = 0; i < adds.length; ++i) {
    res = res.add(BN.from(adds[i]));
  }
  for(var i = 0; i < subs.length; ++i) {
    res = res.sub(BN.from(subs[i]));
  }
  return res;
}

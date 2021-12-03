// utils for signing ERC20.permit()

import { BigNumber as BN, BigNumberish, constants, Signature, Wallet, Contract } from "ethers";
import { splitSignature } from "ethers/lib/utils";

export async function getERC20PermitSignature(
  owner: Wallet | Contract,
  spender: Wallet | Contract | string,
  token: Contract,
  amount: BigNumberish,
  deadline: BigNumberish = constants.MaxUint256,
  nonce: BigNumberish = constants.MaxUint256 // optional override. leave empty to use correct nonce
): Promise<Signature> {
  var spender2 = (typeof spender === "string") ? spender : spender.address;
  // get nonce if not given
  let nonceBN = BN.from(nonce);
  if(nonceBN.eq(constants.MaxUint256)) {
    nonceBN = await token.nonces(owner.address);
  }
  // get other vars
  const [name, version, chainId] = await Promise.all([
    token.name(),
    "1",
    owner.getChainId(),
  ]);
  // split v, r, s
  return splitSignature(
    // sign message
    await owner._signTypedData(
      {
        name,
        version,
        chainId,
        verifyingContract: token.address,
      },
      {
        Permit: [
          { name: "owner",    type: "address", },
          { name: "spender",  type: "address", },
          { name: "value",    type: "uint256", },
          { name: "nonce",    type: "uint256", },
          { name: "deadline", type: "uint256", },
        ],
      },
      {
        owner: owner.address,
        spender: spender2,
        value: amount,
        nonce: nonceBN,
        deadline: deadline,
      }
    )
  );
}

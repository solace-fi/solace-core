// a collection of utils for signing ERC721.permit()

import { BigNumber as BN, BigNumberish, constants, Signature, Wallet, Contract, utils } from "ethers";
import { splitSignature } from "ethers/lib/utils";

export async function getXSolaceStakeSignature(
  solace: Contract,
  xsolace: Contract,
  depositor: Wallet,
  amount: BigNumberish,
  deadline: BigNumberish = constants.MaxUint256,
  nonce: BigNumberish = constants.MaxUint256 // optional override. leave empty to use correct nonce
): Promise<Signature> {
  // get nonce if not given
  let nonceBN = BN.from(nonce);
  if(nonceBN.eq(constants.MaxUint256)) {
    nonceBN = await solace.nonces(depositor.address);
  }
  // get other vars
  const [name, version, chainId] = await Promise.all([
    solace.name(),
    "1",
    depositor.getChainId(),
  ]);
  // split v, r, s
  return splitSignature(
    // sign message
    await depositor._signTypedData(
      {
        name,
        version,
        chainId,
        verifyingContract: solace.address,
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
        owner: depositor.address,
        spender: xsolace.address,
        value: amount,
        nonce: nonceBN,
        deadline: deadline,
      }
    )
  );
}

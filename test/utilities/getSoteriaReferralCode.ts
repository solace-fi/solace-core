import { Signature, Wallet, Contract, utils } from "ethers";

export async function getSoteriaReferralCode(
  referrer: Wallet | Contract,
  soteriaCoverageProtocol: Contract
): Promise<string> {

  const domain = {
    name: "Solace.fi-SoteriaCoverageProduct",
    version: "1",
    chainId: await referrer.getChainId(),
    verifyingContract: soteriaCoverageProtocol.address
  };

  // Unsure why, but using a struct with a single "string" could not return a valid EIP712 signature
  const types = {
    SoteriaReferral: [
        { name: "version", type: "uint256" }
      ]
  };

  const value = {
    version: 1
  };

  let signature = await referrer._signTypedData(domain, types, value);
  return signature.toString();
}

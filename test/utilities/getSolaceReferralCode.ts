import { Signature, Wallet, Contract, utils } from "ethers";

export async function getSolaceReferralCode(
  referrer: Wallet | Contract,
  solaceCoverProduct: Contract,
): Promise<string> {

  const domain = {
    name: "Solace.fi-SolaceCoverProduct",
    version: "1",
    chainId: await referrer.getChainId(),
    verifyingContract: solaceCoverProduct.address
  };

  // Unsure why, but using a struct with a single "string" could not return a valid EIP712 signature
  const types = {
    SolaceReferral: [
        { name: "version", type: "uint256" }
      ]
  };

  const value = {
    version: 1
  };

  let signature = await referrer._signTypedData(domain, types, value);
  return signature.toString();
}

export async function getSolaceReferralCodeV2(
  referrer: Wallet | Contract,
  solaceCoverProduct: Contract,
): Promise<string> {

  const domain = {
    name: "Solace.fi-SolaceCoverProductV2",
    version: "2",
    chainId: await referrer.getChainId(),
    verifyingContract: solaceCoverProduct.address
  };

  // Unsure why, but using a struct with a single "string" could not return a valid EIP712 signature
  const types = {
    SolaceReferral: [
        { name: "version", type: "uint256" }
      ]
  };

  const value = {
    version: 2
  };

  let signature = await referrer._signTypedData(domain, types, value);
  return signature.toString();
}
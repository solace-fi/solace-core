import { Signature, Wallet, Contract, utils } from "ethers";
import { ethers } from "hardhat";
import { experimentalAddHardhatNetworkMessageTraceHook } from "hardhat/config";

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

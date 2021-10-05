// a collection of utils for signing ERC721.permit()

import { BigNumber as BN, BigNumberish, constants, Signature, Wallet, Contract, utils } from "ethers";
import { splitSignature } from "ethers/lib/utils";

// should be used on Uniswap V3 NFTs
export async function getPermitNFTSignature(
  wallet: Wallet,
  positionManager: Contract,//NonfungiblePositionManager,
  spender: string,
  tokenId: BigNumberish,
  deadline: BigNumberish = constants.MaxUint256
): Promise<Signature> {
  const [nonce, name, version, chainId] = await Promise.all([
    positionManager.positions(tokenId).then((p:any) => p.nonce),
    positionManager.name(),
    "1",
    wallet.getChainId(),
  ]);
  return splitSignature(
    await wallet._signTypedData(
      {
        name,
        version,
        chainId,
        verifyingContract: positionManager.address,
      },
      {
        Permit: [
          { name: "spender",  type: "address", },
          { name: "tokenId",  type: "uint256", },
          { name: "nonce",    type: "uint256", },
          { name: "deadline", type: "uint256", },
        ],
      },
      {
        owner: wallet.address,
        spender,
        tokenId,
        nonce,
        deadline,
      }
    )
  );
}

// should be used on Solace NFTs
export async function getPermitErc721EnhancedSignature(
  owner: Wallet,
  contract: Contract, // ClaimsEscrow, OptionsFarming, or PolicyManager
  spender: string,
  tokenID: BigNumberish,
  deadline: BigNumberish = constants.MaxUint256,
  nonce: BigNumberish = constants.MaxUint256 // optional override. leave empty to use correct nonce
): Promise<Signature> {
  // get nonce if not given
  let nonceBN = BN.from(nonce);
  if(nonceBN.eq(constants.MaxUint256)) {
    nonceBN = await contract.nonces(tokenID);
  }
  // get other vars
  const [name, version, chainId] = await Promise.all([
    contract.name(),
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
        verifyingContract: contract.address,
      },
      {
        Permit: [
          { name: "spender",  type: "address", },
          { name: "tokenID",  type: "uint256", },
          { name: "nonce",    type: "uint256", },
          { name: "deadline", type: "uint256", },
        ],
      },
      {
        owner: owner.address,
        spender,
        tokenID,
        nonce: nonceBN,
        deadline,
      }
    )
  );
}

// Gets the EIP712 domain separator
export function getDomainSeparator(name: string, contractAddress: string, chainId: number) {
    return utils.keccak256(
        utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32", "bytes32", "uint256", "address"],
        [
            utils.keccak256(utils.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
            utils.keccak256(utils.toUtf8Bytes(name)),
            utils.keccak256(utils.toUtf8Bytes("1")),
            chainId,
            contractAddress,
        ]
        )
    )
}

// Returns the EIP712 hash which should be signed by the authorized signer
// in order to make a call to Product.submitClaim()
export function getPermitErc721EnhancedDigest(
    domainName: string,
    contractAddress: string,
    chainID: number,
    tokenID: BigNumberish,
    spender: string,
    nonce: BigNumberish,
    deadline: BigNumberish,
    typehash: string
    ) {
    const DOMAIN_SEPARATOR = getDomainSeparator(domainName, contractAddress, chainID)
    return utils.keccak256(
        utils.solidityPack(
        ["bytes1", "bytes1", "bytes32", "bytes32"],
        [
            "0x19",
            "0x01",
            DOMAIN_SEPARATOR,
            utils.keccak256(
            utils.defaultAbiCoder.encode(
                ["bytes32", "address", "uint256", "uint256", "uint256"],
                [typehash, spender, tokenID, nonce, deadline]
            )
            ),
        ]
        )
    )
}

function buf2hex(buffer: Buffer) { // buffer is an ArrayBuffer
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0")).join("");
}

export function assembleRSV(r: string, s: string, v: number) {
  let v_ = Number(v).toString(16);
  let r_ = r.slice(2);
  let s_ = s.slice(2);
  return `0x${r_}${s_}${v_}`;
}

import { utils, BigNumberish } from "ethers";
import { ECDSASignature, ecsign } from "ethereumjs-util";

// works for ERC20s, not ERC721s for some reason
export const PERMIT_TYPEHASH = utils.keccak256(
    utils.toUtf8Bytes("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")
);

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

export const sign = (digest: any, privateKey: any) => {
    return ecsign(Buffer.from(digest.slice(2), "hex"), privateKey)
}

// Returns the EIP712 hash which should be signed by the user
// in order to make a call to `permit`
export function getPermitDigest(
    name: string,
    address: string,
    chainId: number,
    approve: {
        owner: string
        spender: string
        value: BigNumberish
    },
    nonce: BigNumberish,
    deadline: BigNumberish
    ) {
    const DOMAIN_SEPARATOR = getDomainSeparator(name, address, chainId)
    return utils.keccak256(
        utils.solidityPack(
        ["bytes1", "bytes1", "bytes32", "bytes32"],
        [
            "0x19",
            "0x01",
            DOMAIN_SEPARATOR,
            utils.keccak256(
            utils.defaultAbiCoder.encode(
                ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
                [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
            )
            ),
        ]
        )
    )
}

// Returns the EIP712 hash which should be signed by the authorized signer
// in order to make a call to Product.submitClaim()
export function getSubmitClaimDigest(
    name: string,
    address: string,
    chainId: number,
    policyID: BigNumberish,
    amountOut: BigNumberish,
    deadline: BigNumberish,
    typehash: string
    ) {
    const DOMAIN_SEPARATOR = getDomainSeparator(name, address, chainId)
    return utils.keccak256(
        utils.solidityPack(
        ["bytes1", "bytes1", "bytes32", "bytes32"],
        [
            "0x19",
            "0x01",
            DOMAIN_SEPARATOR,
            utils.keccak256(
            utils.defaultAbiCoder.encode(
                ["bytes32", "uint256", "uint256","uint256"],
                [typehash, policyID, amountOut, deadline]
            )
            ),
        ]
        )
    )
}

function buf2hex(buffer: Buffer) { // buffer is an ArrayBuffer
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0")).join("");
}

export function assembleSignature(parts: ECDSASignature) {
  let { v, r, s } = parts;
  let v_ = Number(v).toString(16);
  let r_ = buf2hex(r);
  let s_ = buf2hex(s);
  return `0x${r_}${s_}${v_}`;
}

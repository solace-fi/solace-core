import { BigNumber, BigNumberish, constants, Signature, Wallet, Contract } from 'ethers'
import { splitSignature } from 'ethers/lib/utils'
//import { NonfungiblePositionManager } from '../../typechain'

export default async function getPermitNFTSignature(
  wallet: Wallet,
  positionManager: Contract,//NonfungiblePositionManager,
  spender: string,
  tokenId: BigNumberish,
  deadline: BigNumberish = constants.MaxUint256//,
  //permitConfig?: { nonce?: BigNumberish; name?: string; chainId?: number; version?: string }
): Promise<Signature> {
  const [nonce, name, version, chainId] = await Promise.all([
    /*
    permitConfig?.nonce ?? positionManager.positions(tokenId).then((p:any) => p.nonce),
    permitConfig?.name ?? positionManager.name(),
    permitConfig?.version ?? '1',
    permitConfig?.chainId ?? wallet.getChainId(),
    */
    positionManager.positions(tokenId).then((p:any) => p.nonce),
    positionManager.name(),
    '1',
    wallet.getChainId(),
  ])

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
          {
            name: 'spender',
            type: 'address',
          },
          {
            name: 'tokenId',
            type: 'uint256',
          },
          {
            name: 'nonce',
            type: 'uint256',
          },
          {
            name: 'deadline',
            type: 'uint256',
          },
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
  )
}

/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Signer, BigNumberish } from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import { Contract, ContractFactory, Overrides } from "@ethersproject/contracts";

import type { Master } from "./Master";

export class MasterFactory extends ContractFactory {
  constructor(signer?: Signer) {
    super(_abi, _bytecode, signer);
  }

  deploy(
    _governance: string,
    _solace: string,
    _solacePerBlock: BigNumberish,
    overrides?: Overrides
  ): Promise<Master> {
    return super.deploy(
      _governance,
      _solace,
      _solacePerBlock,
      overrides || {}
    ) as Promise<Master>;
  }
  getDeployTransaction(
    _governance: string,
    _solace: string,
    _solacePerBlock: BigNumberish,
    overrides?: Overrides
  ): TransactionRequest {
    return super.getDeployTransaction(
      _governance,
      _solace,
      _solacePerBlock,
      overrides || {}
    );
  }
  attach(address: string): Master {
    return super.attach(address) as Master;
  }
  connect(signer: Signer): MasterFactory {
    return super.connect(signer) as MasterFactory;
  }
  static connect(address: string, signerOrProvider: Signer | Provider): Master {
    return new Contract(address, _abi, signerOrProvider) as Master;
  }
}

const _abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_governance",
        type: "address",
      },
      {
        internalType: "contract SOLACE",
        name: "_solace",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_solacePerBlock",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "_farmId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "_farmAddress",
        type: "address",
      },
    ],
    name: "FarmCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "_newGovernance",
        type: "address",
      },
    ],
    name: "GovernanceTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "_solacePerBlock",
        type: "uint256",
      },
    ],
    name: "RewardsSet",
    type: "event",
  },
  {
    inputs: [],
    name: "acceptGovernance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "allocPoints",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "farmAddresses",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "farmIndices",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "governance",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "massUpdateFarms",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "newGovernance",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "numFarms",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_farmAddress",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_allocPoints",
        type: "uint256",
      },
    ],
    name: "registerFarm",
    outputs: [
      {
        internalType: "uint256",
        name: "farmId",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_farmId",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_allocPoints",
        type: "uint256",
      },
    ],
    name: "setAllocPoints",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_governance",
        type: "address",
      },
    ],
    name: "setGovernance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_solacePerBlock",
        type: "uint256",
      },
    ],
    name: "setSolacePerBlock",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "solace",
    outputs: [
      {
        internalType: "contract SOLACE",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "solacePerBlock",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalAllocPoints",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "withdrawRewards",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const _bytecode =
  "0x608060405234801561001057600080fd5b50604051610bbc380380610bbc83398101604081905261002f91610067565b600080546001600160a01b039485166001600160a01b03199182161790915560028054939094169216919091179091556003556100c1565b60008060006060848603121561007b578283fd5b8351610086816100a9565b6020850151909350610097816100a9565b80925050604084015190509250925092565b6001600160a01b03811681146100be57600080fd5b50565b610aec806100d06000396000f3fe608060405234801561001057600080fd5b50600436106101005760003560e01c80638069aa65116100975780638f908ac7116100665780638f908ac7146101b6578063ab033ea9146101c9578063c7b8981c146101dc578063f26e5cfe146101e457610100565b80638069aa651461018057806386f44c7b146101935780638b85cc7e1461019b5780638d75ef67146101a357610100565b80633ef8d97e116100d35780633ef8d97e146101535780635aa6e6751461016857806372f9ab43146101705780637e0de2ef1461017857610100565b8063032b49f9146101055780631fa36cbe1461012e578063238efcbc14610136578063298a268714610140575b600080fd5b6101186101133660046108eb565b6101f7565b6040516101259190610a0e565b60405180910390f35b610118610209565b61013e61020f565b005b61011861014e3660046108a2565b6102ae565b61015b610431565b604051610125919061093c565b61015b610440565b61011861044f565b61013e610455565b61011861018e366004610881565b6104db565b6101186104ed565b61015b6104f3565b61015b6101b13660046108eb565b610502565b61013e6101c43660046108eb565b61051d565b61013e6101d7366004610881565b61058e565b61013e6105e7565b61013e6101f236600461091b565b6106f9565b60086020526000908152604090205481565b60045481565b6001546001600160a01b031633146102425760405162461bcd60e51b815260040161023990610969565b60405180910390fd5b600180546000805473ffffffffffffffffffffffffffffffffffffffff199081166001600160a01b038416179091551690556040517ff2c4a3b084b019a98d9c1a566a17ac81667550bfc69a028299f70b4e9e4bba56906102a490339061093c565b60405180910390a1565b600080546001600160a01b031633146102d95760405162461bcd60e51b815260040161023990610969565b6001600160a01b0383166000908152600760205260409020541561030f5760405162461bcd60e51b8152600401610239906109a0565b60056000815461031e90610a85565b91829055506000818152600660209081526040808320805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b038981169182179092558452600790925291829020839055600254915163095ea7b360e01b8152929350169063095ea7b39061039890869060001990600401610950565b602060405180830381600087803b1580156103b257600080fd5b505af11580156103c6573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906103ea91906108cb565b506103f58183610756565b6040516001600160a01b0384169082907f74c6c5fd9a70ed43945f118ec4990df995359837f5484faeb4e3d6d5d72ae99c90600090a392915050565b6002546001600160a01b031681565b6000546001600160a01b031681565b60035481565b60055460015b8181116104d757600081815260066020526040808220548151633d53298f60e21b815291516001600160a01b039091169263f54ca63c926004808201939182900301818387803b1580156104ae57600080fd5b505af11580156104c2573d6000803e3d6000fd5b50505050806104d090610a85565b905061045b565b5050565b60076020526000908152604090205481565b60055481565b6001546001600160a01b031681565b6006602052600090815260409020546001600160a01b031681565b6000546001600160a01b031633146105475760405162461bcd60e51b815260040161023990610969565b6003819055610554610795565b7f3a9c73865b863f6b3112a48ba71b6cc75b1b5440abddbcba0135c64a4056508b816040516105839190610a0e565b60405180910390a150565b6000546001600160a01b031633146105b85760405162461bcd60e51b815260040161023990610969565b6001805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0392909216919091179055565b60055460015b8181116104d7576000818152600660205260408082205490516318ebd13160e11b81526001600160a01b03909116919082906331d7a2629061063390339060040161093c565b60206040518083038186803b15801561064b57600080fd5b505afa15801561065f573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906106839190610903565b11156106e85760405163a20ae56760e01b81526001600160a01b0382169063a20ae567906106b590339060040161093c565b600060405180830381600087803b1580156106cf57600080fd5b505af11580156106e3573d6000803e3d6000fd5b505050505b506106f281610a85565b90506105ed565b6000546001600160a01b031633146107235760405162461bcd60e51b815260040161023990610969565b811580159061073457506005548211155b6107505760405162461bcd60e51b8152600401610239906109d7565b6104d782825b600082815260086020526040902054600454829161077391610a6e565b61077d9190610a17565b60045560008281526008602052604090208190556104d75b60055460035460045460015b83811161085f57600082156107da5760008281526008602052604090205483906107cb9086610a4f565b6107d59190610a2f565b6107dd565b60005b6000838152600660205260409081902054905163c7a29c6f60e01b81529192506001600160a01b03169063c7a29c6f9061081b908490600401610a0e565b600060405180830381600087803b15801561083557600080fd5b505af1158015610849573d6000803e3d6000fd5b50505050508061085890610a85565b90506107a1565b50505050565b80356001600160a01b038116811461087c57600080fd5b919050565b600060208284031215610892578081fd5b61089b82610865565b9392505050565b600080604083850312156108b4578081fd5b6108bd83610865565b946020939093013593505050565b6000602082840312156108dc578081fd5b8151801515811461089b578182fd5b6000602082840312156108fc578081fd5b5035919050565b600060208284031215610914578081fd5b5051919050565b6000806040838503121561092d578182fd5b50508035926020909101359150565b6001600160a01b0391909116815260200190565b6001600160a01b03929092168252602082015260400190565b6020808252600b908201527f21676f7665726e616e6365000000000000000000000000000000000000000000604082015260600190565b60208082526012908201527f616c726561647920726567697374657265640000000000000000000000000000604082015260600190565b60208082526013908201527f6661726d20646f6573206e6f7420657869737400000000000000000000000000604082015260600190565b90815260200190565b60008219821115610a2a57610a2a610aa0565b500190565b600082610a4a57634e487b7160e01b81526012600452602481fd5b500490565b6000816000190483118215151615610a6957610a69610aa0565b500290565b600082821015610a8057610a80610aa0565b500390565b6000600019821415610a9957610a99610aa0565b5060010190565b634e487b7160e01b600052601160045260246000fdfea26469706673582212202dc53582fcb1e00d0b8cd4c24b5f00ccabcdd58a05d910cb1374a04ac3b77b9c64736f6c63430008000033";

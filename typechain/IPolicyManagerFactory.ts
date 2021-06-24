/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Signer } from "ethers";
import { Provider } from "@ethersproject/providers";

import type { IPolicyManager } from "./IPolicyManager";

export class IPolicyManagerFactory {
  static connect(
    address: string,
    signerOrProvider: Signer | Provider
  ): IPolicyManager {
    return new Contract(address, _abi, signerOrProvider) as IPolicyManager;
  }
}

const _abi = [
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
        name: "tokenID",
        type: "uint256",
      },
    ],
    name: "PolicyBurned",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "tokenID",
        type: "uint256",
      },
    ],
    name: "PolicyCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "product",
        type: "address",
      },
    ],
    name: "ProductAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "product",
        type: "address",
      },
    ],
    name: "ProductRemoved",
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
        internalType: "address",
        name: "_product",
        type: "address",
      },
    ],
    name: "addProduct",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_tokenId",
        type: "uint256",
      },
    ],
    name: "burn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_policyholder",
        type: "address",
      },
      {
        internalType: "address",
        name: "_positionContract",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_coverAmount",
        type: "uint256",
      },
      {
        internalType: "uint64",
        name: "_expirationBlock",
        type: "uint64",
      },
      {
        internalType: "uint24",
        name: "_price",
        type: "uint24",
      },
    ],
    name: "createPolicy",
    outputs: [
      {
        internalType: "uint256",
        name: "tokenID",
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
        name: "_policyID",
        type: "uint256",
      },
    ],
    name: "getPolicyCoverAmount",
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
        name: "_policyID",
        type: "uint256",
      },
    ],
    name: "getPolicyExpirationBlock",
    outputs: [
      {
        internalType: "uint64",
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_policyID",
        type: "uint256",
      },
    ],
    name: "getPolicyInfo",
    outputs: [
      {
        internalType: "address",
        name: "policyholder",
        type: "address",
      },
      {
        internalType: "address",
        name: "product",
        type: "address",
      },
      {
        internalType: "address",
        name: "positionContract",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "coverAmount",
        type: "uint256",
      },
      {
        internalType: "uint64",
        name: "expirationBlock",
        type: "uint64",
      },
      {
        internalType: "uint24",
        name: "price",
        type: "uint24",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_policyID",
        type: "uint256",
      },
    ],
    name: "getPolicyPositionContract",
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
        internalType: "uint256",
        name: "_policyID",
        type: "uint256",
      },
    ],
    name: "getPolicyPrice",
    outputs: [
      {
        internalType: "uint24",
        name: "",
        type: "uint24",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_policyID",
        type: "uint256",
      },
    ],
    name: "getPolicyProduct",
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
        internalType: "uint256",
        name: "_policyID",
        type: "uint256",
      },
    ],
    name: "getPolicyholder",
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
        internalType: "uint256",
        name: "_productNum",
        type: "uint256",
      },
    ],
    name: "getProduct",
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
    inputs: [
      {
        internalType: "address",
        name: "_product",
        type: "address",
      },
      {
        internalType: "address",
        name: "_policyholder",
        type: "address",
      },
      {
        internalType: "address",
        name: "_positionContract",
        type: "address",
      },
    ],
    name: "hasActivePolicy",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_policyholder",
        type: "address",
      },
    ],
    name: "listPolicies",
    outputs: [
      {
        internalType: "uint256[]",
        name: "",
        type: "uint256[]",
      },
    ],
    stateMutability: "view",
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
    name: "numProducts",
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
        name: "_product",
        type: "address",
      },
    ],
    name: "productIsActive",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_product",
        type: "address",
      },
    ],
    name: "removeProduct",
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
        name: "_policyId",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "_policyholder",
        type: "address",
      },
      {
        internalType: "address",
        name: "_positionContract",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_coverAmount",
        type: "uint256",
      },
      {
        internalType: "uint64",
        name: "_expirationBlock",
        type: "uint64",
      },
      {
        internalType: "uint24",
        name: "_price",
        type: "uint24",
      },
    ],
    name: "setPolicyInfo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

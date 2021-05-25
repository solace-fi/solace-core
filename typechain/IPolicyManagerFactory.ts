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
        name: "_expirationBlock",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_coverAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_price",
        type: "uint256",
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
    name: "getPolicyParams",
    outputs: [
      {
        components: [
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
            name: "expirationBlock",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "coverAmount",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "price",
            type: "uint256",
          },
        ],
        internalType: "struct IPolicyManager.PolicyTokenURIParams",
        name: "",
        type: "tuple",
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
    inputs: [],
    name: "myPolicies",
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
        name: "_tokenId",
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
        name: "_expirationBlock",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_coverAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_price",
        type: "uint256",
      },
    ],
    name: "setTokenURI",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes4",
        name: "interfaceId",
        type: "bytes4",
      },
    ],
    name: "supportsInterface",
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
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "tokenURI",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];
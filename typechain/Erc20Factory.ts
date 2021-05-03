/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Signer } from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import { Contract, ContractFactory, Overrides } from "@ethersproject/contracts";

import type { Erc20 } from "./Erc20";

export class Erc20Factory extends ContractFactory {
  constructor(signer?: Signer) {
    super(_abi, _bytecode, signer);
  }

  deploy(
    name_: string,
    symbol_: string,
    overrides?: Overrides
  ): Promise<Erc20> {
    return super.deploy(name_, symbol_, overrides || {}) as Promise<Erc20>;
  }
  getDeployTransaction(
    name_: string,
    symbol_: string,
    overrides?: Overrides
  ): TransactionRequest {
    return super.getDeployTransaction(name_, symbol_, overrides || {});
  }
  attach(address: string): Erc20 {
    return super.attach(address) as Erc20;
  }
  connect(signer: Signer): Erc20Factory {
    return super.connect(signer) as Erc20Factory;
  }
  static connect(address: string, signerOrProvider: Signer | Provider): Erc20 {
    return new Contract(address, _abi, signerOrProvider) as Erc20;
  }
}

const _abi = [
  {
    inputs: [
      {
        internalType: "string",
        name: "name_",
        type: "string",
      },
      {
        internalType: "string",
        name: "symbol_",
        type: "string",
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
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
    ],
    name: "allowance",
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
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "balanceOf",
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
    name: "decimals",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "subtractedValue",
        type: "uint256",
      },
    ],
    name: "decreaseAllowance",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "addedValue",
        type: "uint256",
      },
    ],
    name: "increaseAllowance",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
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
  {
    inputs: [],
    name: "symbol",
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
  {
    inputs: [],
    name: "totalSupply",
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
        name: "recipient",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const _bytecode =
  "0x60806040523480156200001157600080fd5b50604051620016e7380380620016e7833981810160405281019062000037919062000193565b81600390805190602001906200004f92919062000071565b5080600490805190602001906200006892919062000071565b50505062000337565b8280546200007f90620002a3565b90600052602060002090601f016020900481019282620000a35760008555620000ef565b82601f10620000be57805160ff1916838001178555620000ef565b82800160010185558215620000ef579182015b82811115620000ee578251825591602001919060010190620000d1565b5b509050620000fe919062000102565b5090565b5b808211156200011d57600081600090555060010162000103565b5090565b60006200013862000132846200023a565b62000206565b9050828152602081018484840111156200015157600080fd5b6200015e8482856200026d565b509392505050565b600082601f8301126200017857600080fd5b81516200018a84826020860162000121565b91505092915050565b60008060408385031215620001a757600080fd5b600083015167ffffffffffffffff811115620001c257600080fd5b620001d08582860162000166565b925050602083015167ffffffffffffffff811115620001ee57600080fd5b620001fc8582860162000166565b9150509250929050565b6000604051905081810181811067ffffffffffffffff8211171562000230576200022f62000308565b5b8060405250919050565b600067ffffffffffffffff82111562000258576200025762000308565b5b601f19601f8301169050602081019050919050565b60005b838110156200028d57808201518184015260208101905062000270565b838111156200029d576000848401525b50505050565b60006002820490506001821680620002bc57607f821691505b60208210811415620002d357620002d2620002d9565b5b50919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6113a080620003476000396000f3fe608060405234801561001057600080fd5b50600436106100c95760003560e01c80633950935111610081578063a457c2d71161005b578063a457c2d714610206578063a9059cbb14610236578063dd62ed3e14610266576100c9565b8063395093511461018857806370a08231146101b857806395d89b41146101e8576100c9565b806318160ddd116100b257806318160ddd1461011c57806323b872dd1461013a578063313ce5671461016a576100c9565b806306fdde03146100ce578063095ea7b3146100ec575b600080fd5b6100d6610296565b6040516100e39190611035565b60405180910390f35b61010660048036038101906101019190610cae565b610328565b604051610113919061101a565b60405180910390f35b610124610346565b6040516101319190611137565b60405180910390f35b610154600480360381019061014f9190610c5f565b610350565b604051610161919061101a565b60405180910390f35b610172610451565b60405161017f9190611152565b60405180910390f35b6101a2600480360381019061019d9190610cae565b61045a565b6040516101af919061101a565b60405180910390f35b6101d260048036038101906101cd9190610bfa565b610506565b6040516101df9190611137565b60405180910390f35b6101f061054e565b6040516101fd9190611035565b60405180910390f35b610220600480360381019061021b9190610cae565b6105e0565b60405161022d919061101a565b60405180910390f35b610250600480360381019061024b9190610cae565b6106d4565b60405161025d919061101a565b60405180910390f35b610280600480360381019061027b9190610c23565b6106f2565b60405161028d9190611137565b60405180910390f35b6060600380546102a59061129b565b80601f01602080910402602001604051908101604052809291908181526020018280546102d19061129b565b801561031e5780601f106102f35761010080835404028352916020019161031e565b820191906000526020600020905b81548152906001019060200180831161030157829003601f168201915b5050505050905090565b600061033c610335610779565b8484610781565b6001905092915050565b6000600254905090565b600061035d84848461094c565b6000600160008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006103a8610779565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905082811015610428576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161041f906110b7565b60405180910390fd5b61044585610434610779565b858461044091906111df565b610781565b60019150509392505050565b60006012905090565b60006104fc610467610779565b848460016000610475610779565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008873ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020546104f79190611189565b610781565b6001905092915050565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050919050565b60606004805461055d9061129b565b80601f01602080910402602001604051908101604052809291908181526020018280546105899061129b565b80156105d65780601f106105ab576101008083540402835291602001916105d6565b820191906000526020600020905b8154815290600101906020018083116105b957829003601f168201915b5050505050905090565b600080600160006105ef610779565b73ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050828110156106ac576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016106a390611117565b60405180910390fd5b6106c96106b7610779565b8585846106c491906111df565b610781565b600191505092915050565b60006106e86106e1610779565b848461094c565b6001905092915050565b6000600160008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905092915050565b600033905090565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1614156107f1576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016107e8906110f7565b60405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610861576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161085890611077565b60405180910390fd5b80600160008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9258360405161093f9190611137565b60405180910390a3505050565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1614156109bc576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016109b3906110d7565b60405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff161415610a2c576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a2390611057565b60405180910390fd5b610a37838383610bcb565b60008060008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905081811015610abd576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610ab490611097565b60405180910390fd5b8181610ac991906111df565b6000808673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002081905550816000808573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828254610b599190611189565b925050819055508273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef84604051610bbd9190611137565b60405180910390a350505050565b505050565b600081359050610bdf8161133c565b92915050565b600081359050610bf481611353565b92915050565b600060208284031215610c0c57600080fd5b6000610c1a84828501610bd0565b91505092915050565b60008060408385031215610c3657600080fd5b6000610c4485828601610bd0565b9250506020610c5585828601610bd0565b9150509250929050565b600080600060608486031215610c7457600080fd5b6000610c8286828701610bd0565b9350506020610c9386828701610bd0565b9250506040610ca486828701610be5565b9150509250925092565b60008060408385031215610cc157600080fd5b6000610ccf85828601610bd0565b9250506020610ce085828601610be5565b9150509250929050565b610cf381611225565b82525050565b6000610d048261116d565b610d0e8185611178565b9350610d1e818560208601611268565b610d278161132b565b840191505092915050565b6000610d3f602383611178565b91507f45524332303a207472616e7366657220746f20746865207a65726f206164647260008301527f65737300000000000000000000000000000000000000000000000000000000006020830152604082019050919050565b6000610da5602283611178565b91507f45524332303a20617070726f766520746f20746865207a65726f20616464726560008301527f73730000000000000000000000000000000000000000000000000000000000006020830152604082019050919050565b6000610e0b602683611178565b91507f45524332303a207472616e7366657220616d6f756e742065786365656473206260008301527f616c616e636500000000000000000000000000000000000000000000000000006020830152604082019050919050565b6000610e71602883611178565b91507f45524332303a207472616e7366657220616d6f756e742065786365656473206160008301527f6c6c6f77616e63650000000000000000000000000000000000000000000000006020830152604082019050919050565b6000610ed7602583611178565b91507f45524332303a207472616e736665722066726f6d20746865207a65726f20616460008301527f64726573730000000000000000000000000000000000000000000000000000006020830152604082019050919050565b6000610f3d602483611178565b91507f45524332303a20617070726f76652066726f6d20746865207a65726f2061646460008301527f72657373000000000000000000000000000000000000000000000000000000006020830152604082019050919050565b6000610fa3602583611178565b91507f45524332303a2064656372656173656420616c6c6f77616e63652062656c6f7760008301527f207a65726f0000000000000000000000000000000000000000000000000000006020830152604082019050919050565b61100581611251565b82525050565b6110148161125b565b82525050565b600060208201905061102f6000830184610cea565b92915050565b6000602082019050818103600083015261104f8184610cf9565b905092915050565b6000602082019050818103600083015261107081610d32565b9050919050565b6000602082019050818103600083015261109081610d98565b9050919050565b600060208201905081810360008301526110b081610dfe565b9050919050565b600060208201905081810360008301526110d081610e64565b9050919050565b600060208201905081810360008301526110f081610eca565b9050919050565b6000602082019050818103600083015261111081610f30565b9050919050565b6000602082019050818103600083015261113081610f96565b9050919050565b600060208201905061114c6000830184610ffc565b92915050565b6000602082019050611167600083018461100b565b92915050565b600081519050919050565b600082825260208201905092915050565b600061119482611251565b915061119f83611251565b9250827fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff038211156111d4576111d36112cd565b5b828201905092915050565b60006111ea82611251565b91506111f583611251565b925082821015611208576112076112cd565b5b828203905092915050565b600061121e82611231565b9050919050565b60008115159050919050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000819050919050565b600060ff82169050919050565b60005b8381101561128657808201518184015260208101905061126b565b83811115611295576000848401525b50505050565b600060028204905060018216806112b357607f821691505b602082108114156112c7576112c66112fc565b5b50919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b6000601f19601f8301169050919050565b61134581611213565b811461135057600080fd5b50565b61135c81611251565b811461136757600080fd5b5056fea2646970667358221220c713513e4bf1a1e7d2a7d43c7dba3f338145145a574dba0f032181306daa99d064736f6c63430008000033";

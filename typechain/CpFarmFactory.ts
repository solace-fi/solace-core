/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Signer, BigNumberish } from "ethers";
import { Provider, TransactionRequest } from "@ethersproject/providers";
import { Contract, ContractFactory, Overrides } from "@ethersproject/contracts";

import type { CpFarm } from "./CpFarm";

export class CpFarmFactory extends ContractFactory {
  constructor(signer?: Signer) {
    super(_abi, _bytecode, signer);
  }

  deploy(
    _governance: string,
    _master: string,
    _vault: string,
    _solace: string,
    _startBlock: BigNumberish,
    _endBlock: BigNumberish,
    _swapRouter: string,
    _weth: string,
    overrides?: Overrides
  ): Promise<CpFarm> {
    return super.deploy(
      _governance,
      _master,
      _vault,
      _solace,
      _startBlock,
      _endBlock,
      _swapRouter,
      _weth,
      overrides || {}
    ) as Promise<CpFarm>;
  }
  getDeployTransaction(
    _governance: string,
    _master: string,
    _vault: string,
    _solace: string,
    _startBlock: BigNumberish,
    _endBlock: BigNumberish,
    _swapRouter: string,
    _weth: string,
    overrides?: Overrides
  ): TransactionRequest {
    return super.getDeployTransaction(
      _governance,
      _master,
      _vault,
      _solace,
      _startBlock,
      _endBlock,
      _swapRouter,
      _weth,
      overrides || {}
    );
  }
  attach(address: string): CpFarm {
    return super.attach(address) as CpFarm;
  }
  connect(signer: Signer): CpFarmFactory {
    return super.connect(signer) as CpFarmFactory;
  }
  static connect(address: string, signerOrProvider: Signer | Provider): CpFarm {
    return new Contract(address, _abi, signerOrProvider) as CpFarm;
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
        internalType: "address",
        name: "_master",
        type: "address",
      },
      {
        internalType: "address",
        name: "_vault",
        type: "address",
      },
      {
        internalType: "contract SOLACE",
        name: "_solace",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_startBlock",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_endBlock",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "_swapRouter",
        type: "address",
      },
      {
        internalType: "address",
        name: "_weth",
        type: "address",
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
        name: "_user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "CpDeposited",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "_user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "CpWithdrawn",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "_user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "EthDeposited",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "_user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "EthWithdrawn",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "_endBlock",
        type: "uint256",
      },
    ],
    name: "FarmEndSet",
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
        indexed: true,
        internalType: "address",
        name: "_user",
        type: "address",
      },
    ],
    name: "RewardsCompounded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "_blockReward",
        type: "uint256",
      },
    ],
    name: "RewardsSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "_user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "UserRewarded",
    type: "event",
  },
  {
    stateMutability: "payable",
    type: "fallback",
  },
  {
    inputs: [],
    name: "accRewardPerShare",
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
    name: "acceptGovernance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "blockReward",
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
    name: "compoundRewards",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "depositCp",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_depositor",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_deadline",
        type: "uint256",
      },
      {
        internalType: "uint8",
        name: "v",
        type: "uint8",
      },
      {
        internalType: "bytes32",
        name: "r",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32",
      },
    ],
    name: "depositCpSigned",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "depositEth",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "endBlock",
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
    name: "farmType",
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
        name: "_from",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_to",
        type: "uint256",
      },
    ],
    name: "getMultiplier",
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
    name: "lastRewardBlock",
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
    name: "master",
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
    inputs: [
      {
        internalType: "address",
        name: "_user",
        type: "address",
      },
    ],
    name: "pendingRewards",
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
        name: "_endBlock",
        type: "uint256",
      },
    ],
    name: "setEnd",
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
        name: "_blockReward",
        type: "uint256",
      },
    ],
    name: "setRewards",
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
    name: "startBlock",
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
    name: "swapRouter",
    outputs: [
      {
        internalType: "contract ISwapRouter",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "updateFarm",
    outputs: [],
    stateMutability: "nonpayable",
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
    name: "userInfo",
    outputs: [
      {
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "rewardDebt",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "unpaidRewards",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "valueStaked",
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
    name: "vault",
    outputs: [
      {
        internalType: "contract IVault",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "weth",
    outputs: [
      {
        internalType: "contract IERC20",
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
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "withdrawCp",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_maxLoss",
        type: "uint256",
      },
    ],
    name: "withdrawEth",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "withdrawRewards",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_user",
        type: "address",
      },
    ],
    name: "withdrawRewardsForUser",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    stateMutability: "payable",
    type: "receive",
  },
];

const _bytecode =
  "0x60806040523480156200001157600080fd5b50604051620020ff380380620020ff83398101604081905262000034916200020e565b60016000819055600a80546001600160a01b03199081166001600160a01b038c811691909117909255600c805482168b841617905582548116898316179092556002805490921690871617905560048490556005839055620000a34385620001f3602090811b6200141817901c565b600655600d80546001600160a01b038085166001600160a01b031992831617909255600e8054848416921691909117905560025460405163095ea7b360e01b815291169063095ea7b3906200010190859060001990600401620002d9565b602060405180830381600087803b1580156200011c57600080fd5b505af115801562000131573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190620001579190620002b7565b50600e5460405163095ea7b360e01b81526001600160a01b039091169063095ea7b3906200018e90899060001990600401620002d9565b602060405180830381600087803b158015620001a957600080fd5b505af1158015620001be573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190620001e49190620002b7565b5050505050505050506200030b565b60008183101562000205578162000207565b825b9392505050565b600080600080600080600080610100898b0312156200022b578384fd5b88516200023881620002f2565b60208a01519098506200024b81620002f2565b60408a01519097506200025e81620002f2565b60608a01519096506200027181620002f2565b809550506080890151935060a0890151925060c08901516200029381620002f2565b60e08a0151909250620002a681620002f2565b809150509295985092959890939650565b600060208284031215620002c9578081fd5b8151801515811462000207578182fd5b6001600160a01b03929092168252602082015260400190565b6001600160a01b03811681146200030857600080fd5b50565b611de4806200031b6000396000f3fe6080604052600436106101d15760003560e01c80638b85cc7e116100f7578063ab033ea911610095578063c7b8981c11610064578063c7b8981c146104cc578063ee97f7f3146104e1578063f54ca63c146104f6578063fbfa77cf1461050b576101f2565b8063ab033ea914610462578063c00c9f7f14610482578063c31c9c0714610497578063c7a29c6f146104ac576101f2565b80639c99e2b9116100d15780639c99e2b9146103ed5780639fe27a501461040d578063a20ae5671461042d578063a9f8d1811461044d576101f2565b80638b85cc7e146103a35780638dbb1e3a146103b8578063939d6237146103d8576101f2565b80633ef8d97e1161016f57806359efce461161013e57806359efce46146103395780635aa6e675146103595780636ae5b46a1461036e5780637f498ffc14610383576101f2565b80633ef8d97e146102e55780633fc8cef314610307578063439370b11461031c57806348cd4cb114610324576101f2565b80631959a002116101ab5780631959a0021461026c578063238efcbc1461029b5780632ebed9ec146102b057806331d7a262146102c5576101f2565b8063083c63231461020c5780630955ca8d146102375780630ac168a114610257576101f2565b366101f2576001546001600160a01b031633146101f0576101f0610520565b005b6001546001600160a01b031633146101f0576101f0610520565b34801561021857600080fd5b5061022161077e565b60405161022e9190611cd1565b60405180910390f35b34801561024357600080fd5b506101f061025236600461191c565b610784565b34801561026357600080fd5b5061022161081d565b34801561027857600080fd5b5061028c610287366004611902565b610823565b60405161022e93929190611ce8565b3480156102a757600080fd5b506101f0610844565b3480156102bc57600080fd5b506102216108da565b3480156102d157600080fd5b506102216102e0366004611902565b6108df565b3480156102f157600080fd5b506102fa610992565b60405161022e9190611a07565b34801561031357600080fd5b506102fa6109a1565b6101f06109b0565b34801561033057600080fd5b506102216109ba565b34801561034557600080fd5b506101f061035436600461199a565b6109c0565b34801561036557600080fd5b506102fa610ab8565b34801561037a57600080fd5b50610221610ac7565b34801561038f57600080fd5b506101f061039e36600461199a565b610acd565b3480156103af57600080fd5b506102fa610b3e565b3480156103c457600080fd5b506102216103d33660046119ca565b610b4d565b3480156103e457600080fd5b50610221610ba3565b3480156103f957600080fd5b506101f06104083660046119ca565b610ba9565b34801561041957600080fd5b506101f061042836600461199a565b610d42565b34801561043957600080fd5b506101f0610448366004611902565b610d67565b34801561045957600080fd5b50610221610e18565b34801561046e57600080fd5b506101f061047d366004611902565b610e1e565b34801561048e57600080fd5b506101f0610e77565b3480156104a357600080fd5b506102fa61129a565b3480156104b857600080fd5b506101f06104c736600461199a565b6112a9565b3480156104d857600080fd5b506101f0611310565b3480156104ed57600080fd5b506102fa61137a565b34801561050257600080fd5b506101f0611389565b34801561051757600080fd5b506102fa611409565b6002600054141561054c5760405162461bcd60e51b815260040161054390611bf4565b60405180910390fd5b600260005561055a33611431565b3360009081526009602052604080822060015491516370a0823160e01b81529092916001600160a01b0316906370a082319061059a903090600401611a07565b60206040518083038186803b1580156105b257600080fd5b505afa1580156105c6573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906105ea91906119b2565b9050600160009054906101000a90046001600160a01b03166001600160a01b031663d0e30db0346040518263ffffffff1660e01b81526004016000604051808303818588803b15801561063c57600080fd5b505af1158015610650573d6000803e3d6000fd5b50506001546040516370a0823160e01b8152600094508593506001600160a01b0390911691506370a082319061068a903090600401611a07565b60206040518083038186803b1580156106a257600080fd5b505afa1580156106b6573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906106da91906119b2565b6106e49190611d55565b905080600860008282546106f89190611cfe565b9091555050825481908490600090610711908490611cfe565b9091555050600754835464e8d4a510009161072b91611d36565b6107359190611d16565b600184015560405133907f66ff7c8f71ccc7c36152a41920d0d3b46ef3034359f76aa1498ed4478c204b5c9061076c903490611cd1565b60405180910390a25050600160005550565b60055481565b60015460405163d505accf60e01b81526001600160a01b039091169063d505accf906107c090899030908a908a908a908a908a90600401611a3f565b600060405180830381600087803b1580156107da57600080fd5b505af11580156107ee573d6000803e3d6000fd5b505060015461080b92506001600160a01b031690508730886115af565b610815868661163a565b505050505050565b60035481565b60096020526000908152604090208054600182015460029092015490919083565b600b546001600160a01b0316331461086e5760405162461bcd60e51b815260040161054390611acc565b600b8054600a805473ffffffffffffffffffffffffffffffffffffffff199081166001600160a01b038416179091551690556040517ff2c4a3b084b019a98d9c1a566a17ac81667550bfc69a028299f70b4e9e4bba56906108d0903390611a07565b60405180910390a1565b600181565b6001600160a01b03811660009081526009602052604081206007546006544311801561090c575060085415155b1561094c57600061091f60065443610b4d565b6008549091506109348264e8d4a51000611d36565b61093e9190611d16565b6109489083611cfe565b9150505b60028201546001830154835464e8d4a510009061096a908590611d36565b6109749190611d16565b61097e9190611d55565b6109889190611cfe565b925050505b919050565b6002546001600160a01b031681565b600e546001600160a01b031681565b6109b8610520565b565b60045481565b600260005414156109e35760405162461bcd60e51b815260040161054390611bf4565b60026000556109f133611431565b3360009081526009602052604081206008805491928492610a13908490611d55565b9091555050805482908290600090610a2c908490611d55565b9091555050600754815464e8d4a5100091610a4691611d36565b610a509190611d16565b60018083019190915554610a6e906001600160a01b03163384611713565b336001600160a01b03167f74a4d0938d0f6d0b60a5942f6cfe9e26ae942687dae22697094fc51b3527665383604051610aa79190611cd1565b60405180910390a250506001600055565b600a546001600160a01b031681565b60085481565b600a546001600160a01b03163314610af75760405162461bcd60e51b815260040161054390611acc565b6005819055610b04611389565b7f0a8622338aaf5242929bad810dc991da2c6891581d101eeb840f1ca188a304ab81604051610b339190611cd1565b60405180910390a150565b600b546001600160a01b031681565b600080610b5c84600454611418565b90506000610b6c84600554611737565b905080821115610b8157600092505050610b9d565b600354610b8e8383611d55565b610b989190611d36565b925050505b92915050565b60075481565b60026000541415610bcc5760405162461bcd60e51b815260040161054390611bf4565b6002600055610bda33611431565b3360009081526009602052604081206008805491928592610bfc908490611d55565b9091555050805483908290600090610c15908490611d55565b9091555050600754815464e8d4a5100091610c2f91611d36565b610c399190611d16565b60018083019190915554604051630441a3e760e41b81526000916001600160a01b03169063441a3e7090610c739087908790600401611cda565b602060405180830381600087803b158015610c8d57600080fd5b505af1158015610ca1573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610cc591906119b2565b604051909150339082156108fc029083906000818181858888f19350505050158015610cf5573d6000803e3d6000fd5b50336001600160a01b03167f8455ae6be5d92f1df1c3c1484388e247a36c7e60d72055ae216dbc258f257d4b85604051610d2f9190611cd1565b60405180910390a2505060016000555050565b600154610d5a906001600160a01b03163330846115af565b610d64338261163a565b50565b60026000541415610d8a5760405162461bcd60e51b815260040161054390611bf4565b6002600055600c546001600160a01b0316331480610db05750336001600160a01b038216145b610dcc5760405162461bcd60e51b815260040161054390611c2b565b610dd581611431565b6001600160a01b0381166000908152600960205260409020600754815464e8d4a5100091610e0291611d36565b610e0c9190611d16565b60019182015560005550565b60065481565b600a546001600160a01b03163314610e485760405162461bcd60e51b815260040161054390611acc565b600b805473ffffffffffffffffffffffffffffffffffffffff19166001600160a01b0392909216919091179055565b60026000541415610e9a5760405162461bcd60e51b815260040161054390611bf4565b6002600055610ea7611389565b33600090815260096020526040812060028101546001820154600754835493949364e8d4a5100091610ed891611d36565b610ee29190611d16565b610eec9190611d55565b610ef69190611cfe565b905080610f04575050611293565b600254600c546040516370a0823160e01b81526000926001600160a01b03908116926370a0823192610f3c9290911690600401611a07565b60206040518083038186803b158015610f5457600080fd5b505afa158015610f68573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610f8c91906119b2565b90506000610f9a8383611737565b9050610fa68184611d55565b600280860191909155600c549054610fcc916001600160a01b03918216911630846115af565b600d5460408051610100810182526002546001600160a01b039081168252600e5481166020830152610bb88284015230606083015242608083015260a08201859052600060c0830181905260e08301819052925163414bf38960e01b81529293169163414bf3899161104091600401611c62565b602060405180830381600087803b15801561105a57600080fd5b505af115801561106e573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061109291906119b2565b6001546040516370a0823160e01b81529192506000916001600160a01b03909116906370a08231906110c8903090600401611a07565b60206040518083038186803b1580156110e057600080fd5b505afa1580156110f4573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061111891906119b2565b60015460405163348706ed60e11b81529192506001600160a01b03169063690e0dda90611149908590600401611cd1565b600060405180830381600087803b15801561116357600080fd5b505af1158015611177573d6000803e3d6000fd5b50506001546040516370a0823160e01b8152600093508492506001600160a01b03909116906370a08231906111b0903090600401611a07565b60206040518083038186803b1580156111c857600080fd5b505afa1580156111dc573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061120091906119b2565b61120a9190611d55565b9050806008600082825461121e9190611cfe565b9091555050865481908890600090611237908490611cfe565b9091555050600754875464e8d4a510009161125191611d36565b61125b9190611d16565b600188015560405133907f686f169531e505138ecbeed8893c102770842f81d6b113d577f2f7c81e3c9fc690600090a2505050505050505b6001600055565b600d546001600160a01b031681565b600c546001600160a01b031633146112d35760405162461bcd60e51b815260040161054390611c2b565b6112db611389565b60038190556040517f3a9c73865b863f6b3112a48ba71b6cc75b1b5440abddbcba0135c64a4056508b90610b33908390611cd1565b600260005414156113335760405162461bcd60e51b815260040161054390611bf4565b600260005561134133611431565b336000908152600960205260409020600754815464e8d4a510009161136591611d36565b61136f9190611d16565b600191820155600055565b600c546001600160a01b031681565b6006544311611397576109b8565b6008546113b2576113aa43600554611737565b6006556109b8565b60006113c060065443610b4d565b6008549091506113d58264e8d4a51000611d36565b6113df9190611d16565b600760008282546113f09190611cfe565b9250508190555061140343600554611737565b60065550565b6001546001600160a01b031681565b600081831015611428578161142a565b825b9392505050565b611439611389565b6001600160a01b038116600090815260096020526040812060028101546001820154600754835493949364e8d4a510009161147391611d36565b61147d9190611d16565b6114879190611d55565b6114919190611cfe565b90508061149f575050610d64565b600254600c546040516370a0823160e01b81526000926001600160a01b03908116926370a08231926114d79290911690600401611a07565b60206040518083038186803b1580156114ef57600080fd5b505afa158015611503573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061152791906119b2565b905060006115358383611737565b90506115418184611d55565b600280860191909155600c549054611567916001600160a01b03918216911687846115af565b846001600160a01b03167fe366ef68d2c0620e9e4c5074fd7ad0ce6739b65287f9c2d09b7d002da556879b826040516115a09190611cd1565b60405180910390a25050505050565b611634846323b872dd60e01b8585856040516024016115d093929190611a1b565b60408051601f198184030181529190526020810180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167fffffffff0000000000000000000000000000000000000000000000000000000090931692909217909152611746565b50505050565b6002600054141561165d5760405162461bcd60e51b815260040161054390611bf4565b600260005561166b82611431565b6001600160a01b03821660009081526009602052604081206008805491928492611696908490611cfe565b90915550508054829082906000906116af908490611cfe565b9091555050600754815464e8d4a51000916116c991611d36565b6116d39190611d16565b60018201556040516001600160a01b038416907f77826d6f7ece13b5a87104b75358a96927874d7e89a5b626a26ff8e8bcb93f1f9061076c908590611cd1565b6117328363a9059cbb60e01b84846040516024016115d0929190611a80565b505050565b6000818310611428578161142a565b600061179b826040518060400160405280602081526020017f5361666545524332303a206c6f772d6c6576656c2063616c6c206661696c6564815250856001600160a01b03166117d59092919063ffffffff16565b80519091501561173257808060200190518101906117b9919061197a565b6117325760405162461bcd60e51b815260040161054390611b97565b60606117e484846000856117ec565b949350505050565b60608247101561180e5760405162461bcd60e51b815260040161054390611b03565b611817856118ac565b6118335760405162461bcd60e51b815260040161054390611b60565b600080866001600160a01b0316858760405161184f91906119eb565b60006040518083038185875af1925050503d806000811461188c576040519150601f19603f3d011682016040523d82523d6000602084013e611891565b606091505b50915091506118a18282866118b2565b979650505050505050565b3b151590565b606083156118c157508161142a565b8251156118d15782518084602001fd5b8160405162461bcd60e51b81526004016105439190611a99565b80356001600160a01b038116811461098d57600080fd5b600060208284031215611913578081fd5b61142a826118eb565b60008060008060008060c08789031215611934578182fd5b61193d876118eb565b95506020870135945060408701359350606087013560ff81168114611960578283fd5b9598949750929560808101359460a0909101359350915050565b60006020828403121561198b578081fd5b8151801515811461142a578182fd5b6000602082840312156119ab578081fd5b5035919050565b6000602082840312156119c3578081fd5b5051919050565b600080604083850312156119dc578182fd5b50508035926020909101359150565b600082516119fd818460208701611d6c565b9190910192915050565b6001600160a01b0391909116815260200190565b6001600160a01b039384168152919092166020820152604081019190915260600190565b6001600160a01b0397881681529590961660208601526040850193909352606084019190915260ff16608083015260a082015260c081019190915260e00190565b6001600160a01b03929092168252602082015260400190565b6000602082528251806020840152611ab8816040850160208701611d6c565b601f01601f19169190910160400192915050565b6020808252600b908201527f21676f7665726e616e6365000000000000000000000000000000000000000000604082015260600190565b60208082526026908201527f416464726573733a20696e73756666696369656e742062616c616e636520666f60408201527f722063616c6c0000000000000000000000000000000000000000000000000000606082015260800190565b6020808252601d908201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e7472616374000000604082015260600190565b6020808252602a908201527f5361666545524332303a204552433230206f7065726174696f6e20646964206e60408201527f6f74207375636365656400000000000000000000000000000000000000000000606082015260800190565b6020808252601f908201527f5265656e7472616e637947756172643a207265656e7472616e742063616c6c00604082015260600190565b60208082526007908201527f216d617374657200000000000000000000000000000000000000000000000000604082015260600190565b6000610100820190506001600160a01b0380845116835280602085015116602084015262ffffff60408501511660408401528060608501511660608401526080840151608084015260a084015160a084015260c084015160c08401528060e08501511660e08401525092915050565b90815260200190565b918252602082015260400190565b9283526020830191909152604082015260600190565b60008219821115611d1157611d11611d98565b500190565b600082611d3157634e487b7160e01b81526012600452602481fd5b500490565b6000816000190483118215151615611d5057611d50611d98565b500290565b600082821015611d6757611d67611d98565b500390565b60005b83811015611d87578181015183820152602001611d6f565b838111156116345750506000910152565b634e487b7160e01b600052601160045260246000fdfea264697066735822122017088476fcda6d379cdd73df6366d9e2955d43adbeed410411b9379ce078aacf64736f6c63430008000033";

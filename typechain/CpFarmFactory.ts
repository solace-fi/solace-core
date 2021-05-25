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
    _master: string,
    _vault: string,
    _solace: string,
    _startBlock: BigNumberish,
    _endBlock: BigNumberish,
    overrides?: Overrides
  ): Promise<CpFarm> {
    return super.deploy(
      _master,
      _vault,
      _solace,
      _startBlock,
      _endBlock,
      overrides || {}
    ) as Promise<CpFarm>;
  }
  getDeployTransaction(
    _master: string,
    _vault: string,
    _solace: string,
    _startBlock: BigNumberish,
    _endBlock: BigNumberish,
    overrides?: Overrides
  ): TransactionRequest {
    return super.getDeployTransaction(
      _master,
      _vault,
      _solace,
      _startBlock,
      _endBlock,
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
    name: "DepositCp",
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
    name: "DepositEth",
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
    name: "WithdrawCp",
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
    name: "WithdrawEth",
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
    stateMutability: "payable",
    type: "receive",
  },
];

const _bytecode =
  "0x608060405260016000553480156200001657600080fd5b50604051620016c5380380620016c58339810160408190526200003991620000d5565b600b80546001600160a01b03199081166001600160a01b03888116919091179092556001805482168784161790556002805490911691851691909117905560048290556005819055620000994383620000ba602090811b62000ca617901c565b6006555050600a80546001600160a01b031916331790555062000152915050565b600081831015620000cc5781620000ce565b825b9392505050565b600080600080600060a08688031215620000ed578081fd5b8551620000fa8162000139565b60208701519095506200010d8162000139565b6040870151909450620001208162000139565b6060870151608090970151959894975095949392505050565b6001600160a01b03811681146200014f57600080fd5b50565b61156380620001626000396000f3fe60806040526004361061018f5760003560e01c80637f498ffc116100d6578063ab033ea91161007f578063ee97f7f311610059578063ee97f7f314610416578063f54ca63c1461042b578063fbfa77cf14610440576101b0565b8063ab033ea9146103c1578063c7a29c6f146103e1578063c7b8981c14610401576101b0565b80639c99e2b9116100b05780639c99e2b91461036c5780639fe27a501461038c578063a9f8d181146103ac576101b0565b80637f498ffc146103175780638dbb1e3a14610337578063939d623714610357576101b0565b80633ef8d97e1161013857806359efce461161011257806359efce46146102cd5780635aa6e675146102ed5780636ae5b46a14610302576101b0565b80633ef8d97e1461028e578063439370b1146102b057806348cd4cb1146102b8576101b0565b80631959a002116101695780631959a0021461022a5780632ebed9ec1461025957806331d7a2621461026e576101b0565b8063083c6323146101ca5780630955ca8d146101f55780630ac168a114610215576101b0565b366101b0576001546001600160a01b031633146101ae576101ae610455565b005b6001546001600160a01b031633146101ae576101ae610455565b3480156101d657600080fd5b506101df61067d565b6040516101ec9190611450565b60405180910390f35b34801561020157600080fd5b506101ae610210366004611141565b610683565b34801561022157600080fd5b506101df61071c565b34801561023657600080fd5b5061024a610245366004611127565b610722565b6040516101ec93929190611467565b34801561026557600080fd5b506101df610743565b34801561027a57600080fd5b506101df610289366004611127565b610749565b34801561029a57600080fd5b506102a36107fc565b6040516101ec919061122c565b6101ae61080b565b3480156102c457600080fd5b506101df610815565b3480156102d957600080fd5b506101ae6102e83660046111bf565b61081b565b3480156102f957600080fd5b506102a36108e6565b34801561030e57600080fd5b506101df6108f5565b34801561032357600080fd5b506101ae6103323660046111bf565b6108fb565b34801561034357600080fd5b506101df6103523660046111ef565b61093b565b34801561036357600080fd5b506101df610991565b34801561037857600080fd5b506101ae6103873660046111ef565b610997565b34801561039857600080fd5b506101ae6103a73660046111bf565b610b03565b3480156103b857600080fd5b506101df610b28565b3480156103cd57600080fd5b506101ae6103dc366004611127565b610b2e565b3480156103ed57600080fd5b506101ae6103fc3660046111bf565b610b92565b34801561040d57600080fd5b506101ae610bc9565b34801561042257600080fd5b506102a3610c08565b34801561043757600080fd5b506101ae610c17565b34801561044c57600080fd5b506102a3610c97565b61045e33610cbf565b3360009081526009602052604080822060015491516370a0823160e01b81529092916001600160a01b0316906370a082319061049e90309060040161122c565b60206040518083038186803b1580156104b657600080fd5b505afa1580156104ca573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906104ee91906111d7565b9050600160009054906101000a90046001600160a01b03166001600160a01b031663d0e30db0346040518263ffffffff1660e01b81526004016000604051808303818588803b15801561054057600080fd5b505af1158015610554573d6000803e3d6000fd5b50506001546040516370a0823160e01b8152600094508593506001600160a01b0390911691506370a082319061058e90309060040161122c565b60206040518083038186803b1580156105a657600080fd5b505afa1580156105ba573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906105de91906111d7565b6105e891906114d4565b905080600860008282546105fc919061147d565b909155505082548190849060009061061590849061147d565b9091555050600754835464e8d4a510009161062f916114b5565b6106399190611495565b600184015560405133907f7034bb05cfe54b0d147fc0574ed166101e7f0313eb404e113974fbe2a998ca8390610670903490611450565b60405180910390a2505050565b60055481565b60015460405163d505accf60e01b81526001600160a01b039091169063d505accf906106bf90899030908a908a908a908a908a90600401611264565b600060405180830381600087803b1580156106d957600080fd5b505af11580156106ed573d6000803e3d6000fd5b505060015461070a92506001600160a01b03169050873088610dfc565b6107148686610e87565b505050505050565b60035481565b60096020526000908152604090208054600182015460029092015490919083565b60005481565b6001600160a01b038116600090815260096020526040812060075460065443118015610776575060085415155b156107b65760006107896006544361093b565b60085490915061079e8264e8d4a510006114b5565b6107a89190611495565b6107b2908361147d565b9150505b60028201546001830154835464e8d4a51000906107d49085906114b5565b6107de9190611495565b6107e891906114d4565b6107f2919061147d565b925050505b919050565b6002546001600160a01b031681565b610813610455565b565b60045481565b61082433610cbf565b33600090815260096020526040812060088054919284926108469084906114d4565b909155505080548290829060009061085f9084906114d4565b9091555050600754815464e8d4a5100091610879916114b5565b6108839190611495565b600180830191909155546108a1906001600160a01b03163384610f38565b336001600160a01b03167fcc5954c5d719eb6aa8cf5b5af5a4c87dc37edf45cc533f32fa9879fba745fa87836040516108da9190611450565b60405180910390a25050565b600a546001600160a01b031681565b60085481565b600a546001600160a01b0316331461092e5760405162461bcd60e51b8152600401610925906112f1565b60405180910390fd5b610936610c17565b600555565b60008061094a84600454610ca6565b9050600061095a84600554610f5c565b90508082111561096f5760009250505061098b565b60035461097c83836114d4565b61098691906114b5565b925050505b92915050565b60075481565b6109a033610cbf565b33600090815260096020526040812060088054919285926109c29084906114d4565b90915550508054839082906000906109db9084906114d4565b9091555050600754815464e8d4a51000916109f5916114b5565b6109ff9190611495565b60018083019190915554604051630441a3e760e41b81526000916001600160a01b03169063441a3e7090610a399087908790600401611459565b602060405180830381600087803b158015610a5357600080fd5b505af1158015610a67573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610a8b91906111d7565b604051909150339082156108fc029083906000818181858888f19350505050158015610abb573d6000803e3d6000fd5b50336001600160a01b03167fccbd99ba6da8f29b2a4f65e474e3c3973564d356c162c08d45f3dc7f0cb5b3aa85604051610af59190611450565b60405180910390a250505050565b600154610b1b906001600160a01b0316333084610dfc565b610b253382610e87565b50565b60065481565b600a546001600160a01b03163314610b585760405162461bcd60e51b8152600401610925906112f1565b600a80547fffffffffffffffffffffffff0000000000000000000000000000000000000000166001600160a01b0392909216919091179055565b600b546001600160a01b03163314610bbc5760405162461bcd60e51b815260040161092590611419565b610bc4610c17565b600355565b610bd233610cbf565b336000908152600960205260409020600754815464e8d4a5100091610bf6916114b5565b610c009190611495565b600190910155565b600b546001600160a01b031681565b6006544311610c2557610813565b600854610c4057610c3843600554610f5c565b600655610813565b6000610c4e6006544361093b565b600854909150610c638264e8d4a510006114b5565b610c6d9190611495565b60076000828254610c7e919061147d565b92505081905550610c9143600554610f5c565b60065550565b6001546001600160a01b031681565b600081831015610cb65781610cb8565b825b9392505050565b610cc7610c17565b6001600160a01b038116600090815260096020526040812060028101546001820154600754835493949364e8d4a5100091610d01916114b5565b610d0b9190611495565b610d1591906114d4565b610d1f919061147d565b905080610d2d575050610b25565b600254600b546040516370a0823160e01b81526000926001600160a01b03908116926370a0823192610d65929091169060040161122c565b60206040518083038186803b158015610d7d57600080fd5b505afa158015610d91573d6000803e3d6000fd5b505050506040513d601f19601f82011682018060405250810190610db591906111d7565b90506000610dc38383610f5c565b9050610dcf81846114d4565b600280860191909155600b549054610df5916001600160a01b0391821691168784610dfc565b5050505050565b610e81846323b872dd60e01b858585604051602401610e1d93929190611240565b60408051601f198184030181529190526020810180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167fffffffff0000000000000000000000000000000000000000000000000000000090931692909217909152610f6b565b50505050565b610e9082610cbf565b6001600160a01b03821660009081526009602052604081206008805491928492610ebb90849061147d565b9091555050805482908290600090610ed490849061147d565b9091555050600754815464e8d4a5100091610eee916114b5565b610ef89190611495565b60018201556040516001600160a01b038416907f432f209288a77573648a2d1611054bc155dbd7814b48976ad23334e037c55dfe90610670908590611450565b610f578363a9059cbb60e01b8484604051602401610e1d9291906112a5565b505050565b6000818310610cb65781610cb8565b6000610fc0826040518060400160405280602081526020017f5361666545524332303a206c6f772d6c6576656c2063616c6c206661696c6564815250856001600160a01b0316610ffa9092919063ffffffff16565b805190915015610f575780806020019051810190610fde919061119f565b610f575760405162461bcd60e51b8152600401610925906113bc565b60606110098484600085611011565b949350505050565b6060824710156110335760405162461bcd60e51b815260040161092590611328565b61103c856110d1565b6110585760405162461bcd60e51b815260040161092590611385565b600080866001600160a01b031685876040516110749190611210565b60006040518083038185875af1925050503d80600081146110b1576040519150601f19603f3d011682016040523d82523d6000602084013e6110b6565b606091505b50915091506110c68282866110d7565b979650505050505050565b3b151590565b606083156110e6575081610cb8565b8251156110f65782518084602001fd5b8160405162461bcd60e51b815260040161092591906112be565b80356001600160a01b03811681146107f757600080fd5b600060208284031215611138578081fd5b610cb882611110565b60008060008060008060c08789031215611159578182fd5b61116287611110565b95506020870135945060408701359350606087013560ff81168114611185578283fd5b9598949750929560808101359460a0909101359350915050565b6000602082840312156111b0578081fd5b81518015158114610cb8578182fd5b6000602082840312156111d0578081fd5b5035919050565b6000602082840312156111e8578081fd5b5051919050565b60008060408385031215611201578182fd5b50508035926020909101359150565b600082516112228184602087016114eb565b9190910192915050565b6001600160a01b0391909116815260200190565b6001600160a01b039384168152919092166020820152604081019190915260600190565b6001600160a01b0397881681529590961660208601526040850193909352606084019190915260ff16608083015260a082015260c081019190915260e00190565b6001600160a01b03929092168252602082015260400190565b60006020825282518060208401526112dd8160408501602087016114eb565b601f01601f19169190910160400192915050565b6020808252600b908201527f21676f7665726e616e6365000000000000000000000000000000000000000000604082015260600190565b60208082526026908201527f416464726573733a20696e73756666696369656e742062616c616e636520666f60408201527f722063616c6c0000000000000000000000000000000000000000000000000000606082015260800190565b6020808252601d908201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e7472616374000000604082015260600190565b6020808252602a908201527f5361666545524332303a204552433230206f7065726174696f6e20646964206e60408201527f6f74207375636365656400000000000000000000000000000000000000000000606082015260800190565b60208082526007908201527f216d617374657200000000000000000000000000000000000000000000000000604082015260600190565b90815260200190565b918252602082015260400190565b9283526020830191909152604082015260600190565b6000821982111561149057611490611517565b500190565b6000826114b057634e487b7160e01b81526012600452602481fd5b500490565b60008160001904831182151516156114cf576114cf611517565b500290565b6000828210156114e6576114e6611517565b500390565b60005b838110156115065781810151838201526020016114ee565b83811115610e815750506000910152565b634e487b7160e01b600052601160045260246000fdfea2646970667358221220de697e7a12d6f7f54413e1d146c54103eb322bfd85614ce2894e53a01085877b64736f6c63430008000033";

/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import {
  ethers,
  EventFilter,
  Signer,
  BigNumber,
  BigNumberish,
  PopulatedTransaction,
} from "ethers";
import {
  Contract,
  ContractTransaction,
  Overrides,
  CallOverrides,
} from "@ethersproject/contracts";
import { BytesLike } from "@ethersproject/bytes";
import { Listener, Provider } from "@ethersproject/providers";
import { FunctionFragment, EventFragment, Result } from "@ethersproject/abi";

interface IPolicyManagerInterface extends ethers.utils.Interface {
  functions: {
    "addProduct(address)": FunctionFragment;
    "burn(uint256)": FunctionFragment;
    "createPolicy(address,address,uint256,uint256,uint256)": FunctionFragment;
    "getPolicyCoverAmount(uint256)": FunctionFragment;
    "getPolicyExpirationBlock(uint256)": FunctionFragment;
    "getPolicyParams(uint256)": FunctionFragment;
    "getPolicyPositionContract(uint256)": FunctionFragment;
    "getPolicyPrice(uint256)": FunctionFragment;
    "getPolicyProduct(uint256)": FunctionFragment;
    "getPolicyholder(uint256)": FunctionFragment;
    "myPolicies()": FunctionFragment;
    "removeProduct(address)": FunctionFragment;
    "setGovernance(address)": FunctionFragment;
    "setTokenURI(uint256,address,address,uint256,uint256,uint256)": FunctionFragment;
    "supportsInterface(bytes4)": FunctionFragment;
    "tokenURI(uint256)": FunctionFragment;
  };

  encodeFunctionData(functionFragment: "addProduct", values: [string]): string;
  encodeFunctionData(functionFragment: "burn", values: [BigNumberish]): string;
  encodeFunctionData(
    functionFragment: "createPolicy",
    values: [string, string, BigNumberish, BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getPolicyCoverAmount",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getPolicyExpirationBlock",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getPolicyParams",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getPolicyPositionContract",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getPolicyPrice",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getPolicyProduct",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getPolicyholder",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "myPolicies",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "removeProduct",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "setGovernance",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "setTokenURI",
    values: [
      BigNumberish,
      string,
      string,
      BigNumberish,
      BigNumberish,
      BigNumberish
    ]
  ): string;
  encodeFunctionData(
    functionFragment: "supportsInterface",
    values: [BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "tokenURI",
    values: [BigNumberish]
  ): string;

  decodeFunctionResult(functionFragment: "addProduct", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "burn", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "createPolicy",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getPolicyCoverAmount",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getPolicyExpirationBlock",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getPolicyParams",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getPolicyPositionContract",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getPolicyPrice",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getPolicyProduct",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getPolicyholder",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "myPolicies", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "removeProduct",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setGovernance",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setTokenURI",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "supportsInterface",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "tokenURI", data: BytesLike): Result;

  events: {
    "PolicyBurned(uint256)": EventFragment;
    "PolicyCreated(uint256)": EventFragment;
    "ProductAdded(address)": EventFragment;
    "ProductRemoved(address)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "PolicyBurned"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "PolicyCreated"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "ProductAdded"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "ProductRemoved"): EventFragment;
}

export class IPolicyManager extends Contract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  on(event: EventFilter | string, listener: Listener): this;
  once(event: EventFilter | string, listener: Listener): this;
  addListener(eventName: EventFilter | string, listener: Listener): this;
  removeAllListeners(eventName: EventFilter | string): this;
  removeListener(eventName: any, listener: Listener): this;

  interface: IPolicyManagerInterface;

  functions: {
    addProduct(
      _product: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "addProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    burn(
      _tokenId: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "burn(uint256)"(
      _tokenId: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    createPolicy(
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "createPolicy(address,address,uint256,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    getPolicyCoverAmount(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "getPolicyCoverAmount(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    getPolicyExpirationBlock(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "getPolicyExpirationBlock(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    getPolicyParams(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: {
        policyholder: string;
        product: string;
        positionContract: string;
        expirationBlock: BigNumber;
        coverAmount: BigNumber;
        price: BigNumber;
        0: string;
        1: string;
        2: string;
        3: BigNumber;
        4: BigNumber;
        5: BigNumber;
      };
    }>;

    "getPolicyParams(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: {
        policyholder: string;
        product: string;
        positionContract: string;
        expirationBlock: BigNumber;
        coverAmount: BigNumber;
        price: BigNumber;
        0: string;
        1: string;
        2: string;
        3: BigNumber;
        4: BigNumber;
        5: BigNumber;
      };
    }>;

    getPolicyPositionContract(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "getPolicyPositionContract(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    getPolicyPrice(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "getPolicyPrice(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    getPolicyProduct(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "getPolicyProduct(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    getPolicyholder(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "getPolicyholder(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    myPolicies(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber[];
    }>;

    "myPolicies()"(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber[];
    }>;

    removeProduct(
      _product: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "removeProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setGovernance(
      _governance: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setGovernance(address)"(
      _governance: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setTokenURI(
      _tokenId: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setTokenURI(uint256,address,address,uint256,uint256,uint256)"(
      _tokenId: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<{
      0: boolean;
    }>;

    "supportsInterface(bytes4)"(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<{
      0: boolean;
    }>;

    tokenURI(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "tokenURI(uint256)"(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;
  };

  addProduct(
    _product: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "addProduct(address)"(
    _product: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  burn(
    _tokenId: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "burn(uint256)"(
    _tokenId: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  createPolicy(
    _policyholder: string,
    _positionContract: string,
    _expirationBlock: BigNumberish,
    _coverAmount: BigNumberish,
    _price: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "createPolicy(address,address,uint256,uint256,uint256)"(
    _policyholder: string,
    _positionContract: string,
    _expirationBlock: BigNumberish,
    _coverAmount: BigNumberish,
    _price: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  getPolicyCoverAmount(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "getPolicyCoverAmount(uint256)"(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  getPolicyExpirationBlock(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "getPolicyExpirationBlock(uint256)"(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  getPolicyParams(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<{
    policyholder: string;
    product: string;
    positionContract: string;
    expirationBlock: BigNumber;
    coverAmount: BigNumber;
    price: BigNumber;
    0: string;
    1: string;
    2: string;
    3: BigNumber;
    4: BigNumber;
    5: BigNumber;
  }>;

  "getPolicyParams(uint256)"(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<{
    policyholder: string;
    product: string;
    positionContract: string;
    expirationBlock: BigNumber;
    coverAmount: BigNumber;
    price: BigNumber;
    0: string;
    1: string;
    2: string;
    3: BigNumber;
    4: BigNumber;
    5: BigNumber;
  }>;

  getPolicyPositionContract(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  "getPolicyPositionContract(uint256)"(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  getPolicyPrice(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "getPolicyPrice(uint256)"(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  getPolicyProduct(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  "getPolicyProduct(uint256)"(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  getPolicyholder(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  "getPolicyholder(uint256)"(
    _policyID: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  myPolicies(overrides?: CallOverrides): Promise<BigNumber[]>;

  "myPolicies()"(overrides?: CallOverrides): Promise<BigNumber[]>;

  removeProduct(
    _product: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "removeProduct(address)"(
    _product: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setGovernance(
    _governance: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setGovernance(address)"(
    _governance: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setTokenURI(
    _tokenId: BigNumberish,
    _policyholder: string,
    _positionContract: string,
    _expirationBlock: BigNumberish,
    _coverAmount: BigNumberish,
    _price: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setTokenURI(uint256,address,address,uint256,uint256,uint256)"(
    _tokenId: BigNumberish,
    _policyholder: string,
    _positionContract: string,
    _expirationBlock: BigNumberish,
    _coverAmount: BigNumberish,
    _price: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  supportsInterface(
    interfaceId: BytesLike,
    overrides?: CallOverrides
  ): Promise<boolean>;

  "supportsInterface(bytes4)"(
    interfaceId: BytesLike,
    overrides?: CallOverrides
  ): Promise<boolean>;

  tokenURI(tokenId: BigNumberish, overrides?: CallOverrides): Promise<string>;

  "tokenURI(uint256)"(
    tokenId: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  callStatic: {
    addProduct(_product: string, overrides?: CallOverrides): Promise<void>;

    "addProduct(address)"(
      _product: string,
      overrides?: CallOverrides
    ): Promise<void>;

    burn(_tokenId: BigNumberish, overrides?: CallOverrides): Promise<void>;

    "burn(uint256)"(
      _tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    createPolicy(
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "createPolicy(address,address,uint256,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyCoverAmount(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyCoverAmount(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyExpirationBlock(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyExpirationBlock(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyParams(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      policyholder: string;
      product: string;
      positionContract: string;
      expirationBlock: BigNumber;
      coverAmount: BigNumber;
      price: BigNumber;
      0: string;
      1: string;
      2: string;
      3: BigNumber;
      4: BigNumber;
      5: BigNumber;
    }>;

    "getPolicyParams(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      policyholder: string;
      product: string;
      positionContract: string;
      expirationBlock: BigNumber;
      coverAmount: BigNumber;
      price: BigNumber;
      0: string;
      1: string;
      2: string;
      3: BigNumber;
      4: BigNumber;
      5: BigNumber;
    }>;

    getPolicyPositionContract(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    "getPolicyPositionContract(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    getPolicyPrice(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyPrice(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyProduct(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    "getPolicyProduct(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    getPolicyholder(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    "getPolicyholder(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    myPolicies(overrides?: CallOverrides): Promise<BigNumber[]>;

    "myPolicies()"(overrides?: CallOverrides): Promise<BigNumber[]>;

    removeProduct(_product: string, overrides?: CallOverrides): Promise<void>;

    "removeProduct(address)"(
      _product: string,
      overrides?: CallOverrides
    ): Promise<void>;

    setGovernance(
      _governance: string,
      overrides?: CallOverrides
    ): Promise<void>;

    "setGovernance(address)"(
      _governance: string,
      overrides?: CallOverrides
    ): Promise<void>;

    setTokenURI(
      _tokenId: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "setTokenURI(uint256,address,address,uint256,uint256,uint256)"(
      _tokenId: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<boolean>;

    "supportsInterface(bytes4)"(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<boolean>;

    tokenURI(tokenId: BigNumberish, overrides?: CallOverrides): Promise<string>;

    "tokenURI(uint256)"(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;
  };

  filters: {
    PolicyBurned(tokenID: null): EventFilter;

    PolicyCreated(tokenID: null): EventFilter;

    ProductAdded(product: null): EventFilter;

    ProductRemoved(product: null): EventFilter;
  };

  estimateGas: {
    addProduct(_product: string, overrides?: Overrides): Promise<BigNumber>;

    "addProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    burn(_tokenId: BigNumberish, overrides?: Overrides): Promise<BigNumber>;

    "burn(uint256)"(
      _tokenId: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    createPolicy(
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "createPolicy(address,address,uint256,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    getPolicyCoverAmount(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyCoverAmount(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyExpirationBlock(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyExpirationBlock(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyParams(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyParams(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyPositionContract(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyPositionContract(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyPrice(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyPrice(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyProduct(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyProduct(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyholder(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyholder(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    myPolicies(overrides?: CallOverrides): Promise<BigNumber>;

    "myPolicies()"(overrides?: CallOverrides): Promise<BigNumber>;

    removeProduct(_product: string, overrides?: Overrides): Promise<BigNumber>;

    "removeProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setGovernance(
      _governance: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setGovernance(address)"(
      _governance: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setTokenURI(
      _tokenId: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setTokenURI(uint256,address,address,uint256,uint256,uint256)"(
      _tokenId: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "supportsInterface(bytes4)"(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    tokenURI(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "tokenURI(uint256)"(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    addProduct(
      _product: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "addProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    burn(
      _tokenId: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "burn(uint256)"(
      _tokenId: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    createPolicy(
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "createPolicy(address,address,uint256,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    getPolicyCoverAmount(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getPolicyCoverAmount(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getPolicyExpirationBlock(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getPolicyExpirationBlock(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getPolicyParams(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getPolicyParams(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getPolicyPositionContract(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getPolicyPositionContract(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getPolicyPrice(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getPolicyPrice(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getPolicyProduct(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getPolicyProduct(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getPolicyholder(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getPolicyholder(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    myPolicies(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "myPolicies()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    removeProduct(
      _product: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "removeProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setGovernance(
      _governance: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setGovernance(address)"(
      _governance: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setTokenURI(
      _tokenId: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setTokenURI(uint256,address,address,uint256,uint256,uint256)"(
      _tokenId: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      _expirationBlock: BigNumberish,
      _coverAmount: BigNumberish,
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    supportsInterface(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "supportsInterface(bytes4)"(
      interfaceId: BytesLike,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    tokenURI(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "tokenURI(uint256)"(
      tokenId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;
  };
}

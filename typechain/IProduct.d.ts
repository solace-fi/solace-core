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
  PayableOverrides,
  CallOverrides,
} from "@ethersproject/contracts";
import { BytesLike } from "@ethersproject/bytes";
import { Listener, Provider } from "@ethersproject/providers";
import { FunctionFragment, EventFragment, Result } from "@ethersproject/abi";

interface IProductInterface extends ethers.utils.Interface {
  functions: {
    "buyPolicy(uint256,uint256,address,address)": FunctionFragment;
    "cancelPolicy(uint256)": FunctionFragment;
    "extendPolicy(uint256,uint256)": FunctionFragment;
    "getPolicyExpiration(address)": FunctionFragment;
    "getPolicyLimit(address)": FunctionFragment;
    "getQuote(uint256,uint256,address)": FunctionFragment;
    "getTotalCovered()": FunctionFragment;
    "getTotalPosition(address)": FunctionFragment;
    "setCancelFee(uint256)": FunctionFragment;
    "setMaxCoverAmount(uint256)": FunctionFragment;
    "setMaxPeriod(uint256)": FunctionFragment;
    "setMinPeriod(uint256)": FunctionFragment;
    "setPrice(uint256)": FunctionFragment;
  };

  encodeFunctionData(
    functionFragment: "buyPolicy",
    values: [BigNumberish, BigNumberish, string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "cancelPolicy",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "extendPolicy",
    values: [BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getPolicyExpiration",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "getPolicyLimit",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "getQuote",
    values: [BigNumberish, BigNumberish, string]
  ): string;
  encodeFunctionData(
    functionFragment: "getTotalCovered",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "getTotalPosition",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "setCancelFee",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setMaxCoverAmount",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setMaxPeriod",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setMinPeriod",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setPrice",
    values: [BigNumberish]
  ): string;

  decodeFunctionResult(functionFragment: "buyPolicy", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "cancelPolicy",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "extendPolicy",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getPolicyExpiration",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getPolicyLimit",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "getQuote", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "getTotalCovered",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "getTotalPosition",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setCancelFee",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setMaxCoverAmount",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setMaxPeriod",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setMinPeriod",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "setPrice", data: BytesLike): Result;

  events: {};
}

export class IProduct extends Contract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  on(event: EventFilter | string, listener: Listener): this;
  once(event: EventFilter | string, listener: Listener): this;
  addListener(eventName: EventFilter | string, listener: Listener): this;
  removeAllListeners(eventName: EventFilter | string): this;
  removeListener(eventName: any, listener: Listener): this;

  interface: IProductInterface;

  functions: {
    buyPolicy(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<ContractTransaction>;

    "buyPolicy(uint256,uint256,address,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<ContractTransaction>;

    cancelPolicy(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "cancelPolicy(uint256)"(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    extendPolicy(
      _policyID: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<ContractTransaction>;

    "extendPolicy(uint256,uint256)"(
      _policyID: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<ContractTransaction>;

    getPolicyExpiration(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<{
      expirationDate: BigNumber;
      0: BigNumber;
    }>;

    "getPolicyExpiration(address)"(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<{
      expirationDate: BigNumber;
      0: BigNumber;
    }>;

    getPolicyLimit(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<{
      coverLimit: BigNumber;
      0: BigNumber;
    }>;

    "getPolicyLimit(address)"(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<{
      coverLimit: BigNumber;
      0: BigNumber;
    }>;

    getQuote(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "getQuote(uint256,uint256,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    getTotalCovered(
      overrides?: CallOverrides
    ): Promise<{
      coveredAmount: BigNumber;
      0: BigNumber;
    }>;

    "getTotalCovered()"(
      overrides?: CallOverrides
    ): Promise<{
      coveredAmount: BigNumber;
      0: BigNumber;
    }>;

    getTotalPosition(
      _buyer: string,
      overrides?: CallOverrides
    ): Promise<{
      positionAmount: BigNumber;
      0: BigNumber;
    }>;

    "getTotalPosition(address)"(
      _buyer: string,
      overrides?: CallOverrides
    ): Promise<{
      positionAmount: BigNumber;
      0: BigNumber;
    }>;

    setCancelFee(
      _cancelFee: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setCancelFee(uint256)"(
      _cancelFee: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setMaxCoverAmount(
      _maxCoverAmount: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setMaxCoverAmount(uint256)"(
      _maxCoverAmount: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setMaxPeriod(
      _maxPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setMaxPeriod(uint256)"(
      _maxPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setMinPeriod(
      _minPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setMinPeriod(uint256)"(
      _minPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setPrice(
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setPrice(uint256)"(
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;
  };

  buyPolicy(
    _coverLimit: BigNumberish,
    _blocks: BigNumberish,
    _policyholder: string,
    _positionContract: string,
    overrides?: PayableOverrides
  ): Promise<ContractTransaction>;

  "buyPolicy(uint256,uint256,address,address)"(
    _coverLimit: BigNumberish,
    _blocks: BigNumberish,
    _policyholder: string,
    _positionContract: string,
    overrides?: PayableOverrides
  ): Promise<ContractTransaction>;

  cancelPolicy(
    _policyID: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "cancelPolicy(uint256)"(
    _policyID: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  extendPolicy(
    _policyID: BigNumberish,
    _blocks: BigNumberish,
    overrides?: PayableOverrides
  ): Promise<ContractTransaction>;

  "extendPolicy(uint256,uint256)"(
    _policyID: BigNumberish,
    _blocks: BigNumberish,
    overrides?: PayableOverrides
  ): Promise<ContractTransaction>;

  getPolicyExpiration(
    _policy: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "getPolicyExpiration(address)"(
    _policy: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  getPolicyLimit(
    _policy: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "getPolicyLimit(address)"(
    _policy: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  getQuote(
    _coverLimit: BigNumberish,
    _blocks: BigNumberish,
    _positionContract: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "getQuote(uint256,uint256,address)"(
    _coverLimit: BigNumberish,
    _blocks: BigNumberish,
    _positionContract: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  getTotalCovered(overrides?: CallOverrides): Promise<BigNumber>;

  "getTotalCovered()"(overrides?: CallOverrides): Promise<BigNumber>;

  getTotalPosition(
    _buyer: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "getTotalPosition(address)"(
    _buyer: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  setCancelFee(
    _cancelFee: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setCancelFee(uint256)"(
    _cancelFee: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setMaxCoverAmount(
    _maxCoverAmount: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setMaxCoverAmount(uint256)"(
    _maxCoverAmount: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setMaxPeriod(
    _maxPeriod: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setMaxPeriod(uint256)"(
    _maxPeriod: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setMinPeriod(
    _minPeriod: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setMinPeriod(uint256)"(
    _minPeriod: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setPrice(
    _price: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setPrice(uint256)"(
    _price: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  callStatic: {
    buyPolicy(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "buyPolicy(uint256,uint256,address,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    cancelPolicy(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<boolean>;

    "cancelPolicy(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<boolean>;

    extendPolicy(
      _policyID: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<boolean>;

    "extendPolicy(uint256,uint256)"(
      _policyID: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<boolean>;

    getPolicyExpiration(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyExpiration(address)"(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyLimit(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyLimit(address)"(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getQuote(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getQuote(uint256,uint256,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getTotalCovered(overrides?: CallOverrides): Promise<BigNumber>;

    "getTotalCovered()"(overrides?: CallOverrides): Promise<BigNumber>;

    getTotalPosition(
      _buyer: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getTotalPosition(address)"(
      _buyer: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    setCancelFee(
      _cancelFee: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "setCancelFee(uint256)"(
      _cancelFee: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    setMaxCoverAmount(
      _maxCoverAmount: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "setMaxCoverAmount(uint256)"(
      _maxCoverAmount: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    setMaxPeriod(
      _maxPeriod: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "setMaxPeriod(uint256)"(
      _maxPeriod: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    setMinPeriod(
      _minPeriod: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "setMinPeriod(uint256)"(
      _minPeriod: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    setPrice(_price: BigNumberish, overrides?: CallOverrides): Promise<void>;

    "setPrice(uint256)"(
      _price: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;
  };

  filters: {};

  estimateGas: {
    buyPolicy(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<BigNumber>;

    "buyPolicy(uint256,uint256,address,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<BigNumber>;

    cancelPolicy(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "cancelPolicy(uint256)"(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    extendPolicy(
      _policyID: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<BigNumber>;

    "extendPolicy(uint256,uint256)"(
      _policyID: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<BigNumber>;

    getPolicyExpiration(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyExpiration(address)"(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getPolicyLimit(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getPolicyLimit(address)"(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getQuote(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getQuote(uint256,uint256,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    getTotalCovered(overrides?: CallOverrides): Promise<BigNumber>;

    "getTotalCovered()"(overrides?: CallOverrides): Promise<BigNumber>;

    getTotalPosition(
      _buyer: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getTotalPosition(address)"(
      _buyer: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    setCancelFee(
      _cancelFee: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setCancelFee(uint256)"(
      _cancelFee: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setMaxCoverAmount(
      _maxCoverAmount: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setMaxCoverAmount(uint256)"(
      _maxCoverAmount: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setMaxPeriod(
      _maxPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setMaxPeriod(uint256)"(
      _maxPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setMinPeriod(
      _minPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setMinPeriod(uint256)"(
      _minPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setPrice(_price: BigNumberish, overrides?: Overrides): Promise<BigNumber>;

    "setPrice(uint256)"(
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    buyPolicy(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<PopulatedTransaction>;

    "buyPolicy(uint256,uint256,address,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _policyholder: string,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<PopulatedTransaction>;

    cancelPolicy(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "cancelPolicy(uint256)"(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    extendPolicy(
      _policyID: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<PopulatedTransaction>;

    "extendPolicy(uint256,uint256)"(
      _policyID: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<PopulatedTransaction>;

    getPolicyExpiration(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getPolicyExpiration(address)"(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getPolicyLimit(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getPolicyLimit(address)"(
      _policy: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getQuote(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getQuote(uint256,uint256,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getTotalCovered(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "getTotalCovered()"(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getTotalPosition(
      _buyer: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getTotalPosition(address)"(
      _buyer: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    setCancelFee(
      _cancelFee: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setCancelFee(uint256)"(
      _cancelFee: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setMaxCoverAmount(
      _maxCoverAmount: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setMaxCoverAmount(uint256)"(
      _maxCoverAmount: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setMaxPeriod(
      _maxPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setMaxPeriod(uint256)"(
      _maxPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setMinPeriod(
      _minPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setMinPeriod(uint256)"(
      _minPeriod: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setPrice(
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setPrice(uint256)"(
      _price: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;
  };
}

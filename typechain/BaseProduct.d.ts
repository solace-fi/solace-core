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

interface BaseProductInterface extends ethers.utils.Interface {
  functions: {
    "activeCoverAmount()": FunctionFragment;
    "activePolicyIDs(uint256)": FunctionFragment;
    "appraisePosition(address,address)": FunctionFragment;
    "buyPolicy(uint256,uint256,address)": FunctionFragment;
    "cancelFee()": FunctionFragment;
    "claimsAdjuster()": FunctionFragment;
    "coveredPlatform()": FunctionFragment;
    "getPolicyExpiration(address)": FunctionFragment;
    "getPolicyLimit(address)": FunctionFragment;
    "getQuote(uint256,uint256,address)": FunctionFragment;
    "getTotalCovered()": FunctionFragment;
    "getTotalPosition(address)": FunctionFragment;
    "governance()": FunctionFragment;
    "maxCoverAmount()": FunctionFragment;
    "maxPeriod()": FunctionFragment;
    "minPeriod()": FunctionFragment;
    "policyManager()": FunctionFragment;
    "price()": FunctionFragment;
    "productPolicyCount()": FunctionFragment;
    "setCancelFee(uint256)": FunctionFragment;
    "setClaimsAdjuster(address)": FunctionFragment;
    "setGovernance(address)": FunctionFragment;
    "setMaxCoverAmount(uint256)": FunctionFragment;
    "setMaxPeriod(uint256)": FunctionFragment;
    "setMinPeriod(uint256)": FunctionFragment;
    "setPrice(uint256)": FunctionFragment;
    "updateActivePolicies()": FunctionFragment;
  };

  encodeFunctionData(
    functionFragment: "activeCoverAmount",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "activePolicyIDs",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "appraisePosition",
    values: [string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "buyPolicy",
    values: [BigNumberish, BigNumberish, string]
  ): string;
  encodeFunctionData(functionFragment: "cancelFee", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "claimsAdjuster",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "coveredPlatform",
    values?: undefined
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
    functionFragment: "governance",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "maxCoverAmount",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "maxPeriod", values?: undefined): string;
  encodeFunctionData(functionFragment: "minPeriod", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "policyManager",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "price", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "productPolicyCount",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "setCancelFee",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setClaimsAdjuster",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "setGovernance",
    values: [string]
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
  encodeFunctionData(
    functionFragment: "updateActivePolicies",
    values?: undefined
  ): string;

  decodeFunctionResult(
    functionFragment: "activeCoverAmount",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "activePolicyIDs",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "appraisePosition",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "buyPolicy", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "cancelFee", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "claimsAdjuster",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "coveredPlatform",
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
  decodeFunctionResult(functionFragment: "governance", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "maxCoverAmount",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "maxPeriod", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "minPeriod", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "policyManager",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "price", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "productPolicyCount",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setCancelFee",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setClaimsAdjuster",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setGovernance",
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
  decodeFunctionResult(
    functionFragment: "updateActivePolicies",
    data: BytesLike
  ): Result;

  events: {
    "PolicyCreated(uint256)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "PolicyCreated"): EventFragment;
}

export class BaseProduct extends Contract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  on(event: EventFilter | string, listener: Listener): this;
  once(event: EventFilter | string, listener: Listener): this;
  addListener(eventName: EventFilter | string, listener: Listener): this;
  removeAllListeners(eventName: EventFilter | string): this;
  removeListener(eventName: any, listener: Listener): this;

  interface: BaseProductInterface;

  functions: {
    activeCoverAmount(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "activeCoverAmount()"(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    activePolicyIDs(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "activePolicyIDs(uint256)"(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    appraisePosition(
      _buyer: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<{
      positionAmount: BigNumber;
      0: BigNumber;
    }>;

    "appraisePosition(address,address)"(
      _buyer: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<{
      positionAmount: BigNumber;
      0: BigNumber;
    }>;

    buyPolicy(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<ContractTransaction>;

    "buyPolicy(uint256,uint256,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<ContractTransaction>;

    cancelFee(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "cancelFee()"(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    claimsAdjuster(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "claimsAdjuster()"(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    coveredPlatform(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "coveredPlatform()"(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

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

    governance(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "governance()"(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    maxCoverAmount(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "maxCoverAmount()"(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    maxPeriod(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "maxPeriod()"(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    minPeriod(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "minPeriod()"(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    policyManager(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "policyManager()"(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    price(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "price()"(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    productPolicyCount(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "productPolicyCount()"(
      overrides?: CallOverrides
    ): Promise<{
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

    setClaimsAdjuster(
      _claimsAdjuster: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setClaimsAdjuster(address)"(
      _claimsAdjuster: string,
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

    updateActivePolicies(overrides?: Overrides): Promise<ContractTransaction>;

    "updateActivePolicies()"(
      overrides?: Overrides
    ): Promise<ContractTransaction>;
  };

  activeCoverAmount(overrides?: CallOverrides): Promise<BigNumber>;

  "activeCoverAmount()"(overrides?: CallOverrides): Promise<BigNumber>;

  activePolicyIDs(
    arg0: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "activePolicyIDs(uint256)"(
    arg0: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  appraisePosition(
    _buyer: string,
    _positionContract: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "appraisePosition(address,address)"(
    _buyer: string,
    _positionContract: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  buyPolicy(
    _coverLimit: BigNumberish,
    _blocks: BigNumberish,
    _positionContract: string,
    overrides?: PayableOverrides
  ): Promise<ContractTransaction>;

  "buyPolicy(uint256,uint256,address)"(
    _coverLimit: BigNumberish,
    _blocks: BigNumberish,
    _positionContract: string,
    overrides?: PayableOverrides
  ): Promise<ContractTransaction>;

  cancelFee(overrides?: CallOverrides): Promise<BigNumber>;

  "cancelFee()"(overrides?: CallOverrides): Promise<BigNumber>;

  claimsAdjuster(overrides?: CallOverrides): Promise<string>;

  "claimsAdjuster()"(overrides?: CallOverrides): Promise<string>;

  coveredPlatform(overrides?: CallOverrides): Promise<string>;

  "coveredPlatform()"(overrides?: CallOverrides): Promise<string>;

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

  governance(overrides?: CallOverrides): Promise<string>;

  "governance()"(overrides?: CallOverrides): Promise<string>;

  maxCoverAmount(overrides?: CallOverrides): Promise<BigNumber>;

  "maxCoverAmount()"(overrides?: CallOverrides): Promise<BigNumber>;

  maxPeriod(overrides?: CallOverrides): Promise<BigNumber>;

  "maxPeriod()"(overrides?: CallOverrides): Promise<BigNumber>;

  minPeriod(overrides?: CallOverrides): Promise<BigNumber>;

  "minPeriod()"(overrides?: CallOverrides): Promise<BigNumber>;

  policyManager(overrides?: CallOverrides): Promise<string>;

  "policyManager()"(overrides?: CallOverrides): Promise<string>;

  price(overrides?: CallOverrides): Promise<BigNumber>;

  "price()"(overrides?: CallOverrides): Promise<BigNumber>;

  productPolicyCount(overrides?: CallOverrides): Promise<BigNumber>;

  "productPolicyCount()"(overrides?: CallOverrides): Promise<BigNumber>;

  setCancelFee(
    _cancelFee: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setCancelFee(uint256)"(
    _cancelFee: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setClaimsAdjuster(
    _claimsAdjuster: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setClaimsAdjuster(address)"(
    _claimsAdjuster: string,
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

  updateActivePolicies(overrides?: Overrides): Promise<ContractTransaction>;

  "updateActivePolicies()"(overrides?: Overrides): Promise<ContractTransaction>;

  callStatic: {
    activeCoverAmount(overrides?: CallOverrides): Promise<BigNumber>;

    "activeCoverAmount()"(overrides?: CallOverrides): Promise<BigNumber>;

    activePolicyIDs(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "activePolicyIDs(uint256)"(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    appraisePosition(
      _buyer: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "appraisePosition(address,address)"(
      _buyer: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    buyPolicy(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "buyPolicy(uint256,uint256,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    cancelFee(overrides?: CallOverrides): Promise<BigNumber>;

    "cancelFee()"(overrides?: CallOverrides): Promise<BigNumber>;

    claimsAdjuster(overrides?: CallOverrides): Promise<string>;

    "claimsAdjuster()"(overrides?: CallOverrides): Promise<string>;

    coveredPlatform(overrides?: CallOverrides): Promise<string>;

    "coveredPlatform()"(overrides?: CallOverrides): Promise<string>;

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

    governance(overrides?: CallOverrides): Promise<string>;

    "governance()"(overrides?: CallOverrides): Promise<string>;

    maxCoverAmount(overrides?: CallOverrides): Promise<BigNumber>;

    "maxCoverAmount()"(overrides?: CallOverrides): Promise<BigNumber>;

    maxPeriod(overrides?: CallOverrides): Promise<BigNumber>;

    "maxPeriod()"(overrides?: CallOverrides): Promise<BigNumber>;

    minPeriod(overrides?: CallOverrides): Promise<BigNumber>;

    "minPeriod()"(overrides?: CallOverrides): Promise<BigNumber>;

    policyManager(overrides?: CallOverrides): Promise<string>;

    "policyManager()"(overrides?: CallOverrides): Promise<string>;

    price(overrides?: CallOverrides): Promise<BigNumber>;

    "price()"(overrides?: CallOverrides): Promise<BigNumber>;

    productPolicyCount(overrides?: CallOverrides): Promise<BigNumber>;

    "productPolicyCount()"(overrides?: CallOverrides): Promise<BigNumber>;

    setCancelFee(
      _cancelFee: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "setCancelFee(uint256)"(
      _cancelFee: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    setClaimsAdjuster(
      _claimsAdjuster: string,
      overrides?: CallOverrides
    ): Promise<void>;

    "setClaimsAdjuster(address)"(
      _claimsAdjuster: string,
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

    updateActivePolicies(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
      1: BigNumber;
    }>;

    "updateActivePolicies()"(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
      1: BigNumber;
    }>;
  };

  filters: {
    PolicyCreated(policyID: null): EventFilter;
  };

  estimateGas: {
    activeCoverAmount(overrides?: CallOverrides): Promise<BigNumber>;

    "activeCoverAmount()"(overrides?: CallOverrides): Promise<BigNumber>;

    activePolicyIDs(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "activePolicyIDs(uint256)"(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    appraisePosition(
      _buyer: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "appraisePosition(address,address)"(
      _buyer: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    buyPolicy(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<BigNumber>;

    "buyPolicy(uint256,uint256,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<BigNumber>;

    cancelFee(overrides?: CallOverrides): Promise<BigNumber>;

    "cancelFee()"(overrides?: CallOverrides): Promise<BigNumber>;

    claimsAdjuster(overrides?: CallOverrides): Promise<BigNumber>;

    "claimsAdjuster()"(overrides?: CallOverrides): Promise<BigNumber>;

    coveredPlatform(overrides?: CallOverrides): Promise<BigNumber>;

    "coveredPlatform()"(overrides?: CallOverrides): Promise<BigNumber>;

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

    governance(overrides?: CallOverrides): Promise<BigNumber>;

    "governance()"(overrides?: CallOverrides): Promise<BigNumber>;

    maxCoverAmount(overrides?: CallOverrides): Promise<BigNumber>;

    "maxCoverAmount()"(overrides?: CallOverrides): Promise<BigNumber>;

    maxPeriod(overrides?: CallOverrides): Promise<BigNumber>;

    "maxPeriod()"(overrides?: CallOverrides): Promise<BigNumber>;

    minPeriod(overrides?: CallOverrides): Promise<BigNumber>;

    "minPeriod()"(overrides?: CallOverrides): Promise<BigNumber>;

    policyManager(overrides?: CallOverrides): Promise<BigNumber>;

    "policyManager()"(overrides?: CallOverrides): Promise<BigNumber>;

    price(overrides?: CallOverrides): Promise<BigNumber>;

    "price()"(overrides?: CallOverrides): Promise<BigNumber>;

    productPolicyCount(overrides?: CallOverrides): Promise<BigNumber>;

    "productPolicyCount()"(overrides?: CallOverrides): Promise<BigNumber>;

    setCancelFee(
      _cancelFee: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setCancelFee(uint256)"(
      _cancelFee: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setClaimsAdjuster(
      _claimsAdjuster: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setClaimsAdjuster(address)"(
      _claimsAdjuster: string,
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

    updateActivePolicies(overrides?: Overrides): Promise<BigNumber>;

    "updateActivePolicies()"(overrides?: Overrides): Promise<BigNumber>;
  };

  populateTransaction: {
    activeCoverAmount(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "activeCoverAmount()"(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    activePolicyIDs(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "activePolicyIDs(uint256)"(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    appraisePosition(
      _buyer: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "appraisePosition(address,address)"(
      _buyer: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    buyPolicy(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<PopulatedTransaction>;

    "buyPolicy(uint256,uint256,address)"(
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      _positionContract: string,
      overrides?: PayableOverrides
    ): Promise<PopulatedTransaction>;

    cancelFee(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "cancelFee()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    claimsAdjuster(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "claimsAdjuster()"(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    coveredPlatform(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "coveredPlatform()"(
      overrides?: CallOverrides
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

    governance(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "governance()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    maxCoverAmount(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "maxCoverAmount()"(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    maxPeriod(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "maxPeriod()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    minPeriod(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "minPeriod()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    policyManager(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "policyManager()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    price(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "price()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    productPolicyCount(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "productPolicyCount()"(
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

    setClaimsAdjuster(
      _claimsAdjuster: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setClaimsAdjuster(address)"(
      _claimsAdjuster: string,
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

    updateActivePolicies(overrides?: Overrides): Promise<PopulatedTransaction>;

    "updateActivePolicies()"(
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;
  };
}

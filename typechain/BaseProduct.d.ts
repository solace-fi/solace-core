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
    "buyPolicy(address,address,uint256,uint256)": FunctionFragment;
    "cancelFee()": FunctionFragment;
    "cancelPolicy(uint256)": FunctionFragment;
    "claimsAdjuster()": FunctionFragment;
    "coveredPlatform()": FunctionFragment;
    "extendPolicy(uint256,uint256)": FunctionFragment;
    "getQuote(address,address,uint256,uint256)": FunctionFragment;
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
    "treasury()": FunctionFragment;
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
    values: [string, string, BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(functionFragment: "cancelFee", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "cancelPolicy",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "claimsAdjuster",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "coveredPlatform",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "extendPolicy",
    values: [BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "getQuote",
    values: [string, string, BigNumberish, BigNumberish]
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
  encodeFunctionData(functionFragment: "treasury", values?: undefined): string;
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
    functionFragment: "cancelPolicy",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "claimsAdjuster",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "coveredPlatform",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "extendPolicy",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "getQuote", data: BytesLike): Result;
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
  decodeFunctionResult(functionFragment: "treasury", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "updateActivePolicies",
    data: BytesLike
  ): Result;

  events: {
    "PolicyCanceled(uint256)": EventFragment;
    "PolicyCreated(uint256)": EventFragment;
    "PolicyExtended(uint256)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "PolicyCanceled"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "PolicyCreated"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "PolicyExtended"): EventFragment;
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
      _policyholder: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<{
      positionAmount: BigNumber;
      0: BigNumber;
    }>;

    "appraisePosition(address,address)"(
      _policyholder: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<{
      positionAmount: BigNumber;
      0: BigNumber;
    }>;

    buyPolicy(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<ContractTransaction>;

    "buyPolicy(address,address,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
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

    cancelPolicy(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "cancelPolicy(uint256)"(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

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

    getQuote(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "getQuote(address,address,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
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

    treasury(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "treasury()"(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

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
    _policyholder: string,
    _positionContract: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "appraisePosition(address,address)"(
    _policyholder: string,
    _positionContract: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  buyPolicy(
    _policyholder: string,
    _positionContract: string,
    _coverLimit: BigNumberish,
    _blocks: BigNumberish,
    overrides?: PayableOverrides
  ): Promise<ContractTransaction>;

  "buyPolicy(address,address,uint256,uint256)"(
    _policyholder: string,
    _positionContract: string,
    _coverLimit: BigNumberish,
    _blocks: BigNumberish,
    overrides?: PayableOverrides
  ): Promise<ContractTransaction>;

  cancelFee(overrides?: CallOverrides): Promise<BigNumber>;

  "cancelFee()"(overrides?: CallOverrides): Promise<BigNumber>;

  cancelPolicy(
    _policyID: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "cancelPolicy(uint256)"(
    _policyID: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  claimsAdjuster(overrides?: CallOverrides): Promise<string>;

  "claimsAdjuster()"(overrides?: CallOverrides): Promise<string>;

  coveredPlatform(overrides?: CallOverrides): Promise<string>;

  "coveredPlatform()"(overrides?: CallOverrides): Promise<string>;

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

  getQuote(
    _policyholder: string,
    _positionContract: string,
    _coverLimit: BigNumberish,
    _blocks: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "getQuote(address,address,uint256,uint256)"(
    _policyholder: string,
    _positionContract: string,
    _coverLimit: BigNumberish,
    _blocks: BigNumberish,
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

  treasury(overrides?: CallOverrides): Promise<string>;

  "treasury()"(overrides?: CallOverrides): Promise<string>;

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
      _policyholder: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "appraisePosition(address,address)"(
      _policyholder: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    buyPolicy(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "buyPolicy(address,address,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    cancelFee(overrides?: CallOverrides): Promise<BigNumber>;

    "cancelFee()"(overrides?: CallOverrides): Promise<BigNumber>;

    cancelPolicy(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "cancelPolicy(uint256)"(
      _policyID: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    claimsAdjuster(overrides?: CallOverrides): Promise<string>;

    "claimsAdjuster()"(overrides?: CallOverrides): Promise<string>;

    coveredPlatform(overrides?: CallOverrides): Promise<string>;

    "coveredPlatform()"(overrides?: CallOverrides): Promise<string>;

    extendPolicy(
      _policyID: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "extendPolicy(uint256,uint256)"(
      _policyID: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    getQuote(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getQuote(address,address,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
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

    treasury(overrides?: CallOverrides): Promise<string>;

    "treasury()"(overrides?: CallOverrides): Promise<string>;

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
    PolicyCanceled(policyID: null): EventFilter;

    PolicyCreated(policyID: null): EventFilter;

    PolicyExtended(policyID: null): EventFilter;
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
      _policyholder: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "appraisePosition(address,address)"(
      _policyholder: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    buyPolicy(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<BigNumber>;

    "buyPolicy(address,address,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<BigNumber>;

    cancelFee(overrides?: CallOverrides): Promise<BigNumber>;

    "cancelFee()"(overrides?: CallOverrides): Promise<BigNumber>;

    cancelPolicy(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "cancelPolicy(uint256)"(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    claimsAdjuster(overrides?: CallOverrides): Promise<BigNumber>;

    "claimsAdjuster()"(overrides?: CallOverrides): Promise<BigNumber>;

    coveredPlatform(overrides?: CallOverrides): Promise<BigNumber>;

    "coveredPlatform()"(overrides?: CallOverrides): Promise<BigNumber>;

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

    getQuote(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getQuote(address,address,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
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

    treasury(overrides?: CallOverrides): Promise<BigNumber>;

    "treasury()"(overrides?: CallOverrides): Promise<BigNumber>;

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
      _policyholder: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "appraisePosition(address,address)"(
      _policyholder: string,
      _positionContract: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    buyPolicy(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<PopulatedTransaction>;

    "buyPolicy(address,address,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: PayableOverrides
    ): Promise<PopulatedTransaction>;

    cancelFee(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "cancelFee()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    cancelPolicy(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "cancelPolicy(uint256)"(
      _policyID: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    claimsAdjuster(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "claimsAdjuster()"(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    coveredPlatform(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "coveredPlatform()"(
      overrides?: CallOverrides
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

    getQuote(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getQuote(address,address,uint256,uint256)"(
      _policyholder: string,
      _positionContract: string,
      _coverLimit: BigNumberish,
      _blocks: BigNumberish,
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

    treasury(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "treasury()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    updateActivePolicies(overrides?: Overrides): Promise<PopulatedTransaction>;

    "updateActivePolicies()"(
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;
  };
}

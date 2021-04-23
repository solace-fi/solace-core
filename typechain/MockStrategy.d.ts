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

interface MockStrategyInterface extends ethers.utils.Interface {
  functions: {
    "delegatedAssets()": FunctionFragment;
    "emergencyExit()": FunctionFragment;
    "estimatedTotalAssets()": FunctionFragment;
    "governance()": FunctionFragment;
    "harvest()": FunctionFragment;
    "isActive()": FunctionFragment;
    "protectedToken()": FunctionFragment;
    "setEmergencyExit()": FunctionFragment;
    "setGovernance(address)": FunctionFragment;
    "setVault(address)": FunctionFragment;
    "vault()": FunctionFragment;
    "want()": FunctionFragment;
    "withdraw(uint256)": FunctionFragment;
  };

  encodeFunctionData(
    functionFragment: "delegatedAssets",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "emergencyExit",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "estimatedTotalAssets",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "governance",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "harvest", values?: undefined): string;
  encodeFunctionData(functionFragment: "isActive", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "protectedToken",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "setEmergencyExit",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "setGovernance",
    values: [string]
  ): string;
  encodeFunctionData(functionFragment: "setVault", values: [string]): string;
  encodeFunctionData(functionFragment: "vault", values?: undefined): string;
  encodeFunctionData(functionFragment: "want", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "withdraw",
    values: [BigNumberish]
  ): string;

  decodeFunctionResult(
    functionFragment: "delegatedAssets",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "emergencyExit",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "estimatedTotalAssets",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "governance", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "harvest", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "isActive", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "protectedToken",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setEmergencyExit",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setGovernance",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "setVault", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "vault", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "want", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "withdraw", data: BytesLike): Result;

  events: {
    "EmergencyExitEnabled()": EventFragment;
    "Harvested(uint256,uint256,uint256,uint256)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "EmergencyExitEnabled"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "Harvested"): EventFragment;
}

export class MockStrategy extends Contract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  on(event: EventFilter | string, listener: Listener): this;
  once(event: EventFilter | string, listener: Listener): this;
  addListener(eventName: EventFilter | string, listener: Listener): this;
  removeAllListeners(eventName: EventFilter | string): this;
  removeListener(eventName: any, listener: Listener): this;

  interface: MockStrategyInterface;

  functions: {
    delegatedAssets(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "delegatedAssets()"(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    emergencyExit(
      overrides?: CallOverrides
    ): Promise<{
      0: boolean;
    }>;

    "emergencyExit()"(
      overrides?: CallOverrides
    ): Promise<{
      0: boolean;
    }>;

    estimatedTotalAssets(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "estimatedTotalAssets()"(
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

    harvest(overrides?: Overrides): Promise<ContractTransaction>;

    "harvest()"(overrides?: Overrides): Promise<ContractTransaction>;

    isActive(
      overrides?: CallOverrides
    ): Promise<{
      0: boolean;
    }>;

    "isActive()"(
      overrides?: CallOverrides
    ): Promise<{
      0: boolean;
    }>;

    protectedToken(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "protectedToken()"(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    setEmergencyExit(overrides?: Overrides): Promise<ContractTransaction>;

    "setEmergencyExit()"(overrides?: Overrides): Promise<ContractTransaction>;

    setGovernance(
      _governance: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setGovernance(address)"(
      _governance: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setVault(
      _vault: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setVault(address)"(
      _vault: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    vault(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "vault()"(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    want(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "want()"(
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    withdraw(
      _amountNeeded: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "withdraw(uint256)"(
      _amountNeeded: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;
  };

  delegatedAssets(overrides?: CallOverrides): Promise<BigNumber>;

  "delegatedAssets()"(overrides?: CallOverrides): Promise<BigNumber>;

  emergencyExit(overrides?: CallOverrides): Promise<boolean>;

  "emergencyExit()"(overrides?: CallOverrides): Promise<boolean>;

  estimatedTotalAssets(overrides?: CallOverrides): Promise<BigNumber>;

  "estimatedTotalAssets()"(overrides?: CallOverrides): Promise<BigNumber>;

  governance(overrides?: CallOverrides): Promise<string>;

  "governance()"(overrides?: CallOverrides): Promise<string>;

  harvest(overrides?: Overrides): Promise<ContractTransaction>;

  "harvest()"(overrides?: Overrides): Promise<ContractTransaction>;

  isActive(overrides?: CallOverrides): Promise<boolean>;

  "isActive()"(overrides?: CallOverrides): Promise<boolean>;

  protectedToken(overrides?: CallOverrides): Promise<string>;

  "protectedToken()"(overrides?: CallOverrides): Promise<string>;

  setEmergencyExit(overrides?: Overrides): Promise<ContractTransaction>;

  "setEmergencyExit()"(overrides?: Overrides): Promise<ContractTransaction>;

  setGovernance(
    _governance: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setGovernance(address)"(
    _governance: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setVault(_vault: string, overrides?: Overrides): Promise<ContractTransaction>;

  "setVault(address)"(
    _vault: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  vault(overrides?: CallOverrides): Promise<string>;

  "vault()"(overrides?: CallOverrides): Promise<string>;

  want(overrides?: CallOverrides): Promise<string>;

  "want()"(overrides?: CallOverrides): Promise<string>;

  withdraw(
    _amountNeeded: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "withdraw(uint256)"(
    _amountNeeded: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  callStatic: {
    delegatedAssets(overrides?: CallOverrides): Promise<BigNumber>;

    "delegatedAssets()"(overrides?: CallOverrides): Promise<BigNumber>;

    emergencyExit(overrides?: CallOverrides): Promise<boolean>;

    "emergencyExit()"(overrides?: CallOverrides): Promise<boolean>;

    estimatedTotalAssets(overrides?: CallOverrides): Promise<BigNumber>;

    "estimatedTotalAssets()"(overrides?: CallOverrides): Promise<BigNumber>;

    governance(overrides?: CallOverrides): Promise<string>;

    "governance()"(overrides?: CallOverrides): Promise<string>;

    harvest(overrides?: CallOverrides): Promise<void>;

    "harvest()"(overrides?: CallOverrides): Promise<void>;

    isActive(overrides?: CallOverrides): Promise<boolean>;

    "isActive()"(overrides?: CallOverrides): Promise<boolean>;

    protectedToken(overrides?: CallOverrides): Promise<string>;

    "protectedToken()"(overrides?: CallOverrides): Promise<string>;

    setEmergencyExit(overrides?: CallOverrides): Promise<void>;

    "setEmergencyExit()"(overrides?: CallOverrides): Promise<void>;

    setGovernance(
      _governance: string,
      overrides?: CallOverrides
    ): Promise<void>;

    "setGovernance(address)"(
      _governance: string,
      overrides?: CallOverrides
    ): Promise<void>;

    setVault(_vault: string, overrides?: CallOverrides): Promise<void>;

    "setVault(address)"(
      _vault: string,
      overrides?: CallOverrides
    ): Promise<void>;

    vault(overrides?: CallOverrides): Promise<string>;

    "vault()"(overrides?: CallOverrides): Promise<string>;

    want(overrides?: CallOverrides): Promise<string>;

    "want()"(overrides?: CallOverrides): Promise<string>;

    withdraw(
      _amountNeeded: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "withdraw(uint256)"(
      _amountNeeded: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;
  };

  filters: {
    EmergencyExitEnabled(): EventFilter;

    Harvested(
      profit: null,
      loss: null,
      debtPayment: null,
      debtOutstanding: null
    ): EventFilter;
  };

  estimateGas: {
    delegatedAssets(overrides?: CallOverrides): Promise<BigNumber>;

    "delegatedAssets()"(overrides?: CallOverrides): Promise<BigNumber>;

    emergencyExit(overrides?: CallOverrides): Promise<BigNumber>;

    "emergencyExit()"(overrides?: CallOverrides): Promise<BigNumber>;

    estimatedTotalAssets(overrides?: CallOverrides): Promise<BigNumber>;

    "estimatedTotalAssets()"(overrides?: CallOverrides): Promise<BigNumber>;

    governance(overrides?: CallOverrides): Promise<BigNumber>;

    "governance()"(overrides?: CallOverrides): Promise<BigNumber>;

    harvest(overrides?: Overrides): Promise<BigNumber>;

    "harvest()"(overrides?: Overrides): Promise<BigNumber>;

    isActive(overrides?: CallOverrides): Promise<BigNumber>;

    "isActive()"(overrides?: CallOverrides): Promise<BigNumber>;

    protectedToken(overrides?: CallOverrides): Promise<BigNumber>;

    "protectedToken()"(overrides?: CallOverrides): Promise<BigNumber>;

    setEmergencyExit(overrides?: Overrides): Promise<BigNumber>;

    "setEmergencyExit()"(overrides?: Overrides): Promise<BigNumber>;

    setGovernance(
      _governance: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setGovernance(address)"(
      _governance: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setVault(_vault: string, overrides?: Overrides): Promise<BigNumber>;

    "setVault(address)"(
      _vault: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    vault(overrides?: CallOverrides): Promise<BigNumber>;

    "vault()"(overrides?: CallOverrides): Promise<BigNumber>;

    want(overrides?: CallOverrides): Promise<BigNumber>;

    "want()"(overrides?: CallOverrides): Promise<BigNumber>;

    withdraw(
      _amountNeeded: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "withdraw(uint256)"(
      _amountNeeded: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    delegatedAssets(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "delegatedAssets()"(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    emergencyExit(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "emergencyExit()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    estimatedTotalAssets(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "estimatedTotalAssets()"(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    governance(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "governance()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    harvest(overrides?: Overrides): Promise<PopulatedTransaction>;

    "harvest()"(overrides?: Overrides): Promise<PopulatedTransaction>;

    isActive(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "isActive()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    protectedToken(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "protectedToken()"(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    setEmergencyExit(overrides?: Overrides): Promise<PopulatedTransaction>;

    "setEmergencyExit()"(overrides?: Overrides): Promise<PopulatedTransaction>;

    setGovernance(
      _governance: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setGovernance(address)"(
      _governance: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setVault(
      _vault: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setVault(address)"(
      _vault: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    vault(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "vault()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    want(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "want()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    withdraw(
      _amountNeeded: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "withdraw(uint256)"(
      _amountNeeded: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;
  };
}
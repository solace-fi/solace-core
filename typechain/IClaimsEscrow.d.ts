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

interface IClaimsEscrowInterface extends ethers.utils.Interface {
  functions: {
    "adjustClaim(uint256,uint256)": FunctionFragment;
    "receiveClaim(address)": FunctionFragment;
    "sweep(address,uint256,address)": FunctionFragment;
    "withdrawClaimsPayout(uint256)": FunctionFragment;
  };

  encodeFunctionData(
    functionFragment: "adjustClaim",
    values: [BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "receiveClaim",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "sweep",
    values: [string, BigNumberish, string]
  ): string;
  encodeFunctionData(
    functionFragment: "withdrawClaimsPayout",
    values: [BigNumberish]
  ): string;

  decodeFunctionResult(
    functionFragment: "adjustClaim",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "receiveClaim",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "sweep", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "withdrawClaimsPayout",
    data: BytesLike
  ): Result;

  events: {};
}

export class IClaimsEscrow extends Contract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  on(event: EventFilter | string, listener: Listener): this;
  once(event: EventFilter | string, listener: Listener): this;
  addListener(eventName: EventFilter | string, listener: Listener): this;
  removeAllListeners(eventName: EventFilter | string): this;
  removeListener(eventName: any, listener: Listener): this;

  interface: IClaimsEscrowInterface;

  functions: {
    adjustClaim(
      claimId: BigNumberish,
      value: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "adjustClaim(uint256,uint256)"(
      claimId: BigNumberish,
      value: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    receiveClaim(
      _claimant: string,
      overrides?: PayableOverrides
    ): Promise<ContractTransaction>;

    "receiveClaim(address)"(
      _claimant: string,
      overrides?: PayableOverrides
    ): Promise<ContractTransaction>;

    sweep(
      token: string,
      amount: BigNumberish,
      dst: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "sweep(address,uint256,address)"(
      token: string,
      amount: BigNumberish,
      dst: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    withdrawClaimsPayout(
      claimId: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "withdrawClaimsPayout(uint256)"(
      claimId: BigNumberish,
      overrides?: Overrides
    ): Promise<ContractTransaction>;
  };

  adjustClaim(
    claimId: BigNumberish,
    value: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "adjustClaim(uint256,uint256)"(
    claimId: BigNumberish,
    value: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  receiveClaim(
    _claimant: string,
    overrides?: PayableOverrides
  ): Promise<ContractTransaction>;

  "receiveClaim(address)"(
    _claimant: string,
    overrides?: PayableOverrides
  ): Promise<ContractTransaction>;

  sweep(
    token: string,
    amount: BigNumberish,
    dst: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "sweep(address,uint256,address)"(
    token: string,
    amount: BigNumberish,
    dst: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  withdrawClaimsPayout(
    claimId: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "withdrawClaimsPayout(uint256)"(
    claimId: BigNumberish,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  callStatic: {
    adjustClaim(
      claimId: BigNumberish,
      value: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "adjustClaim(uint256,uint256)"(
      claimId: BigNumberish,
      value: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    receiveClaim(
      _claimant: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "receiveClaim(address)"(
      _claimant: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    sweep(
      token: string,
      amount: BigNumberish,
      dst: string,
      overrides?: CallOverrides
    ): Promise<void>;

    "sweep(address,uint256,address)"(
      token: string,
      amount: BigNumberish,
      dst: string,
      overrides?: CallOverrides
    ): Promise<void>;

    withdrawClaimsPayout(
      claimId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    "withdrawClaimsPayout(uint256)"(
      claimId: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;
  };

  filters: {};

  estimateGas: {
    adjustClaim(
      claimId: BigNumberish,
      value: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "adjustClaim(uint256,uint256)"(
      claimId: BigNumberish,
      value: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    receiveClaim(
      _claimant: string,
      overrides?: PayableOverrides
    ): Promise<BigNumber>;

    "receiveClaim(address)"(
      _claimant: string,
      overrides?: PayableOverrides
    ): Promise<BigNumber>;

    sweep(
      token: string,
      amount: BigNumberish,
      dst: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "sweep(address,uint256,address)"(
      token: string,
      amount: BigNumberish,
      dst: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    withdrawClaimsPayout(
      claimId: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "withdrawClaimsPayout(uint256)"(
      claimId: BigNumberish,
      overrides?: Overrides
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    adjustClaim(
      claimId: BigNumberish,
      value: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "adjustClaim(uint256,uint256)"(
      claimId: BigNumberish,
      value: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    receiveClaim(
      _claimant: string,
      overrides?: PayableOverrides
    ): Promise<PopulatedTransaction>;

    "receiveClaim(address)"(
      _claimant: string,
      overrides?: PayableOverrides
    ): Promise<PopulatedTransaction>;

    sweep(
      token: string,
      amount: BigNumberish,
      dst: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "sweep(address,uint256,address)"(
      token: string,
      amount: BigNumberish,
      dst: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    withdrawClaimsPayout(
      claimId: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "withdrawClaimsPayout(uint256)"(
      claimId: BigNumberish,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;
  };
}

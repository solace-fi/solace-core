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
  CallOverrides,
} from "@ethersproject/contracts";
import { BytesLike } from "@ethersproject/bytes";
import { Listener, Provider } from "@ethersproject/providers";
import { FunctionFragment, EventFragment, Result } from "@ethersproject/abi";

interface ICurvePoolInterface extends ethers.utils.Interface {
  functions: {
    "calc_withdraw_one_coin(uint256,int128)": FunctionFragment;
    "coins(uint256)": FunctionFragment;
  };

  encodeFunctionData(
    functionFragment: "calc_withdraw_one_coin",
    values: [BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(functionFragment: "coins", values: [BigNumberish]): string;

  decodeFunctionResult(
    functionFragment: "calc_withdraw_one_coin",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "coins", data: BytesLike): Result;

  events: {};
}

export class ICurvePool extends Contract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  on(event: EventFilter | string, listener: Listener): this;
  once(event: EventFilter | string, listener: Listener): this;
  addListener(eventName: EventFilter | string, listener: Listener): this;
  removeAllListeners(eventName: EventFilter | string): this;
  removeListener(eventName: any, listener: Listener): this;

  interface: ICurvePoolInterface;

  functions: {
    calc_withdraw_one_coin(
      token_amount: BigNumberish,
      i: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "calc_withdraw_one_coin(uint256,int128)"(
      token_amount: BigNumberish,
      i: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    coins(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "coins(uint256)"(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;
  };

  calc_withdraw_one_coin(
    token_amount: BigNumberish,
    i: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  "calc_withdraw_one_coin(uint256,int128)"(
    token_amount: BigNumberish,
    i: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  coins(arg0: BigNumberish, overrides?: CallOverrides): Promise<string>;

  "coins(uint256)"(
    arg0: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  callStatic: {
    calc_withdraw_one_coin(
      token_amount: BigNumberish,
      i: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "calc_withdraw_one_coin(uint256,int128)"(
      token_amount: BigNumberish,
      i: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    coins(arg0: BigNumberish, overrides?: CallOverrides): Promise<string>;

    "coins(uint256)"(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;
  };

  filters: {};

  estimateGas: {
    calc_withdraw_one_coin(
      token_amount: BigNumberish,
      i: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "calc_withdraw_one_coin(uint256,int128)"(
      token_amount: BigNumberish,
      i: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    coins(arg0: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;

    "coins(uint256)"(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    calc_withdraw_one_coin(
      token_amount: BigNumberish,
      i: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "calc_withdraw_one_coin(uint256,int128)"(
      token_amount: BigNumberish,
      i: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    coins(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "coins(uint256)"(
      arg0: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;
  };
}
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

interface IRegistryInterface extends ethers.utils.Interface {
  functions: {
    "addProduct(address)": FunctionFragment;
    "claimsAdjustor()": FunctionFragment;
    "claimsEscrow()": FunctionFragment;
    "getProduct(uint256)": FunctionFragment;
    "governance()": FunctionFragment;
    "isProduct(address)": FunctionFragment;
    "locker()": FunctionFragment;
    "master()": FunctionFragment;
    "numProducts()": FunctionFragment;
    "removeProduct(address)": FunctionFragment;
    "setClaimsAdjustor(address)": FunctionFragment;
    "setClaimsEscrow(address)": FunctionFragment;
    "setGovernance(address)": FunctionFragment;
    "setLocker(address)": FunctionFragment;
    "setMaster(address)": FunctionFragment;
    "setSolace(address)": FunctionFragment;
    "setTreasury(address)": FunctionFragment;
    "setVault(address)": FunctionFragment;
    "solace()": FunctionFragment;
    "treasury()": FunctionFragment;
    "vault()": FunctionFragment;
  };

  encodeFunctionData(functionFragment: "addProduct", values: [string]): string;
  encodeFunctionData(
    functionFragment: "claimsAdjustor",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "claimsEscrow",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "getProduct",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "governance",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "isProduct", values: [string]): string;
  encodeFunctionData(functionFragment: "locker", values?: undefined): string;
  encodeFunctionData(functionFragment: "master", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "numProducts",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "removeProduct",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "setClaimsAdjustor",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "setClaimsEscrow",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "setGovernance",
    values: [string]
  ): string;
  encodeFunctionData(functionFragment: "setLocker", values: [string]): string;
  encodeFunctionData(functionFragment: "setMaster", values: [string]): string;
  encodeFunctionData(functionFragment: "setSolace", values: [string]): string;
  encodeFunctionData(functionFragment: "setTreasury", values: [string]): string;
  encodeFunctionData(functionFragment: "setVault", values: [string]): string;
  encodeFunctionData(functionFragment: "solace", values?: undefined): string;
  encodeFunctionData(functionFragment: "treasury", values?: undefined): string;
  encodeFunctionData(functionFragment: "vault", values?: undefined): string;

  decodeFunctionResult(functionFragment: "addProduct", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "claimsAdjustor",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "claimsEscrow",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "getProduct", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "governance", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "isProduct", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "locker", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "master", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "numProducts",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "removeProduct",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setClaimsAdjustor",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setClaimsEscrow",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setGovernance",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "setLocker", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "setMaster", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "setSolace", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "setTreasury",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "setVault", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "solace", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "treasury", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "vault", data: BytesLike): Result;

  events: {};
}

export class IRegistry extends Contract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  on(event: EventFilter | string, listener: Listener): this;
  once(event: EventFilter | string, listener: Listener): this;
  addListener(eventName: EventFilter | string, listener: Listener): this;
  removeAllListeners(eventName: EventFilter | string): this;
  removeListener(eventName: any, listener: Listener): this;

  interface: IRegistryInterface;

  functions: {
    addProduct(
      _product: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "addProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    claimsAdjustor(overrides?: Overrides): Promise<ContractTransaction>;

    "claimsAdjustor()"(overrides?: Overrides): Promise<ContractTransaction>;

    claimsEscrow(overrides?: Overrides): Promise<ContractTransaction>;

    "claimsEscrow()"(overrides?: Overrides): Promise<ContractTransaction>;

    getProduct(
      _productNum: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    "getProduct(uint256)"(
      _productNum: BigNumberish,
      overrides?: CallOverrides
    ): Promise<{
      0: string;
    }>;

    governance(overrides?: Overrides): Promise<ContractTransaction>;

    "governance()"(overrides?: Overrides): Promise<ContractTransaction>;

    isProduct(
      _product: string,
      overrides?: CallOverrides
    ): Promise<{
      0: boolean;
    }>;

    "isProduct(address)"(
      _product: string,
      overrides?: CallOverrides
    ): Promise<{
      0: boolean;
    }>;

    locker(overrides?: Overrides): Promise<ContractTransaction>;

    "locker()"(overrides?: Overrides): Promise<ContractTransaction>;

    master(overrides?: Overrides): Promise<ContractTransaction>;

    "master()"(overrides?: Overrides): Promise<ContractTransaction>;

    numProducts(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    "numProducts()"(
      overrides?: CallOverrides
    ): Promise<{
      0: BigNumber;
    }>;

    removeProduct(
      _product: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "removeProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setClaimsAdjustor(
      _claimsAdjustor: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setClaimsAdjustor(address)"(
      _claimsAdjustor: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setClaimsEscrow(
      _claimsEscrow: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setClaimsEscrow(address)"(
      _claimsEscrow: string,
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

    setLocker(
      _locker: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setLocker(address)"(
      _locker: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setMaster(
      _master: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setMaster(address)"(
      _master: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setSolace(
      _solace: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setSolace(address)"(
      _solace: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    setTreasury(
      _treasury: string,
      overrides?: Overrides
    ): Promise<ContractTransaction>;

    "setTreasury(address)"(
      _treasury: string,
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

    solace(overrides?: Overrides): Promise<ContractTransaction>;

    "solace()"(overrides?: Overrides): Promise<ContractTransaction>;

    treasury(overrides?: Overrides): Promise<ContractTransaction>;

    "treasury()"(overrides?: Overrides): Promise<ContractTransaction>;

    vault(overrides?: Overrides): Promise<ContractTransaction>;

    "vault()"(overrides?: Overrides): Promise<ContractTransaction>;
  };

  addProduct(
    _product: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "addProduct(address)"(
    _product: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  claimsAdjustor(overrides?: Overrides): Promise<ContractTransaction>;

  "claimsAdjustor()"(overrides?: Overrides): Promise<ContractTransaction>;

  claimsEscrow(overrides?: Overrides): Promise<ContractTransaction>;

  "claimsEscrow()"(overrides?: Overrides): Promise<ContractTransaction>;

  getProduct(
    _productNum: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  "getProduct(uint256)"(
    _productNum: BigNumberish,
    overrides?: CallOverrides
  ): Promise<string>;

  governance(overrides?: Overrides): Promise<ContractTransaction>;

  "governance()"(overrides?: Overrides): Promise<ContractTransaction>;

  isProduct(_product: string, overrides?: CallOverrides): Promise<boolean>;

  "isProduct(address)"(
    _product: string,
    overrides?: CallOverrides
  ): Promise<boolean>;

  locker(overrides?: Overrides): Promise<ContractTransaction>;

  "locker()"(overrides?: Overrides): Promise<ContractTransaction>;

  master(overrides?: Overrides): Promise<ContractTransaction>;

  "master()"(overrides?: Overrides): Promise<ContractTransaction>;

  numProducts(overrides?: CallOverrides): Promise<BigNumber>;

  "numProducts()"(overrides?: CallOverrides): Promise<BigNumber>;

  removeProduct(
    _product: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "removeProduct(address)"(
    _product: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setClaimsAdjustor(
    _claimsAdjustor: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setClaimsAdjustor(address)"(
    _claimsAdjustor: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setClaimsEscrow(
    _claimsEscrow: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setClaimsEscrow(address)"(
    _claimsEscrow: string,
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

  setLocker(
    _locker: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setLocker(address)"(
    _locker: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setMaster(
    _master: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setMaster(address)"(
    _master: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setSolace(
    _solace: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setSolace(address)"(
    _solace: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setTreasury(
    _treasury: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  "setTreasury(address)"(
    _treasury: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  setVault(_vault: string, overrides?: Overrides): Promise<ContractTransaction>;

  "setVault(address)"(
    _vault: string,
    overrides?: Overrides
  ): Promise<ContractTransaction>;

  solace(overrides?: Overrides): Promise<ContractTransaction>;

  "solace()"(overrides?: Overrides): Promise<ContractTransaction>;

  treasury(overrides?: Overrides): Promise<ContractTransaction>;

  "treasury()"(overrides?: Overrides): Promise<ContractTransaction>;

  vault(overrides?: Overrides): Promise<ContractTransaction>;

  "vault()"(overrides?: Overrides): Promise<ContractTransaction>;

  callStatic: {
    addProduct(_product: string, overrides?: CallOverrides): Promise<void>;

    "addProduct(address)"(
      _product: string,
      overrides?: CallOverrides
    ): Promise<void>;

    claimsAdjustor(overrides?: CallOverrides): Promise<string>;

    "claimsAdjustor()"(overrides?: CallOverrides): Promise<string>;

    claimsEscrow(overrides?: CallOverrides): Promise<string>;

    "claimsEscrow()"(overrides?: CallOverrides): Promise<string>;

    getProduct(
      _productNum: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    "getProduct(uint256)"(
      _productNum: BigNumberish,
      overrides?: CallOverrides
    ): Promise<string>;

    governance(overrides?: CallOverrides): Promise<string>;

    "governance()"(overrides?: CallOverrides): Promise<string>;

    isProduct(_product: string, overrides?: CallOverrides): Promise<boolean>;

    "isProduct(address)"(
      _product: string,
      overrides?: CallOverrides
    ): Promise<boolean>;

    locker(overrides?: CallOverrides): Promise<string>;

    "locker()"(overrides?: CallOverrides): Promise<string>;

    master(overrides?: CallOverrides): Promise<string>;

    "master()"(overrides?: CallOverrides): Promise<string>;

    numProducts(overrides?: CallOverrides): Promise<BigNumber>;

    "numProducts()"(overrides?: CallOverrides): Promise<BigNumber>;

    removeProduct(_product: string, overrides?: CallOverrides): Promise<void>;

    "removeProduct(address)"(
      _product: string,
      overrides?: CallOverrides
    ): Promise<void>;

    setClaimsAdjustor(
      _claimsAdjustor: string,
      overrides?: CallOverrides
    ): Promise<void>;

    "setClaimsAdjustor(address)"(
      _claimsAdjustor: string,
      overrides?: CallOverrides
    ): Promise<void>;

    setClaimsEscrow(
      _claimsEscrow: string,
      overrides?: CallOverrides
    ): Promise<void>;

    "setClaimsEscrow(address)"(
      _claimsEscrow: string,
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

    setLocker(_locker: string, overrides?: CallOverrides): Promise<void>;

    "setLocker(address)"(
      _locker: string,
      overrides?: CallOverrides
    ): Promise<void>;

    setMaster(_master: string, overrides?: CallOverrides): Promise<void>;

    "setMaster(address)"(
      _master: string,
      overrides?: CallOverrides
    ): Promise<void>;

    setSolace(_solace: string, overrides?: CallOverrides): Promise<void>;

    "setSolace(address)"(
      _solace: string,
      overrides?: CallOverrides
    ): Promise<void>;

    setTreasury(_treasury: string, overrides?: CallOverrides): Promise<void>;

    "setTreasury(address)"(
      _treasury: string,
      overrides?: CallOverrides
    ): Promise<void>;

    setVault(_vault: string, overrides?: CallOverrides): Promise<void>;

    "setVault(address)"(
      _vault: string,
      overrides?: CallOverrides
    ): Promise<void>;

    solace(overrides?: CallOverrides): Promise<string>;

    "solace()"(overrides?: CallOverrides): Promise<string>;

    treasury(overrides?: CallOverrides): Promise<string>;

    "treasury()"(overrides?: CallOverrides): Promise<string>;

    vault(overrides?: CallOverrides): Promise<string>;

    "vault()"(overrides?: CallOverrides): Promise<string>;
  };

  filters: {};

  estimateGas: {
    addProduct(_product: string, overrides?: Overrides): Promise<BigNumber>;

    "addProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    claimsAdjustor(overrides?: Overrides): Promise<BigNumber>;

    "claimsAdjustor()"(overrides?: Overrides): Promise<BigNumber>;

    claimsEscrow(overrides?: Overrides): Promise<BigNumber>;

    "claimsEscrow()"(overrides?: Overrides): Promise<BigNumber>;

    getProduct(
      _productNum: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    "getProduct(uint256)"(
      _productNum: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    governance(overrides?: Overrides): Promise<BigNumber>;

    "governance()"(overrides?: Overrides): Promise<BigNumber>;

    isProduct(_product: string, overrides?: CallOverrides): Promise<BigNumber>;

    "isProduct(address)"(
      _product: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    locker(overrides?: Overrides): Promise<BigNumber>;

    "locker()"(overrides?: Overrides): Promise<BigNumber>;

    master(overrides?: Overrides): Promise<BigNumber>;

    "master()"(overrides?: Overrides): Promise<BigNumber>;

    numProducts(overrides?: CallOverrides): Promise<BigNumber>;

    "numProducts()"(overrides?: CallOverrides): Promise<BigNumber>;

    removeProduct(_product: string, overrides?: Overrides): Promise<BigNumber>;

    "removeProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setClaimsAdjustor(
      _claimsAdjustor: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setClaimsAdjustor(address)"(
      _claimsAdjustor: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setClaimsEscrow(
      _claimsEscrow: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    "setClaimsEscrow(address)"(
      _claimsEscrow: string,
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

    setLocker(_locker: string, overrides?: Overrides): Promise<BigNumber>;

    "setLocker(address)"(
      _locker: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setMaster(_master: string, overrides?: Overrides): Promise<BigNumber>;

    "setMaster(address)"(
      _master: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setSolace(_solace: string, overrides?: Overrides): Promise<BigNumber>;

    "setSolace(address)"(
      _solace: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setTreasury(_treasury: string, overrides?: Overrides): Promise<BigNumber>;

    "setTreasury(address)"(
      _treasury: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    setVault(_vault: string, overrides?: Overrides): Promise<BigNumber>;

    "setVault(address)"(
      _vault: string,
      overrides?: Overrides
    ): Promise<BigNumber>;

    solace(overrides?: Overrides): Promise<BigNumber>;

    "solace()"(overrides?: Overrides): Promise<BigNumber>;

    treasury(overrides?: Overrides): Promise<BigNumber>;

    "treasury()"(overrides?: Overrides): Promise<BigNumber>;

    vault(overrides?: Overrides): Promise<BigNumber>;

    "vault()"(overrides?: Overrides): Promise<BigNumber>;
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

    claimsAdjustor(overrides?: Overrides): Promise<PopulatedTransaction>;

    "claimsAdjustor()"(overrides?: Overrides): Promise<PopulatedTransaction>;

    claimsEscrow(overrides?: Overrides): Promise<PopulatedTransaction>;

    "claimsEscrow()"(overrides?: Overrides): Promise<PopulatedTransaction>;

    getProduct(
      _productNum: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "getProduct(uint256)"(
      _productNum: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    governance(overrides?: Overrides): Promise<PopulatedTransaction>;

    "governance()"(overrides?: Overrides): Promise<PopulatedTransaction>;

    isProduct(
      _product: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    "isProduct(address)"(
      _product: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    locker(overrides?: Overrides): Promise<PopulatedTransaction>;

    "locker()"(overrides?: Overrides): Promise<PopulatedTransaction>;

    master(overrides?: Overrides): Promise<PopulatedTransaction>;

    "master()"(overrides?: Overrides): Promise<PopulatedTransaction>;

    numProducts(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    "numProducts()"(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    removeProduct(
      _product: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "removeProduct(address)"(
      _product: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setClaimsAdjustor(
      _claimsAdjustor: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setClaimsAdjustor(address)"(
      _claimsAdjustor: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setClaimsEscrow(
      _claimsEscrow: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setClaimsEscrow(address)"(
      _claimsEscrow: string,
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

    setLocker(
      _locker: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setLocker(address)"(
      _locker: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setMaster(
      _master: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setMaster(address)"(
      _master: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setSolace(
      _solace: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setSolace(address)"(
      _solace: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    setTreasury(
      _treasury: string,
      overrides?: Overrides
    ): Promise<PopulatedTransaction>;

    "setTreasury(address)"(
      _treasury: string,
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

    solace(overrides?: Overrides): Promise<PopulatedTransaction>;

    "solace()"(overrides?: Overrides): Promise<PopulatedTransaction>;

    treasury(overrides?: Overrides): Promise<PopulatedTransaction>;

    "treasury()"(overrides?: Overrides): Promise<PopulatedTransaction>;

    vault(overrides?: Overrides): Promise<PopulatedTransaction>;

    "vault()"(overrides?: Overrides): Promise<PopulatedTransaction>;
  };
}

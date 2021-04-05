#################
Treasury Contract
#################

.. _treasury-contract:

Treasury: the war chest of Castle Solace.

The Treasury is the long-term hold of Solace's funds. These funds are primarily received as premiums generated while purchasing policies. Treasury will attempt to market swap received assets for long-term storage as Solace. Governance can then spend these accrued funds.

Depositing
==========

Anyone can deposit Eth, Weth, Solace, or any other ERC-20 token. Eth can be deposited with `depositEth()` or the `receive` and `fallback` functions. ERC-20 tokens can be deposited with `depositToken()`. The most common type of deposits received will be premiums generated while purchasing policies.

Swapping
========

The Treasury should hold funds as Solace. Any deposit that is not Solace will attempt to swap to Solace via market order on Uniswap V3. This is where the concepts of paths and routing come into play. In short, paths represent a series of pools that are dipped into in the process of a swap. Governance can manually perform swaps and set paths. Any swap attempt that is not successful will hold the deposited funds instead of reverting.

Spending
========

Governance can spend accrued funds with `spend()`. Governance can send any amount of any token (typically Solace) to any recipient.

State Variables
===============

governance
----------
:Description: Governance's address.
:Type: address

solace
------
:Description: Solace Token's address.
:Type: SOLACE

uniRouter
---------
:Description: Address of uniswap router.
:Type: ISwapRouter

weth
----
:Description: Wrapped Ether.
:Type: IWETH10

paths
-----
:Description: Given a token, what swap path should it take.
:Type: mapping(address => bytes)

Constructor
===========
:Description: Constructs the treasury contract.
:Inputs:
    | SOLACE _solace: Address of the solace token.
    | address _uniRouter: Address of uniswap router.
    | address _weth: Address of wrapped ether.

View Functions
==============

governance
----------
:Description: Governance's address.
:Inputs: none
:Outputs:
    address: Address of governance.
:Modifiers: none

solace
------
:Description: Solace Token's address.
:Inputs: none
:Outputs:
    address: Address of Solace Token.
:Modifiers: none

uniRouter
---------
:Description: Address of Uniswap router.
:Inputs: none
:Outputs:
    address: Address of Uniswap router.
:Modifiers: none

weth
----
:Description: Wrapped Ether.
:Inputs: none
:Outputs:
    address: Address of wrapped ether contract.
:Modifiers: none

paths
-----
:Description: Given a token, what swap path should it take.
:Inputs:
    address _token: The token to query.
:Outputs:
    bytes: The path the token should take.
:Modifiers: none

Mutative Functions
==================

depositEth
----------
:Description: Deposits some Ether.
:Inputs: none
:Outputs: none
:Modifiers: payable

depositToken
------------
:Description: Deposit some ERC20 token.
:Inputs:
    | address _token: The address of the token to deposit.
    | uint256 _amount: The amount of the token to deposit.
:Outputs: none
:Modifiers: none

Restricted Functions
====================

These functions can only be called by Governance.

setGovernance
-------------
:Description: Transfers the governance role to a new governor.
:Inputs:
    address _governance: The new governor.
:Outputs: none
:Modifiers: only governance

spend
-----
:Description: Spends some tokens.
:Inputs:
    | address _token: The address of the token to spend.
    | uint256 _amount: The amount of the token to spend.
    | address _recipient: The address of the token receiver.
:Outputs: none
:Modifiers: only governance

swap
----
:Description: Manually swaps a token using a predefined path.
:Inputs:
    address _token: The address of the token to swap.
:Outputs: none
:Modifiers: only governance

Events
======

DepositEth
----------
:Description: Emitted when eth is deposited.
:Parameters:
    uint256 _amount: The amount of eth that was deposited.

DepositToken
------------
:Description: Emitted when a token is deposited.
:Parameters:
    | address _token: The address of the deposited token.
    | uint256 _amount: The amount of the deposited token.

Spend
-----
:Description: Emitted when a token is spent.
:Parameters:
    | address _token: The address of the spent token.
    | uint256 _amount: The amount of the spent token.
    | address _recipient: The recipient of the spent token.

PathSet
-------
:Description: Emitted when a token swap path is set.
:Parameters:
    | address _token: The token whose path was set.
    | bytes _path: The new path.

Source
======

.. literalinclude:: ./../contracts/Treasury.sol
   :language: Solidity
   :linenos:

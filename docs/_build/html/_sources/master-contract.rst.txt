###############
Master Contract
###############

.. _master-contract:

Master: the distributor of Solace.fi.

Master will distribute SOLACE token to liquidity providers (LPs) and capital providers (CPs).
Reward liquidity providers for ETH-SOLACE pair on DEX(es) who stake their LP tokens, capital providers for our Vault who stake their CP tokens, and stakers of SOLACE.
Both ERC-20 and ERC-721 tokens can be staked.

To accomplish this, Master tracks state at the global level, per farm, and per user.

Global
======

There are a number of farms `numFarms`. These farms combined will distribute an amount of Solace per block `solacePerBlock`. The amount that each farm distributes can be adjusted using allocation points, globally `totalAllocPoints`.

Per Farm
========

The global mapping `farmInfo` maps a unique farm id to a farm. Each farm can only hold one type of `token`. If that token is an ERC-721, it will be valued by its `appraiser`. The amount of Solace that each farm distributes relative to the other farms is its `allocPoints`. Each farm distributes over a period of time from `startBlock` through `endBlock`, with the last time that rewards were distributed as `lastRewardBlock`. Token amounts are stored as `accSolacePerShare` and `valueStaked`.

Per User
========

The global mapping `userInfo` maps a unique farm id and user address to information about a farmer. The value that they've staked is `value` and they have a `rewardDebt`. If the farm is an ERC-721 farm, the global mapping `depositedErc721sAndValues` will hold a list of the tokens a user deposited and their values.

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

solacePerBlock
--------------
:Description: Total solace distributed per block across all farms.
:Type: uint256

totalAllocPoints
----------------
:Description: Total allocation points across all farms.
:Type: uint256

farmInfo
--------
:Description: Information about each farm.
:Type: mapping(uint256 => FarmInfo)

numFarms
--------
:Description: The number of farms that have been created.
:Type: uint256

farmIsErc20
-----------
:Description: Returns true if farming ERC20 tokens.
:Type: mapping(uint256 => bool)

farmIsErc721
------------
:Description: Returns true if farming ERC721 tokens.
:Type: mapping(uint256 => bool)

userInfo
--------
:Description: Information about each farmer.
:Type: mapping(uint256 => mapping(address => UserInfo))

depositedErc721sAndValues
-------------------------
:Description: A list of tokens that a user has deposited onto a farm and their values.
:Type: mapping(uint256 => mapping(address => EnumerableMap.UintToUintMap))

Constructor
===========

:Description: Constructs the Master contract.
:Inputs:
    | SOLACE _solace: Address of the solace token.
    | uint256 _solacePerBlock: Amount of solace to distribute per block.

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

solacePerBlock
--------------
:Description: Total solace distributed per block across all farms.
:Inputs: none
:Outputs:
    uint256: Total solace distributed per block across all farms.
:Modifiers: none

totalAllocPoints
----------------
:Description: Total allocation points across all farms.
:Inputs: none
:Outputs:
    uint256: Total allocation points across all farms.
:Modifiers: none

farmInfo
--------
:Description: Information about each farm.
:Inputs:
    uint256 _farmId: Index of farm to query.
:Outputs:
    FarmInfo: Information about the farm.
:Modifiers: none

numFarms
--------
:Description: The number of farms that have been created.
:Inputs: none
:Outputs:
    uint256: The number of farms that have been created.
:Modifiers: none

farmIsErc20
-----------
:Description: Returns true if farming ERC20 tokens.
:Inputs:
    uint256 _farmId: Index of farm to query.
:Outputs:
    bool: True if farming ERC20 tokens.
:Modifiers: none

farmIsErc721
------------
:Description: Returns true if farming ERC721 tokens.
:Inputs:
    uint256 _farmId: Index of farm to query.
:Outputs:
    bool: True if farming ERC721 tokens.
:Modifiers: none

userInfo
--------
:Description: Information about each farmer.
:Inputs:
    | uint256 _farmId: Index of farm to query.
    | address _user: Address of user on farm.
:Outputs:
    UserInfo: Information about the user.
:Modifiers: none

pendingReward
-------------
:Description: Calculates the accumulated balance of reward token for specified user.
:Inputs:
    | uint256 _farmId: The farm to measure rewards for.
    | address _user: The user for whom unclaimed tokens will be shown.
:Outputs:
    uint256: Total amount of withdrawable reward tokens.
:Modifiers: none

getMultiplier
-------------
:Description: Calculates the reward multiplier over the given _from until _to block.
:Inputs:
    | uint256 _farmId: The farm to measure rewards for.
    | uint256 _from: The start of the period to measure rewards for.
    | uint256 _to: The end of the period to measure rewards for.
:Outputs:
    uint256: The weighted multiplier for the given period.
:Modifiers: none

countDepositedErc721
--------------------
:Description: Returns the count of ERC721s that a user has deposited onto a farm.
:Inputs:
    | uint256 _farmId: The farm to check count for.
    | uint256 _user: The user to check count for.
:Outputs:
    uint256: The count of deposited ERC721s.
:Modifiers: none

listDepositedErc721
-------------------
:Description: Returns the list of ERC721s that a user has deposited onto a farm.
:Inputs:
    | uint256 _farmId: The farm to list ERC721s.
    | uint256 _user: The user to list ERC721s.
:Outputs:
    uint256[]: The list of deposited ERC721s.
:Modifiers: none

getDepositedErc721At
--------------------
:Description: Returns the id of an ERC721 that a user has deposited onto a farm.
:Inputs:
    | uint256 _farmId: The farm to get token id for.
    | uint256 _user: The user to get token id for.
    | uint256 _index: The farm-based index of the token.
:Outputs:
    uint256: The id of the deposited ERC721.
:Modifiers: none

assertDepositedErc721
---------------------
:Description: Returns true if a user has deposited a given ERC721.
:Inputs:
    | uint256 _farmId: The farm to check.
    | uint256 _user: The user to check.
    | uint256 _token: The token to check.
:Outputs:
    bool: True if the user has deposited the given ERC721.
:Modifiers: none

Mutative Functions
==================

depositErc20
------------
:Description: Deposit some ERC20 tokens. User will receive accumulated Solace rewards if any.
:Inputs:
    | uint256 _farmId: The farm to deposit to.
    | uint256 _amount: The deposit amount.
:Outputs: none
:Modifiers: none

depositErc721
-------------
:Description: Deposit an ERC721 token. User will receive accumulated Solace rewards if any.
:Inputs:
    | uint256 _farmId: The farm to deposit to.
    | uint256 _token: The deposit token.
:Outputs: none
:Modifiers: none

withdrawErc20
-------------
:Description: Withdraw some ERC20 tokens. User will receive _amount of CP/LP tokens and accumulated Solace rewards.
:Inputs:
    | uint256 _farmId: The farm to withdraw from.
    | uint256 _amount: The withdraw amount.
:Outputs: none
:Modifiers: none

withdrawErc721
--------------
:Description: Withdraw an ERC721 token. User will receive _token and accumulated Solace rewards.
:Inputs:
    | uint256 _farmId: The farm to withdraw from.
    | uint256 _token: The withdraw token.
:Outputs: none
:Modifiers: none

withdrawRewards
---------------
:Description: Withdraw your pending rewards without unstaking your tokens.
:Inputs:
    uint256 _farmId: The farm to withdraw rewards from.
:Outputs: none
:Modifiers: none

updateFarm
----------
:Description: Updates farm information to be up to date to the current block.
:Inputs:
    uint256 _farmId: The farm to update.
:Outputs: none
:Modifiers: none

massUpdateFarms
---------------
:Description: Updates all farms to be up to date to the current block.
:Inputs: none
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

createFarmErc20
---------------
:Description: Constructs a new farm for an ERC20 token.
:Inputs:
    | address _token: The token to deposit.
    | uint256 _allocPoints: Relative amount of solace rewards to distribute per block.
    | uint256 _startBlock: When the farm will start.
    | uint256 _endBlock: When the farm will end.
:Outputs:
    uint256: ID of the new farm.
:Modifiers: only governance

createFarmErc721
----------------
:Description: Constructs a new farm for an ERC721 token.
:Inputs:
    | address _token: The token to deposit.
    | address _appraiser: The appraiser contract.
    | uint256 _allocPoints: Relative amount of solace rewards to distribute per block.
    | uint256 _startBlock: When the farm will start.
    | uint256 _endBlock: When the farm will end.
:Outputs:
    uint256: ID of the new farm.
:Modifiers: only governance

setSolacePerBlock
-----------------
:Description: Sets the Solace reward distribution across all farms. Optionally updates all farms.
:Inputs:
    | uint256 _solacePerBlock: Amount of solace to distribute per block.
    | bool _withUpdate: If true, updates all farms.
:Outputs: none
:Modifiers: only governance

setFarmParams
-------------
:Description: Set a farm's allocation and end block. Optionally updates all farms.
:Inputs:
    | uint256 _farmId: The farm to set allocation for.
    | uint256 _allocPoints: The farm's new allocation points.
    | uint256 _endBlock: The farm's new end block.
    | bool _withUpdate: If true, updates all farms.
:Outputs: none
:Modifiers: only governance

Events
======

Erc20FarmCreated
----------------
:Description: Emitted when an ERC20 farm is created.
:Parameters:
    uint256 _farmId: Index of the created farm.

Erc721FarmCreated
-----------------
:Description: Emitted when an ERC721 farm is created.
:Parameters:
    uint256 _farmId: Index of the created farm.

DepositErc20
------------
:Description: Emitted when ERC20 tokens are deposited onto a farm.
:Parameters:
    | address _user: The user that deposited tokens.
    | uint256 _farmId: Index of the farm.
    | uint256 _amount: The amount of deposited tokens.

DepositErc721
-------------
:Description: Emitted when an ERC721 token is deposited onto a farm.
:Parameters:
    | address _user: The user that deposited the token.
    | uint256 _farmId: Index of the farm.
    | uint256 _token: The index of the deposited token.

WithdrawErc20
-------------
:Description: Emitted when ERC20 tokens are withdrawn from a farm.
:Parameters:
    | address _user: The user that withdrew tokens.
    | uint256 _farmId: Index of the farm.
    | uint256 _amount: The amount of withdrawn tokens.

WithdrawErc721
--------------
:Description: Emitted when an ERC721 token is withdrawn from a farm.
:Parameters:
    | address _user: The user that withdrew the token.
    | uint256 _farmId: Index of the farm.
    | uint256 _token: The index of the withdrawn token.

Source
======

.. literalinclude:: ./../contracts/Master.sol
   :language: Solidity
   :linenos:

#################
Registry Contract
#################

.. _registry-contract:

This smart contract will be the first deployed contract and will keep track of all subsequent deployed contracts and their addresses.

Contracts tracked in Registry:

* Governance
* Solace Token
* Master
* Vault
* Treasury
* Locker
* Products

Contracts NOT tracked in Registry:

* Strategies (tracked in Vault)
* Policies (tracked in Products)

State Variables
===============

governance
----------
:Description: Governance's address.
:Type: address

solace
------
:Description: Solace Token's address.
:Type: address

master
------
:Description: Master Contract's address
:Type: address

vault
-----
:Description: Vault's address
:Type: address

treasury
--------
:Description: Treasury's address
:Type: address

locker
------
:Description: Locker's address
:Type: address

products
--------
:Description: Set of product addresses
:Type: address set

Constructor
===========
:Description: Constructs the registry contract.
:Inputs: none

View Functions
==============

governance
----------
:Description: Governance's address.
:Inputs: none
:Outputs:
    address: Governance's address.
:Modifiers: none

solace
------
:Description: Solace Token's address.
:Inputs: none
:Outputs:
    address: Solace Token's address.
:Modifiers: none

master
------
:Description: Master Contract's address.
:Inputs: none
:Outputs:
    address: Master Contract's address.
:Modifiers: none

vault
-----
:Description: Vault's address.
:Inputs: none
:Outputs:
    address: Vault's address.
:Modifiers: none

treasury
--------
:Description: Treasury's address.
:Inputs: none
:Outputs:
    address: Treasury's address.
:Modifiers: none

locker
------
:Description: Locker's address.
:Inputs: none
:Outputs:
    address: Locker's address.
:Modifiers: none

numProducts
-----------
:Description: Returns the number of products.
:Inputs: none
:Outputs:
    uint256: Number of products.
:Modifiers: none

getProduct
----------
:Description: Returns the product at the given index.
:Inputs:
    uint256 _productNum: The index to query.
:Outputs:
    address: The address of the product.
:Modifiers: none

isProduct
---------
:Description: Returns true if the given address is a product.
:Inputs:
    address _product: The address to query.
:Outputs:
    bool: True if the address is a product.
:Modifiers: none

Mutative Functions
==================

All mutative functions in Registry can only be called by Governance.

setGovernance
-------------
:Description: Transfers the governance role to a new governor.
:Inputs:
    address _governance: The new governor.
:Outputs: none
:Modifiers: only governance

setSolace
---------
:Description: Sets Solace Token.
:Inputs:
    address _solace: The solace token address.
:Outputs: none
:Modifiers: only governance

setMaster
---------
:Description: Sets Master.
:Inputs:
    address _master: The master contract address.
:Outputs: none
:Modifiers: only governance

setVault
--------
:Description: Sets Vault.
:Inputs:
    address _vault: The vault contract address.
:Outputs: none
:Modifiers: only governance

setTreasury
-----------
:Description: Sets Treasury.
:Inputs:
    address _treasury: The treasury contract address.
:Outputs: none
:Modifiers: only governance

setLocker
---------
:Description: Sets Locker.
:Inputs:
    address _locker: The locker address.
:Outputs: none
:Modifiers: only governance

addProduct
----------
:Description: Adds a new Product.
:Inputs:
    address _product: The product to add.
:Outputs: none
:Modifiers: only governance

removeProduct
-------------
:Description: Removes a Product.
:Inputs:
    address _product: The product to remove.
:Outputs: none
:Modifiers: only governance

Events
======

GovernanceSet
-------------
:Description: Emitted when Governance is set.
:Parameters:
   address _governance: The new governor.

SolaceSet
---------
:Description: Emitted when Solace Token is set.
:Parameters:
   address _solace: The solace token address.

MasterSet
---------
:Description: Emitted when Master is set.
:Parameters:
   address _master: The master contract address.

VaultSet
--------
:Description: Emitted when Vault is set.
:Parameters:
   address _vault: The vault contract address.

TreasurySet
-----------
:Description: Emitted when Treasury is set.
:Parameters:
   address _treasury: The treasury contract address.

LockerSet
---------
:Description: Emitted when Locker is set.
:Parameters:
   address _locker: The locker address.

ProductAdded
------------
:Description: Emitted when a Product is added.
:Parameters:
   address _product: The added product.

ProductRemoved
--------------
:Description: Emitted when a Product is removed.
:Parameters:
   address _product: The removed product.

Source
======

.. literalinclude:: ./../contracts/Registry.sol
   :language: Solidity
   :linenos:

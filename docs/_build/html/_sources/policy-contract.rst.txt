###############
Policy Contract
###############

.. _policy-contract:

This smart contract will hold the implementation of Policy contract functions that will handle user interactions with the protocol (e.g. extend/cancel the policy, file a claim, etc.). Each time a user purchases a policy a new Proxy contract will be deployed with the user-specific state variable and act as the entrance point which will delegate calls to this Implementation contract.

State Variables
===============

Constructor
===========

View Functions
==============
* viewPolicyHolder()
* viewExpirationDate()
* viewClaimStatus()

Mutative Functions
==================

Restricted Functions
====================
* openClaim(): policy holder can call this function to open a claim, this will send a message to the product contract for committee to review. An event will be emitted with the necessary info for the review and recorder off-chain.
* cancelPolicy(): policy holder can call this function to cancel his policy and get a prorated refund, minus a cancellation fee.
* extendPolicy(extensionTime): policy holder can extend the policy. A payment must be made with this call.

Modifiers
=========

Events
======

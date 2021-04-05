#####################
Proxy Policy Contract
#####################

.. _proxy-policy-contract:

This contract will be deployed with each purchase of an insurance policy as a user front, will store the necessary state variables, and forward calls to the implementation contract that executes the logic.

State Variables
===============
* policy holder address
* product contract address
* premium amount (% of insured funds over 365 days)
* policy start time
* policy end time
* coverageLimit
* deductible
* claim status

Constructor
===========

View Functions
==============

Mutative Functions
==================

Restricted Functions
====================

Modifiers
=========

Events
======

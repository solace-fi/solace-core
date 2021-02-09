# Policy smart contract
This smart contract will be deployed with every purchase of an insurance policy and contain all the necessary variables and functions for user to interact with the protocol (e.g. extend/cancel the policy, file a claim, etc.) and the protocol to interact with the user (e.g. process refunds, pay out claims, etc.)

## state variables
* policy holder address
* product contract address
* premium amount (% of insured funds over 365 days)
* policy start time
* policy end time
* insured amount in Ether
* claim status

## constructor
sets all the state variables

## view functions
* viewPolicyHolder()
* viewExpirationDate()
* viewClaimStatus()

## mutative functions

## restricted functions
* openClaim(): policy holder can call this function to open a claim, this will send a message to the product contract for committee to review. An event will be emitted with the necessary info for the review and recorder off-chain.
* cancelPolicy(): policy holder can call this function to cancel his policy and get a prorated refund, minus a cancellation fee.
* extendPolicy(extensionTime): policy holder can extend the policy. A payment must be made with this call.

## modifiers

## events
every call should emit an event
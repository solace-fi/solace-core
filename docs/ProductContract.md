# Product smart contract
This smart contract will get deployed by Factory for every insurance product. It will constitute the parameters for the product and launch Policy smart contracts as users purchase insurance policies. This contract will handle all the calls to and from the policy contracts.

## state variables
* address public insuredContract: this is the address of the contract that is being insured by this product
* uint public premium
* uint public minPeriod
* uint public maxPeriod
* uint public cancelFee
* uint public policyCount
* uint public totalInsured
* mapping (address => bool) public holdsPolicy
* mapping (uint => address) public getPolicy
## constructor

## view functions
* allPolicies(uint index) returns (address Policy): return the address of the n-th product that factory launched (pass 0 for the first product created, 1 for the second, etc.)
* getPremium()
* getPeriod()
* getInsuredContract()
* getCancelFee()
* holderOf(address policy) returns (address policyHolder)
* policyExpiration(address policy) returns (uint date)
* getPolicyCount(): return number of policies deployed
* getAmountInsured(): return the amount insured (denominated in ETH)
## mutative functions
* buyPolicy(uint period): user calls this function with payment to buy the policy then this contract deploys policy contract
* extendPolicy(): policy contracts can make this call with payment to extend the policy (new expiration date calculated from paid amount), will make a mutative call back to policy contract to change expiry date state variable
* cancelPolicy(): policy contracts can make this call to cancel the policy and get a prorated refund minus cancelation fee, will make a mutative call back to policy contract to kil it
## modifiers

## events
every call should emit an event
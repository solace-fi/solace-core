# solace.fi
https://solace.fi

![architecture](tech-arch.jpg)

## Contracts
detailed technical documentation is located in docs folder.
* MultiSig: Solace deployer controlled by the core team
* SolaceToken: solace.fi protocol ERC20 token
* Master: owner of solace.fi (ownership will be transferred to decentralized governance in the future) and SOLACE distributor
* Vault: contract that holds the reserve and allocates capital to investment (denominated in ETH)
* Investment: capital pool utilized for investment activity (currently liquid ETH2.0 staking)
* Locker: vote lockup contract to boost rewards for capital providers and gain governance rights
* Treasury: holds and manages the protocol's own capital and buys up SOLACE on the open market (denominated in SOLACE)
* Factory: deploys new insurance products created by the MultiSig
* Product: deploys new insurance policies purchased by the buyers
* Policy: purchased insurance policy
* Router: routes the function calls to the core contracts

## Arch Questions
* how to structure reserve and investment pools?
*
## License
MIT

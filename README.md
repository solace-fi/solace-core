# solace.fi
https://solace.fi

![architecture](tech-arch.jpg)

## Contracts
detailed technical documentation is located in docs folder.
* SolaceToken: solace.fi protocol ERC20 token
* Master: owner of solace.fi (ownership will be transferred to decentralized governance in the future) and SOLACE distributor
* Locker: vote lockup contract to boost rewards for capital providers and gain governance rights
* Factory: deploys new insurance products created by the Master
* Product: deploys new insurance policies purchased by the buyers
* Policy: purchased insurance policy
* Router: routes the function calls to the core contracts

## Arch Questions
* how to structure reserve and investment pools?
*
## License
MIT

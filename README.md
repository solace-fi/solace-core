# solace.fi
https://solace.fi

![architecture](tech-arch.jpg)

## Contracts
detailed technical documentation is located in docs folder.
* MultiSig: Solace deployer controlled by the core team (Gnosis Safe + OpenZeppelin Defender)
* SolaceToken: solace.fi protocol ERC20 token
* Registry: registry contract keeping track of contract addresses and the products mapping deployed by the MultiSig Deployer
* Master: owner of solace.fi (ownership will be transferred to decentralized governance in the future) and SOLACE token distributor
* Vault: contract that holds the reserve and allocates capital to investment (denominated in ETH)
* Investment: capital pool utilized for investment activity (currently liquid ETH2.0 staking strategy)
* Locker: vote lockup contract to boost rewards for capital providers and gain governance rights
* Treasury: holds and manages the protocol's own capital and buys up SOLACE on the open market (denominated in SOLACE)
* Factory: deploys new insurance products created by the MultiSig
* Product: deploys new insurance policies purchased by the buyers
* Policy: insurance policy implementation
* Proxy Policy: user front contract storing data and forwarding the calls to the implementation contract

## Operational notes
* Use OpenZeppelin Defender for smart contract administration
* Proxy scheme to deploy insurance policies (one implementation per product, one proxy per user)

## Pragma Version
* Solidity 0.8.0: https://docs.soliditylang.org/en/v0.8.0/

## Development Stack
* Ethereum Dev Environment: https://hardhat.org/
* Smart Contract Testing: https://getwaffle.io/
* Blockchain interactions: https://docs.ethers.io/v5/
* TypeChain (TypeScript bindings for Ethereum smartcontracts): https://github.com/ethereum-ts/TypeChain
* TypeScript: https://www.typescriptlang.org/

## Style Guide
* Solidity: https://docs.soliditylang.org/en/v0.5.3/style-guide.html
* TypeScript: https://google.github.io/styleguide/tsguide.html
* Git: https://github.com/kseniya292/standards

## License
GNU General Public License v3.0

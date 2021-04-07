# solace.fi
https://solace.fi

![architecture](tech-arch.jpg)

## Contracts
detailed technical documentation is located in docs folder.
* MultiSig: Solace deployer controlled by the core team (Gnosis Safe + OpenZeppelin Defender)
* :white_check_mark: SolaceToken: solace.fi protocol ERC20 token
* :white_check_mark: Registry: registry contract keeping track of contract addresses and the products mapping deployed by the MultiSig Deployer
* :white_check_mark: Master: SOLACE token distributor (yield farming staking contract)
* :white_check_mark: Vault: contract that holds the reserve and allocates capital to strategies (denominated in ETH)
* :white_check_mark: BaseStrategy: abstract contract that be inherited by strategy contracts executing an investment (will deploy multiple strategies, one at launch will be liquid ETH2.0 staking strategy)
* Locker: vote lockup contract to boost rewards for capital providers and gain governance rights
* :white_check_mark: Treasury: holds and manages the protocol's own capital and buys up SOLACE on the open market (denominated in SOLACE)
* BaseProduct: abstract contract that's inherited by the products, which will deploy new insurance policies purchased by the buyers
* Policy: an ERC721 contract that stores user-specific policy data, a single touch point between the policy-buyer and the protocol

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

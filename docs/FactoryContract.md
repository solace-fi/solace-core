# Factory smart contract
This smart contract will launch new insurance products' smart contracts and manage the existing ones. Master will call this contract to launch new products 

## state variables
* mapping(uint => address) public getProduct

## constructor

## view functions
* allProducts(uint256 index) returns (address Product): return the address of the n-th product that factory launched (pass 0 for the first product created, 1 for the second, etc.)
* getProductPremium(address Product) returns (uint Premium): return the premium amount for the product
* getProductContract(address Product) returns (address Contract): return the insured contract address
## mutative functions (onlyOwner)
* createProduct(address Contract, uint256 Premium, uint256 minPeriod, uint 256 maxPeriod): launches a new product
* setProductPremium(address Product, uint256 ): changes the premium for the insurance product
* setProductContract(address Product, address Contract): changes the insured contract address (in case a platform migrates/upgrades to a new contract)
* setProductPeriod(address Product, uint minPeriod, uint maxPeriod): updates min and max period for insurance policies

## modifiers

## events
every call should emit an event
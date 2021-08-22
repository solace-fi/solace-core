# set mythx Api Key
export MYTHX_API_KEY="your api key here"
# check mythx Api Key
echo $MYTHX_API_KEY

# mythx won't scan abstract contracts. duplicate BaseProduct into mocks, remove the abstract and add filler logic for the virtual functions.

# mythx has a hard time with imports, need to flatten first
python3 scripts/process_contracts.py

# queue jobs async
mythx analyze --mode deep --async \
  contracts_processed/ClaimsEscrow.sol:ClaimsEscrow \
  contracts_processed/CpFarm.sol:CpFarm \
  contracts_processed/ExchangeQuoterManual.sol:ExchangeQuoterManual \
  contracts_processed/ExchangeQuoter.sol:ExchangeQuoter \
  contracts_processed/Governable.sol:Governable \
  contracts_processed/LpAppraisor.sol:LpAppraisor \
  contracts_processed/Master.sol:Master \
  contracts_processed/PolicyDescriptor.sol:PolicyDescriptor \
  contracts_processed/PolicyManager.sol:PolicyManager \
  contracts_processed/Registry.sol:Registry \
  contracts_processed/RiskManager.sol:RiskManager \
  contracts_processed/SolaceEthLpFarm.sol:SolaceEthLpFarm \
  contracts_processed/SOLACE.sol:SOLACE \
  contracts_processed/Treasury.sol:Treasury \
  contracts_processed/Vault.sol:Vault \
  contracts_processed/products/AaveV2Product.sol:AaveV2Product \
  contracts_processed/mocks/BaseProduct.sol:BaseProduct \
  contracts_processed/products/CompoundProduct.sol:CompoundProduct \
  contracts_processed/products/CurveProduct.sol:CurveProduct \
  contracts_processed/products/YearnV2Product.sol:YearnV2Product

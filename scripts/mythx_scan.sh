# set Myth Api Key
export MYTHX_API_KEY="your api key here"
# check Mythx Api Key
echo $MYTHX_API_KEY

# mythx has a hard time with imports, need to flatten first
python3 scripts/flatten_contracts.py

# queue jobs async
mythx analyze  --mode standard --async \
  contracts_flat/ClaimsAdjustor.sol:ClaimsAdjustor \
  contracts_flat/ClaimsEscrow.sol:ClaimsEscrow \
  contracts_flat/CpFarm.sol:CpFarm \
  contracts_flat/Master.sol:Master \
  contracts_flat/Registry.sol:Registry \
  contracts_flat/SolaceEthLpFarm.sol:SolaceEthLpFarm \
  contracts_flat/SOLACE.sol:SOLACE \
  contracts_flat/Treasury.sol:Treasury \
  contracts_flat/Vault.sol:Vault

# Performs a fresh install of all packages then
# performs a fresh compile and test of all contracts.

# clean filesystem
rm -rf artifacts
rm -rf cache
rm -rf client
rm -rf typechain
rm -rf contracts_processed
rm -rf node_modules
rm -rf coverage
rm coverage.json

# install packages. process, compile, and test contracts
npm install
python3 scripts/process_contracts.py
npx hardhat compile
npx hardhat test

# code coverage
# need to skip stack too deep contracts
# comment these contracts out from test/utilities/artifact_importer.ts
mv contracts/SolaceEthLpFarm.sol contracts/SolaceEthLpFarm.sol-ignore
mv contracts/LpAppraisor.sol contracts/LpAppraisor.sol-ignore
mv test/Master.test.ts test/Master.test.ts-ignore
mv test/SolaceEthLpFarm.test.ts test/SolaceEthLpFarm.test.ts-ignore
mv test/LpAppraisor.test.ts test/LpAppraisor.test.ts-ignore
npx hardhat coverage
mv contracts/SolaceEthLpFarm.sol-ignore contracts/SolaceEthLpFarm.sol
mv contracts/LpAppraisor.sol-ignore contracts/LpAppraisor.sol
mv test/Master.test.ts-ignore test/Master.test.ts
mv test/SolaceEthLpFarm.test.ts-ignore test/SolaceEthLpFarm.test.ts
mv test/LpAppraisor.test.ts-ignore test/LpAppraisor.test.ts

# docs
#npx solidity-docgen --solc-module solc-0.8 -o docs/_build/md

# misc
solhint contracts/**/*.sol
npm outdated

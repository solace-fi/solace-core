# Performs a fresh install of all packages then
# performs a fresh compile and test of all contracts.

# clean filesystem
rm -rf artifacts
rm -rf cache
rm -rf client
rm -rf docs/_build/html
rm -rf docs/_build/md
rm -rf node_modules
rm -rf typechain

# install packages, compile, test
npm install
npx hardhat compile
npx hardhat test

# code coverage
mv contracts/SolaceEthLpFarm.sol contracts/SolaceEthLpFarm.sol-ignore
mv test/Master.test.ts test/Master.test.ts-ignore
mv test/SolaceEthLpFarm.test.ts test/SolaceEthLpFarm.test.ts-ignore
npx hardhat coverage
mv contracts/SolaceEthLpFarm.sol-ignore contracts/SolaceEthLpFarm.sol
mv test/Master.test.ts-ignore test/Master.test.ts
mv test/SolaceEthLpFarm.test.ts-ignore test/SolaceEthLpFarm.test.ts

# docs
cd docs
make html
cd ..
#npx solidity-docgen --solc-module solc-0.8 -o docs/_build/md

# misc
solhint contracts/**/*.sol
npm outdated

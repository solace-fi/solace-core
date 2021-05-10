# Performs a fresh install of all packages then
# performs a fresh compile and test of all contracts.

rm -rf artifacts
rm -rf cache
rm -rf client
rm -rf docs/_build/html
rm -rf docs/_build/md
rm -rf node_modules
rm -rf typechain

npm install
npx hardhat compile
npx hardhat test

cd docs
make html
cd ..
#npx solidity-docgen --solc-module solc-0.8 -o docs/_build/md

solhint contracts/**/*.sol
npm outdated

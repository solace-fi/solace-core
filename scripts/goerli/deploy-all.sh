# runs all deploy scripts in order

npx hardhat run scripts/goerli/deploy-deployer.ts --network goerli
npx hardhat run scripts/goerli/deploy-staking.ts --network goerli
npx hardhat run scripts/goerli/deploy-faucet.ts --network goerli
npx hardhat run scripts/goerli/deploy-bonds.ts --network goerli
npx hardhat run scripts/goerli/deploy-swc-v1.ts --network goerli

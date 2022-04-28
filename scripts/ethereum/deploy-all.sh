# runs all deploy scripts in order

npx hardhat run scripts/ethereum/deploy-deployer.ts --network ethereum
npx hardhat run scripts/ethereum/deploy-staking.ts --network ethereum
npx hardhat run scripts/ethereum/deploy-xsolace-migrator.ts --network ethereum
npx hardhat run scripts/ethereum/deploy-bonds.ts --network ethereum
npx hardhat run scripts/ethereum/deploy-swc-v1.ts --network ethereum

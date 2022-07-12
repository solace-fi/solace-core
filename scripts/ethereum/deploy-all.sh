# runs all deploy scripts in order

npx hardhat run scripts/ethereum/deploy-deployer.ts --network ethereum
npx hardhat run scripts/ethereum/deploy-staking.ts --network ethereum
npx hardhat run scripts/ethereum/deploy-xsolace-migrator.ts --network ethereum
npx hardhat run scripts/ethereum/deploy-bonds.ts --network ethereum
npx hardhat run scripts/ethereum/deploy-swc-v1.ts --network ethereum
npx hardhat run scripts/ethereum/deploy-swc-v3.ts --network ethereum
npx hardhat run scripts/ethereum/deploy-staking-rewards-v2.ts --network ethereum
npx hardhat run scripts/ethereum/migrate-to-swc-v3.ts --network ethereum

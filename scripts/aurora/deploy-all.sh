# runs all deploy scripts in order

npx hardhat run scripts/aurora/deploy-deployer.ts --network aurora
npx hardhat run scripts/aurora/deploy-staking.ts --network aurora
npx hardhat run scripts/aurora/deploy-bridge-wrapper.ts --network aurora
npx hardhat run scripts/aurora/deploy-bonds.ts --network aurora
npx hardhat run scripts/aurora/deploy-swc-v3.ts --network aurora
npx hardhat run scripts/aurora/deploy-staking-rewards-v2.ts --network aurora

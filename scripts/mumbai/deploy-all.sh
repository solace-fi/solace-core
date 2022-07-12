# runs all deploy scripts in order

npx hardhat run scripts/mumbai/deploy-deployer.ts --network mumbai
npx hardhat run scripts/mumbai/deploy-staking.ts --network mumbai
npx hardhat run scripts/mumbai/deploy-bridge-wrapper.ts --network mumbai
npx hardhat run scripts/mumbai/deploy-faucet.ts --network mumbai
npx hardhat run scripts/mumbai/deploy-bonds.ts --network mumbai
npx hardhat run scripts/mumbai/deploy-swc-v1.ts --network mumbai
npx hardhat run scripts/mumbai/deploy-swc-v3.ts --network mumbai
npx hardhat run scripts/mumbai/deploy-staking-rewards-v2.ts --network mumbai
npx hardhat run scripts/mumbai/migrate-to-swc-v3.ts --network mumbai

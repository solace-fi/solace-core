# runs all deploy scripts in order

npx hardhat run scripts/polygon/deploy-deployer.ts --network polygon
npx hardhat run scripts/polygon/deploy-staking.ts --network polygon
npx hardhat run scripts/polygon/deploy-bridge-wrapper.ts --network polygon
npx hardhat run scripts/polygon/deploy-bonds.ts --network polygon
npx hardhat run scripts/polygon/deploy-swc-v2.ts --network polygon
npx hardhat run scripts/polygon/deploy-swc-v3.ts --network polygon
npx hardhat run scripts/polygon/deploy-staking-rewards-v2.ts --network polygon
npx hardhat run scripts/polygon/migrate-to-swc-v3.ts --network polygon

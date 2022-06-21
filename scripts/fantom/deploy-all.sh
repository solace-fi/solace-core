# runs all deploy scripts in order

npx hardhat run scripts/fantom/deploy-deployer.ts --network fantom
npx hardhat run scripts/fantom/deploy-staking.ts --network fantom
npx hardhat run scripts/fantom/deploy-bridge-wrapper.ts --network fantom
npx hardhat run scripts/fantom/deploy-bonds.ts --network fantom
npx hardhat run scripts/fantom/deploy-swc-v2.ts --network fantom
npx hardhat run scripts/fantom/deploy-swc-v3.ts --network fantom
npx hardhat run scripts/fantom/deploy-staking-rewards-v2.ts --network fantom
npx hardhat run scripts/fantom/migrate-to-swc-v3.ts --network fantom

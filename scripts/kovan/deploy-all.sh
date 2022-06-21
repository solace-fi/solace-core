# runs all deploy scripts in order

npx hardhat run scripts/kovan/deploy-deployer.ts --network kovan
npx hardhat run scripts/kovan/deploy-staking.ts --network kovan
npx hardhat run scripts/kovan/deploy-xsolace-migrator.ts --network kovan
npx hardhat run scripts/kovan/deploy-faucet.ts --network kovan
npx hardhat run scripts/kovan/deploy-bonds.ts --network kovan
npx hardhat run scripts/kovan/deploy-swc-v1.ts --network kovan
npx hardhat run scripts/kovan/deploy-swc-v3.ts --network kovan
npx hardhat run scripts/kovan/deploy-staking-rewards-v2.ts --network kovan
npx hardhat run scripts/kovan/migrate-to-swc-v3.ts --network kovan

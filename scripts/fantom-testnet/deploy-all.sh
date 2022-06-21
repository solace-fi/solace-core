# runs all deploy scripts in order

npx hardhat run scripts/fantom-testnet/deploy-deployer.ts --network fantom_testnet
npx hardhat run scripts/fantom-testnet/deploy-staking.ts --network fantom_testnet
npx hardhat run scripts/fantom-testnet/deploy-faucet.ts --network fantom_testnet
npx hardhat run scripts/fantom-testnet/deploy-bridge-wrapper.ts --network fantom_testnet
npx hardhat run scripts/fantom-testnet/deploy-bonds.ts --network fantom_testnet
npx hardhat run scripts/fantom-testnet/deploy-swc-v2.ts --network fantom_testnet
npx hardhat run scripts/fantom-testnet/deploy-swc-v3.ts --network fantom_testnet
npx hardhat run scripts/fantom-testnet/deploy-staking-rewards-v2.ts --network fantom_testnet
npx hardhat run scripts/fantom-testnet/migrate-to-swc-v3.ts --network fantom_testnet

# runs all deploy scripts in order
# note: you will need to set token addresses in deploy-faucet.address, deploy-bonds.ts, and deploy-swc-v3.ts

npx hardhat run scripts/local-testnet/deploy-deployer.ts --network localhost
npx hardhat run scripts/local-testnet/deploy-registry.ts --network localhost
npx hardhat run scripts/local-testnet/deploy-staking.ts --network localhost
npx hardhat run scripts/local-testnet/deploy-faucet.ts --network localhost
npx hardhat run scripts/local-testnet/deploy-bonds.ts --network localhost
npx hardhat run scripts/local-testnet/deploy-swc-v1.ts --network localhost
npx hardhat run scripts/local-testnet/deploy-swc-v3.ts --network localhost
npx hardhat run scripts/local-testnet/deploy-staking-rewards-v2.ts --network localhost
npx hardhat run scripts/local-testnet/migrate-to-swc-v3.ts --network localhost

# runs all deploy scripts in order

npx hardhat run scripts/aurora-testnet/deploy-deployer.ts --network aurora_testnet
npx hardhat run scripts/aurora-testnet/deploy-staking.ts --network aurora_testnet
npx hardhat run scripts/aurora-testnet/deploy-faucet.ts --network aurora_testnet
npx hardhat run scripts/aurora-testnet/deploy-bridge-wrapper.ts --network aurora_testnet
npx hardhat run scripts/aurora-testnet/deploy-bonds.ts --network aurora_testnet

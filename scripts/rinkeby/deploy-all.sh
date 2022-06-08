# runs all deploy scripts in order

npx hardhat run scripts/rinkeby/deploy-deployer.ts --network rinkeby
npx hardhat run scripts/rinkeby/deploy-staking.ts --network rinkeby
npx hardhat run scripts/rinkeby/deploy-xsolace-migrator.ts --network rinkeby
npx hardhat run scripts/rinkeby/deploy-faucet.ts --network rinkeby
npx hardhat run scripts/rinkeby/deploy-bonds.ts --network rinkeby
npx hardhat run scripts/rinkeby/deploy-swc-v1.ts --network rinkeby

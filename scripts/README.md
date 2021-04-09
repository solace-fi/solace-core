# Deploying the contracts
You can deploy in the `localhost` network following these steps:
1. Start a local node
`npx hardhat node`

2. Open a new terminal and deploy the smart contracts in the `localhost` network
`npx hardhat run --network localhost scripts/deploy.js`

As general rule, you can target any network configured in the `hardhat.config.js`
`npx hardhat run --network <your-network> scripts/deploy.js`
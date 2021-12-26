# Deploying the contracts
You can deploy in the `localhost` network following these steps:
1. Start a local node  
`npx hardhat node`

2. Open a new terminal and deploy the smart contracts in the `localhost` network  
`npx hardhat run --network localhost scripts/deploy.ts`

As general rule, you can target any network configured in the `hardhat.config.ts`  
`npx hardhat run --network <your-network> scripts/<your-script>.ts`

# Preprocessing Contracts
Many tools such as Etherscan, Slither, and MythX require contracts to be preprocessed before they can be used. This includes flattening and correcting licensing amongst other things. You're welcome to process them manually, but if not:
```
python3 scripts/process_contracts.py
```

You can switch between using the source files and the preprocessed files by setting the `USE_PROCESSED_FILES` flag in `.env` to true or false.

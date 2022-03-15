# use this script to rerun the compile & coverage scripts then upload the results to AWS

# npm & hardhat
npm i
npx hardhat compile
npx hardhat coverage
# upload coverage
aws s3 rm s3://share.solace.fi/test_coverage/ --recursive
aws s3 cp --recursive coverage/ s3://share.solace.fi/test_coverage/
# upload abis
python process_abis.py
#python scripts/process_abis.py
aws s3 rm s3://share.solace.fi/abi/ --recursive
aws s3 cp --recursive abi/ s3://share.solace.fi/abi/

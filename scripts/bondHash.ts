import hardhat from "hardhat";
const { ethers } = hardhat;

//const BOND_DEPO_ADDRESS             = "0x501ACe81445C57fC438B358F861d3774199cE13c";
const DAI_BOND_TELLER_ADDRESS       = "0x501ACe677634Fd09A876E88126076933b686967a";

var keccak256 = ethers.utils.keccak256;
var getCreate2Address = ethers.utils.getCreate2Address;

let found: any[] = [
  // USDC
  {"salt":"0x00000000000000000000000000000000000000000000000000000000019004c0","address":"0x501ACE7E977e06A3Cb55f9c28D5654C9d74d5cA9"},
  // WBTC
  {"salt":"0x0000000000000000000000000000000000000000000000000000000001f0cd1b","address":"0x501aCEF0d0c73BD103337e6E9Fd49d58c426dC27"},
  // USDT
  {"salt":"0x0000000000000000000000000000000000000000000000000000000002153a56","address":"0x501ACe5CeEc693Df03198755ee80d4CE0b5c55fE"},
  // SCP
  {"salt":"0x000000000000000000000000000000000000000000000000000000000244cea9","address":"0x501ACe00FD8e5dB7C3be5e6D254ba4995e1B45b7"}
]
async function main () {
  console.log('hashing');
  // create initcode
  let initCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${DAI_BOND_TELLER_ADDRESS.substring(2)}5af43d82803e903d91602b57fd5bf3`;
  // hash the initCode
  var initCodeHash = keccak256(initCode);
  // loop over possible salts
  for (var i = 38063786; i < 72057594037927936; i++) {
    var saltToBytes = '0x'+i.toString(16).padStart(64, '0');
    let resultAddress = getCreate2Address(DAI_BOND_TELLER_ADDRESS, saltToBytes, initCodeHash);
    if(i % 1000000 == 0) console.log(`${i} -> ${resultAddress}`);
    if (resultAddress.substring(0,8).toLowerCase() == '0x501ace') {
      console.log(`${i} ${saltToBytes} -> ${resultAddress}`);
      found.push({'salt':saltToBytes, 'address':resultAddress});
      if(found.length >= 4) {
        console.log(JSON.stringify(found));
        return;
      }
    }
  }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

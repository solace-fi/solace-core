import hardhat from "hardhat";
const { ethers } = hardhat;
import { BigNumber as BN } from "ethers";

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
  {"salt":"0x000000000000000000000000000000000000000000000000000000000244cea9","address":"0x501ACe00FD8e5dB7C3be5e6D254ba4995e1B45b7"},
  // FRAX
  {"salt":"0x0000000000000000000000000000000000000000000000000000000002e3569f","address":"0x501aCef4F8397413C33B13cB39670aD2f17BfE62"},
  // WETH (used on chains where eth is not native token)
  {"salt":"0x0000000000000000000000000000000000000000000000000000000003ba0308","address":"0x501Ace367f1865DEa154236D5A8016B80a49e8a9"},
  // NEAR
  {"salt":"0x0000000000000000000000000000000000000000000000000000000004843332","address":"0x501aCe71a83CBE03B1467a6ffEaeB58645d844b4"},
  // AURORA
  {"salt":"0x0000000000000000000000000000000000000000000000000000000005201ba9","address":"0x501Ace35f0B7Fad91C199824B8Fe555ee9037AA3"}
]

let numToFind = 8;
let nextSalt = 62522121;
let maxSalt = 72057594037927936;

async function main () {
  if(found.length >= numToFind) {
    console.log(JSON.stringify(found));
    return;
  }
  console.log('hashing');
  // create initcode
  let initCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${DAI_BOND_TELLER_ADDRESS.substring(2)}5af43d82803e903d91602b57fd5bf3`;
  // hash the initCode
  var initCodeHash = keccak256(initCode);
  // no redundant salts
  for(var i = 0; i < found.length; ++i) {
    nextSalt = Math.max(nextSalt, BN.from(found[i].salt).toNumber()+1);
  }
  // loop over possible salts
  for (var i = nextSalt; i < maxSalt; i++) {
    var saltToBytes = '0x'+i.toString(16).padStart(64, '0');
    let resultAddress = getCreate2Address(DAI_BOND_TELLER_ADDRESS, saltToBytes, initCodeHash);
    if(i % 1000000 == 0) console.log(`${i} -> ${resultAddress}`);
    if (resultAddress.substring(0,8).toLowerCase() == '0x501ace') {
      console.log(`${i} ${saltToBytes} -> ${resultAddress}`);
      found.push({'salt':saltToBytes, 'address':resultAddress});
      if(found.length >= numToFind) {
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

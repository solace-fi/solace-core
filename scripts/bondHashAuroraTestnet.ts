import hardhat from "hardhat";
const { ethers } = hardhat;

const DAI_BOND_TELLER_ADDRESS       = "0x501acED0B949D96B3289A1b37791cA8bD93B0D65";

var keccak256 = ethers.utils.keccak256;
var getCreate2Address = ethers.utils.getCreate2Address;

let found: any[] = [
  // USDC
  {"salt":"0x000000000000000000000000000000000000000000000000000000000198cbbd","address":"0x501AcE2248c1bB34f709f2768263A64A9805cCdB"},
  // WBTC
  {"salt":"0x000000000000000000000000000000000000000000000000000000000298a83b","address":"0x501Ace54C7a2Cf564ae37538053902550a859D39"},
  // USDT
  {"salt":"0x0000000000000000000000000000000000000000000000000000000003b1f978","address":"0x501aCEa6ff6dcE05D108D616cE886AF74f00EAAa"},
  // FRAX
  {"salt":"0x0000000000000000000000000000000000000000000000000000000003de1cf9","address":"0x501acE87fF4E7A1498320ABB674a4960A87792E4"}
]

let numToFind = 4;
let nextSalt = 64888058;
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

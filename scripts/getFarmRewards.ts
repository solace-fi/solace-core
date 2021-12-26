import hardhat from "hardhat";
const { waffle, ethers } = hardhat;
const { provider } = waffle;
const BN = ethers.BigNumber;
import { config as dotenv_config } from "dotenv";
dotenv_config();

import { readFileSync, writeFileSync } from "fs";
import { import_artifacts, ArtifactImports } from "./../test/utilities/artifact_importer";
import { FarmController } from "../typechain";

const ONE_SOLACE = BN.from("1000000000000000000");
const SOLACE_PER_XSOLACE = BN.from("21338806133989362485"); // as of midnight before December 2, 2021

async function main() {
  var artifacts = await import_artifacts();

  var blockNumber = 13717847; // first block after midnight UTC before December 1, 2021
  const FARM_CONTROLLER_ADDRESS   = "0x501aCEDD1a697654d5F53514FF09eDECD3ca6D95";
  var farmController = (await ethers.getContractAt(artifacts.FarmController.abi, FARM_CONTROLLER_ADDRESS)) as FarmController;
  //console.log(farmController);

  var farmers: string[] = JSON.parse(readFileSync("./stash/cp farmers.json").toString());
  console.log(farmers);

  var solaceRewards = [];
  var xsolaceRewards = [];
  var solaceRewardsSum = BN.from(0);
  var xsolaceRewardsSum = BN.from(0);

  for(var i = 0; i < farmers.length; ++i) {
    var user = farmers[i];
    var solaceReward = await farmController.pendingRewards(user, { blockTag: blockNumber });
    var xsolaceReward = solaceReward.mul(ONE_SOLACE).div(SOLACE_PER_XSOLACE);
    var solaceReward2 = solaceReward.toString();
    var xsolaceReward2 = xsolaceReward.toString();
    console.log(`${user} -> ${solaceReward2},   ${xsolaceReward2}`);
    solaceRewards.push(solaceReward2);
    xsolaceRewards.push(xsolaceReward2);
    solaceRewardsSum = solaceRewardsSum.add(solaceReward);
    xsolaceRewardsSum = xsolaceRewardsSum.add(xsolaceReward);
  }
  console.log(solaceRewards);
  console.log(xsolaceRewards);
  console.log(solaceRewardsSum.toString());  // 4223807925576381028653499 = 4,223,807
                                             // 4250000000000000000000000
  console.log(xsolaceRewardsSum.toString()); //  197940217416780371255812 =   197,940
  writeFileSync("./stash/cp farm rewards.json", JSON.stringify(xsolaceRewards));
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
  });

// even out solace-xsolace rate across networks
/*
BN.from("21338806133989362485").mul()

mainnet
      1000000000000000000
6909621137929961996602546
 323805422596910054544270

rinkeby
 570007928610890475799484
 541438469780301526958642

kovan
 500000000000000000000000
 500000000000000000000000

s1 = BN.from("6909621137929961996602546")
x1 = BN.from("323805422596910054544270")

s2 = BN.from("570007928610890475799484")
x2 = BN.from("541438469780301526958642")

s3 = BN.from("500000000000000000000000")
x3 = BN.from("500000000000000000000000")

s1/x1 = (s2+sd)/x2
sd = s1*x2/x1 - s2
sd = s1.mul(x2).div(x1).sub(s2)
s2.add(sd).mul(ONE_SOLACE).div(x2).toString()
sd.add(s2).toString()

sd = s1.mul(x3).div(x1).sub(s3)
s3.add(sd).mul(ONE_SOLACE).div(x3).toString()
sd.add(s3).toString()
*/

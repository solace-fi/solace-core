var SolaceToken = artifacts.require("./SolaceToken.sol");

module.exports = function(deployer) {
  deployer.deploy(SolaceToken);
};
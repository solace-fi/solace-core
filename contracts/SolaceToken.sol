pragma solidity >=0.4.22 <0.8.0;

import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";
// import "@openzeppelin/contracts/access/Ownable.sol";

contract SolaceToken is ERC20PresetMinterPauser('SolaceToken', 'SOLACE') {
    
}
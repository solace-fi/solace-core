pragma solidity >=0.4.22 <0.8.0;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
// import "openzeppelin-solidity-2.3.0/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SolaceToken.sol";

/// @title Master: owner of solace.fi
/// @author Nikita S. Buzov
/// @notice This contract can mint SOLACE tokens and control the SOLACE Protocol.
///         The ownership will be transferred to a governance smart contract once
///         SOLACE is sufficiently distributed and the community can govern itself.

contract Master is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    SolaceToken public _solace; // native SOLACE token
    adress public devaddress; // developer's address


    /* ========== CONSTRUCTOR ========== */

    constructor(
        SolaceToken _solace,
        address _devaddr,
    ) public {
        
    }

    /* ========== VIEWS ========== */



    /* ========== MUTATIVE FUNCTIONS ========== */


   
    /* ========== RESTRICTED FUNCTIONS ========== */

   

    /* ========== MODIFIERS ========== */



    /* ========== EVENTS ========== */

    
}

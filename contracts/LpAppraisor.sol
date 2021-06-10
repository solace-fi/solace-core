// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.0;

import "./interface/IUniswapLpToken.sol";
import "./interface/ILpAppraisor.sol";

contract LpAppraisor is ILpAppraisor {

    /// @notice Governor.
    address public governance;

    /// @notice Governance to take over.
    address public newGovernance;

    IUniswapLpToken public lpToken;

    /*
    * The following variables can be used to tune the appraisal curve.
    * See the Solace.fi UniswapLpFarm paper for more info.
    */
    uint256 public curve_A; // default 20000
    //uint256 public curve_B; // default 40000
    uint256 public curve_B2;

    // Emitted when Governance is set
    event GovernanceTransferred(address _newGovernance);

    constructor(
        address _governance,
        address _lpToken,
        uint256 _curve_A,
        uint256 _curve_B
    ) {
        governance = _governance;
        lpToken = IUniswapLpToken(_lpToken);
        curve_A = _curve_A;
        //curve_B = _curve_B;
        curve_B2 = _curve_B**2;
    }

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }

    /**
     * @notice Modifies the appraisal curve, and with it the incentive structure.
     * @param _curve_A The curve parameter A.
     * @param _curve_B The curve parameter B.
     */
    function setCurve(uint256 _curve_A, uint256 _curve_B) external {
        require(msg.sender == governance, "!governance");
        curve_A = _curve_A;
        //curve_B = _curve_B;
        curve_B2 = _curve_B**2;
    }

    /**
     * @notice Appraise a Uniswap LP Token.
     * Token must exist and must exist in the correct pool.
     * @param _tokenId The id of the token to appraise.
     * @return _value The token's value.
     */
    function appraise(uint256 _tokenId) external view override returns (uint256 _value) {
        // get position
        ( , , , , , int24 tickLower, int24 tickUpper, uint128 liquidity, , , , )
        = lpToken.positions(_tokenId);
        // appraise
        uint256 width = (uint256(int256(tickUpper - tickLower)));
        _value = liquidity * width;
        if (width > curve_A) {
            _value = _value * curve_B2 / ( (width-curve_A)**2 + curve_B2);
        }
    }
}

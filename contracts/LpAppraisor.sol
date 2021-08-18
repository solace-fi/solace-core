// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./interface/IUniswapLpToken.sol";
import "./interface/ILpAppraisor.sol";

contract LpAppraisor is ILpAppraisor, Governable {

    IUniswapLpToken public lpToken;

    /*
    * The following variables can be used to tune the appraisal curve.
    * See the Solace.fi UniswapLpFarm paper for more info.
    */
    uint256 public curve_A; // default 20000
    //uint256 public curve_B; // default 40000
    uint256 public curve_B2;

    constructor(
        address _governance,
        address _lpToken,
        uint256 _curve_A,
        uint256 _curve_B
    ) Governable(_governance) {
        lpToken = IUniswapLpToken(_lpToken);
        curve_A = _curve_A;
        //curve_B = _curve_B;
        curve_B2 = _curve_B**2;
    }

    /**
     * @notice Modifies the appraisal curve, and with it the incentive structure.
     * @param _curve_A The curve parameter A.
     * @param _curve_B The curve parameter B.
     */
    function setCurve(uint256 _curve_A, uint256 _curve_B) external onlyGovernance {
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

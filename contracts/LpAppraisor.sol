// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "./Governable.sol";
import "./interface/ILpAppraisor.sol";

/**
 * @title LpAppraisor
 * @author solace.fi
 * @notice Determines the relative value of a Uniswap V3 LP token. Used in [SolaceEthLpFarm](./SolaceEthLpFarm).
 */
contract LpAppraisor is ILpAppraisor, Governable {

    /// @notice The address of the Uniswap V3 NFT.
    IUniswapLpToken public override lpToken;

    // The following variables can be used to tune the appraisal curve.
    // See the Solace.fi UniswapLpFarm paper for more info.
    uint256 public curve_A; // default 20000
    //uint256 public curve_B; // default 40000
    uint256 public curve_B2; // square of B

    /**
     * @notice Constructs the LP Appraisor contract.
     * @param governance_ The address of the [governor](/docs/user-docs/Governance).
     * @param lpToken_ Address of the LP token.
     * @param curve_A_ Appraisal curve value A.
     * @param curve_B_ Appraisal curve value B.
     */
    constructor(
        address governance_,
        address lpToken_,
        uint256 curve_A_,
        uint256 curve_B_
    ) Governable(governance_) {
        lpToken = IUniswapLpToken(lpToken_);
        curve_A = curve_A_;
        curve_B2 = curve_B_**2;
    }

    /**
     * @notice Modifies the appraisal curve, and with it the incentive structure.
     * Can only be called by the current [**governor**](/docs/user-docs/Governance).
     * @param curve_A_ The curve parameter A.
     * @param curve_B_ The curve parameter B.
     */
    function setCurve(uint256 curve_A_, uint256 curve_B_) external onlyGovernance {
        curve_A = curve_A_;
        curve_B2 = curve_B_**2;
    }

    /**
     * @notice Appraise a Uniswap LP Token.
     * Token must exist and must exist in the correct pool.
     * @param tokenID The ID of the token to appraise.
     * @return value The token's value.
     */
    function appraise(uint256 tokenID) external view override returns (uint256 value) {
        // get position
        ( , , , , , int24 tickLower, int24 tickUpper, uint128 liquidity, , , , )
        = lpToken.positions(tokenID);
        // appraise
        uint256 width = (uint256(int256(tickUpper - tickLower)));
        value = liquidity * width;
        if (width > curve_A) {
            value = value * curve_B2 / ( (width-curve_A)**2 + curve_B2);
        }
        return value;
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import "../BaseStrategy.sol";


/**
 * @title MockStrategy
 * @author solace.fi
 * @notice Mock strategy for testing purposes
 */
contract MockStrategy is BaseStrategy {

    address public constant protectedToken = address(0xbad);

    constructor(address _vault) BaseStrategy(_vault) {}

    function estimatedTotalAssets() public override view returns (uint256) {
        // for testing purposes, total assets will simply be the `want` balance
        return want.balanceOf(address(this));
    }

    function liquidatePosition(uint256 _amountNeeded) internal override returns (uint256 _liquidatedAmount, uint256 _loss) {
        uint256 totalDebt = vault.strategies(address(this)).totalDebt;
        uint256 totalAssets = want.balanceOf(address(this));
        if (_amountNeeded > totalAssets) {
            _liquidatedAmount = totalAssets;
            _loss = _amountNeeded - totalAssets;
        } else {
            // NOTE: Just in case something was stolen from this contract
            if (totalDebt > totalAssets) {
                _loss = min(totalDebt - totalAssets, _amountNeeded);
            }
            _liquidatedAmount = _amountNeeded;
        }
    }

    function prepareReturn(uint256 _debtOutstanding)
        internal
        override
        returns (
            uint256 _profit,
            uint256 _loss,
            uint256 _debtPayment
        )
    {
        // During testing, send this contract some tokens to simulate "Rewards"
        uint256 totalAssets = want.balanceOf(address(this));
        uint256 totalDebt = vault.strategies(address(this)).totalDebt;
        if (totalAssets > _debtOutstanding) {
            _debtPayment = _debtOutstanding;
            totalAssets -= _debtOutstanding;
        } else {
            _debtPayment = totalAssets;
            totalAssets = 0;
        }
        totalDebt -= _debtPayment;

        if (totalAssets > totalDebt) {
            _profit = totalAssets - totalDebt;
        } else {
            _loss = totalDebt - totalAssets;
        }
    }

    function adjustPosition(uint256 _debtOutstanding) internal override {
        // Whatever we have "free", consider it "invested" now
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    // NOTE: test-only function to simulate losses
    function _takeFunds(uint256 amount) public {
        want.transfer(msg.sender, amount);
    }

    // NOTE: test-only function to test reports
    function _report(uint256 gain, uint256 loss, uint256 _debtPayment) public {
        vault.report(gain, loss, _debtPayment);
    }

    // NOTE: test-only functions to test reports
    uint256 private _delegatedAssets;

    function delegatedAssets() external view override returns (uint256) {
        return _delegatedAssets;
        //return BaseStrategy(address(this)).delegatedAssets() + _delegatedAssets;
        //return super.delegatedAssets() + _delegatedAssets;
        //return BaseStrategy.delegatedAssets() + _delegatedAssets;
    }

    function setDelegatedAssets(uint256 _amount) external {
        _delegatedAssets = _amount;
    }
}

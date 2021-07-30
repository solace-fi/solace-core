// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

/**
 * @dev Standard math utilities missing in the Solidity language.
 * min() and max() are borrowed from openzeppelin/contracts
 * sqrt() is borrowed from stack overflow
 *
 */
library Math {
    /**
     * @dev Returns the largest of two numbers.
     */
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }

    /**
     * @dev Returns the smallest of two numbers.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /**
     * @dev Returns the square root of a number.
     */
    function sqrt(uint256 x) internal pure returns (uint256 y) {
        // babylonian method
        if (x == 0) return 0;
        else if (x <= 3) return 1;
        uint z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}

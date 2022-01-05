// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
//import "@openzeppelin/contracts/proxy/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Governable.sol";
//import "./interface/IxsLocker.sol";
import "./interface/IxsListener.sol";
import "./interface/IxSOLACE.sol";


/**
 * @title xSolace Token (xSOLACE)
 * @author solace.fi
 * @notice V2 of the **SOLACE** staking contract.
 */
contract xSOLACE is /*IxSOLACE,*/ ERC20, ReentrancyGuard, Governable {
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public constant MAXTIME = 4 * (365 days);
    uint256 public constant MULTIPLIER = 1e18;

    address public xsLocker;
    mapping(uint256 => int128) public slopeChanges;
    Point[] public pointHistory;
    mapping(uint256 => Point[]) public lockPointHistory;

    EnumerableSet.AddressSet private _listeners;

    modifier onlyXSLock() {
        require(
            msg.sender == xsLocker,
            "Only ve lock contract can call this."
        );
        _;
    }

    constructor(address governance_) ERC20("xsolace", "xSOLACE") Governable(governance_) {

    }

    function initialize(
        address xsLocker_
    ) public /*initializer*/ {
        xsLocker = xsLocker_;
    }

    function checkpoint(uint256 maxRecord) external {
        _recordPointHistory(maxRecord);
    }

    function checkpoint(
        uint256 xsLockID,
        Lock calldata oldLock,
        Lock calldata newLock
    ) external onlyXSLock {
        // Record history
        _recordPointHistory(0);

        // Compute points
        (Point memory oldLockPoint, Point memory newLockPoint) =
            _computePointsFromLocks(oldLock, newLock);

        _updateLastPoint(oldLockPoint, newLockPoint);

        _recordLockPointHistory(
            xsLockID,
            oldLock,
            newLock,
            oldLockPoint,
            newLockPoint
        );

        // register action with listener
        address owner = IERC721Enumerable(xsLocker).ownerOf(xsLockID);
        uint256 balance = balanceOf(owner);
        uint256 len = _listeners.length();
        for(uint256 i = 0; i < len; i++) {
            IxsListener(_listeners.at(i)).registerUserAction(owner, balance);
        }
    }

    // View functions

    function balanceOf(address account) public view override returns (uint256 balance) {
        uint256 numOfLocks = IERC721Enumerable(xsLocker).balanceOf(account);
        balance = 0;
        for (uint256 i = 0; i < numOfLocks; i++) {
            uint256 xsLockID = IERC721Enumerable(xsLocker).tokenOfOwnerByIndex(account, i);
            balance += balanceOfLock(xsLockID);
        }
        return balance;
    }

    function balanceOfAt(address account, uint256 timestamp) public view returns (uint256 balance) {
        uint256 numOfLocks = IERC721Enumerable(xsLocker).balanceOf(account);
        balance = 0;
        for (uint256 i = 0; i < numOfLocks; i++) {
            uint256 xsLockID = IERC721Enumerable(xsLocker).tokenOfOwnerByIndex(account, i);
            balance += balanceOfLockAt(xsLockID, timestamp);
        }
        return balance;
    }

    function balanceOfLock(uint256 xsLockID) public view returns (uint256 balance) {
        return balanceOfLockAt(xsLockID, block.timestamp);
    }

    function balanceOfLockAt(uint256 xsLockID, uint256 timestamp) public view returns (uint256 balance) {
        (bool success, Point memory point) =
            _searchClosestPoint(lockPointHistory[xsLockID], timestamp);
        if (success) {
            int128 bal =
                point.bias -
                    point.slope *
                    (toInt128(timestamp) - toInt128(point.timestamp));
            return bal > 0 ? toUint256(bal) : 0;
        } else {
            return 0;
        }
    }

    function totalSupply() public view override returns (uint256 supply) {
        return totalSupplyAt(block.timestamp);
    }

    function totalSupplyAt(uint256 timestamp) public view returns (uint256 supply) {
        (bool success, Point memory point) =
            _searchClosestPoint(pointHistory, timestamp);
        if (success) {
            return _computeSupplyFrom(point, timestamp);
        } else {
            return 0;
        }
    }

    // checkpoint() should be called if it emits out of gas error.
    function _computeSupplyFrom(Point memory point, uint256 timestamp) internal view returns (uint256 supply) {
        require(point.timestamp <= timestamp, "scan only to the rightward");
        Point memory point_ = point;
        uint256 x = (point.timestamp / 1 weeks) * 1 weeks;

        // find the closest point
        do {
            x = Math.min(x + 1 weeks, timestamp);
            uint256 delta = x - point.timestamp; // always greater than 0
            point_.timestamp = x;
            point_.bias -= (point_.slope) * toInt128(delta);
            point_.slope += slopeChanges[x];
            if(point_.bias < 0) point_.bias = 0;
            if(point_.slope < 0) point_.slope = 0;
        } while (timestamp != x);
        int128 y = point_.bias - point_.slope * toInt128(timestamp - x);
        return y > 0 ? toUint256(y) : 0;
    }

    function _computePointsFromLocks(Lock memory oldLock, Lock memory newLock) internal view returns (Point memory oldPoint, Point memory newPoint) {
        if (oldLock.end > block.timestamp && oldLock.amount > 0) {
            oldPoint.slope = toInt128(oldLock.amount / MAXTIME);
            oldPoint.bias =
                oldPoint.slope *
                toInt128(oldLock.end - block.timestamp);
        }
        if (newLock.end > block.timestamp && newLock.amount > 0) {
            newPoint.slope = toInt128(newLock.amount / MAXTIME);
            newPoint.bias =
                newPoint.slope *
                toInt128((newLock.end - block.timestamp));
        }
    }

    function _recordPointHistory(uint256 maxRecord) internal {
        // last_point: Point = Point({bias: 0, slope: 0, ts: block.timestamp})
        Point memory point_;
        // Get the latest right most point
        if (pointHistory.length > 0) {
            point_ = pointHistory[pointHistory.length - 1];
        } else {
            point_ = Point({bias: 0, slope: 0, timestamp: block.timestamp});
        }

        // fill history
        uint256 timestamp = block.timestamp;
        uint256 x = (point_.timestamp / 1 weeks) * 1 weeks;
        // record intermediate histories
        uint256 i = 0;
        do {
            x = Math.min(x + 1 weeks, timestamp);
            uint256 delta = Math.min(timestamp - x, 1 weeks);
            point_.timestamp = x;
            point_.bias -= (point_.slope) * toInt128(delta);
            point_.slope += slopeChanges[x];
            if(point_.bias < 0) point_.bias = 0;
            if(point_.slope < 0) point_.slope = 0;
            pointHistory.push(point_);
            i++;
        } while (timestamp != x && i != maxRecord);
    }

    function _recordLockPointHistory(
        uint256 xsLockID,
        Lock memory oldLock,
        Lock memory newLock,
        Point memory oldPoint,
        Point memory newPoint
    ) internal {
        require(
            (oldLock.end / 1 weeks) * 1 weeks == oldLock.end,
            "should be exact epoch timestamp"
        );
        require(
            (newLock.end / 1 weeks) * 1 weeks == newLock.end,
            "should be exact epoch timestamp"
        );
        int128 oldSlope = slopeChanges[oldLock.end];
        int128 newSlope;
        if (newLock.end != 0) {
            if (newLock.end == oldLock.end) {
                newSlope = oldSlope;
            } else {
                newSlope = slopeChanges[newLock.end];
            }
        }
        if (oldLock.end > block.timestamp) {
            oldSlope += oldPoint.slope;
            if (newLock.end == oldLock.end) {
                oldSlope -= newPoint.slope;
            }
            slopeChanges[oldLock.end] = oldSlope;
        }
        if (newLock.end > block.timestamp) {
            if (newLock.end > oldLock.end) {
                newSlope -= newPoint.slope;
                slopeChanges[newLock.end] = newSlope;
            }
        }
        newPoint.timestamp = block.timestamp;
        lockPointHistory[xsLockID].push(newPoint);
    }

    function _updateLastPoint(
        Point memory oldLockPoint,
        Point memory newLockPoint
    ) internal {
        if (pointHistory.length == 0) {
            pointHistory.push(
                Point({bias: 0, slope: 0, timestamp: block.timestamp})
            );
        }
        Point memory newLastPoint =
            _computeTheLatestSupplyGraphPoint(
                oldLockPoint,
                newLockPoint,
                pointHistory[pointHistory.length - 1]
            );
        pointHistory[pointHistory.length - 1] = newLastPoint;
    }

    function _computeTheLatestSupplyGraphPoint(
        Point memory oldLockPoint,
        Point memory newLockPoint,
        Point memory lastPoint
    ) internal pure returns (Point memory newLastPoint) {
        newLastPoint = lastPoint;
        newLastPoint.slope += (newLockPoint.slope - oldLockPoint.slope);
        newLastPoint.bias += (newLockPoint.bias - oldLockPoint.bias);
        if (newLastPoint.slope < 0) {
            newLastPoint.slope = 0;
        }
        if (newLastPoint.bias < 0) {
            newLastPoint.bias = 0;
        }
    }

    function _searchClosestPoint(Point[] storage history, uint256 timestamp) internal view returns (bool success, Point memory point) {
        require(timestamp <= block.timestamp, "Only past blocks");
        if (history.length == 0) {
            return (false, point);
        } else if (timestamp < history[0].timestamp) {
            // block num is before the first lock
            return (false, point);
        } else if (timestamp == block.timestamp) {
            return (true, history[history.length - 1]);
        }
        // binary search
        uint256 min = 0;
        uint256 max = history.length - 1;
        uint256 mid;
        for (uint256 i = 0; i < 128; i++) {
            if (min >= max) {
                break;
            }
            mid = (min + max + 1) / 2;
            if (history[mid].timestamp <= timestamp) {
                min = mid;
            } else {
                max = mid - 1;
            }
        }
        return (true, history[min]);
    }

    function _beforeTokenTransfer(
        address,
        address,
        uint256
    ) internal pure override {
        revert("Non-transferrable. You can only transfer locks.");
    }

    /**
     * @notice Safely casts a uint256 to an int128.
     * @param numIn The number to cast.
     * @return numOut The casted number.
     */
    function toInt128(uint256 numIn) internal pure returns (int128 numOut) {
        return SafeCast.toInt128(SafeCast.toInt256(numIn));
    }

    /**
     * @notice Safely casts an int128 to a uint256.
     * @param numIn The number to cast.
     * @return numOut The casted number.
     */
    function toUint256(int128 numIn) internal pure returns (uint256 numOut) {
        return SafeCast.toUint256(int256(numIn));
    }

    function addListener(address listener) external onlyGovernance {
        _listeners.add(listener);
    }

    function removeListener(address listener) external onlyGovernance {
        _listeners.remove(listener);
    }
}

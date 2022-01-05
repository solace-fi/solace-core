// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

import "./ERC721Enhanced.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
//import "@openzeppelin/contracts/proxy/Initializable.sol";

//import "../../../core/governance/Governed.sol";
//import "../../../core/governance/libraries/VotingEscrowToken.sol";
//import "../../../core/governance/interfaces/IVotingEscrowLock.sol";
import "./Governable.sol";
import "./interface/IxSOLACE.sol";

contract xsLocker is ERC721Enhanced, ReentrancyGuard, /*Initializable,*/ Governable {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableMap for EnumerableMap.UintToAddressMap;

    event LockCreated(uint256 xsLockID);
    event LockUpdate(uint256 xsLockID, uint256 amount, uint256 end);
    event Withdraw(uint256 xsLockID, uint256 amount);
    event VoteDelegated(uint256 xsLockID, address to);

    uint256 public constant MAXTIME = 4 * (365 days);

    address public baseToken;
    address public veToken;
    uint256 public totalLockedSupply;

    mapping(uint256 => Lock) public locks;

    mapping(address => EnumerableSet.UintSet) private _delegated;
    EnumerableMap.UintToAddressMap private _rightOwners;

    modifier onlyOwner(uint256 xsLockID) {
        require(
            ownerOf(xsLockID) == msg.sender,
            "Only the owner can call this function"
        );
        _;
    }

    constructor(address governance_) ERC721Enhanced("xsolace lock", "xsLOCK") Governable(governance_) {

    }

    function initialize(
        address baseToken_,
        address veToken_
    ) public /*initializer*/ {
        baseToken = baseToken_;
        veToken = veToken_;
    }

    function createLock(uint256 amount, uint256 epochs) public {
        uint256 until = block.timestamp + epochs * 1 weeks;
        createLockUntil(amount, until);
    }

    function createLockUntil(uint256 amount, uint256 lockEnd) public {
        require(amount > 0, "should be greater than zero");
        uint256 xsLockID =
            uint256(keccak256(abi.encodePacked(block.number, msg.sender)));
        require(!_exists(xsLockID), "Already exists");
        locks[xsLockID].start = block.timestamp;
        _safeMint(msg.sender, xsLockID);
        _updateLock(xsLockID, amount, lockEnd);
        emit LockCreated(xsLockID);
    }

    function increaseAmount(uint256 xsLockID, uint256 amount)
        public
        onlyOwner(xsLockID)
    {
        require(amount > 0, "should be greater than zero");
        uint256 newAmount = locks[xsLockID].amount + amount;
        _updateLock(xsLockID, newAmount, locks[xsLockID].end);
    }

    function extendLock(uint256 xsLockID, uint256 epochs)
        public
        onlyOwner(xsLockID)
    {
        uint256 until = block.timestamp + epochs * 1 weeks;
        extendLockUntil(xsLockID, until);
    }

    function extendLockUntil(uint256 xsLockID, uint256 end)
        public
        onlyOwner(xsLockID)
    {
        _updateLock(xsLockID, locks[xsLockID].amount, end);
    }

    function withdraw(uint256 xsLockID) public onlyOwner(xsLockID) {
        Lock memory lock = locks[xsLockID];
        require(block.timestamp >= lock.end, "Locked.");
        // transfer
        SafeERC20.safeTransfer(IERC20(baseToken), msg.sender, lock.amount);
        totalLockedSupply -= lock.amount;
        IxSOLACE(veToken).checkpoint(xsLockID, lock, Lock(0, 0, 0));
        locks[xsLockID].amount = 0;
        emit Withdraw(xsLockID, lock.amount);
    }

    function delegate(uint256 xsLockID, address to)
        external
        onlyOwner(xsLockID)
    {
        _delegate(xsLockID, to);
    }

    function delegateeOf(uint256 xsLockID)
        public
        view
        returns (address)
    {
        if (!_exists(xsLockID)) {
            return address(0);
        }
        (bool delegated_, address delegatee) = _rightOwners.tryGet(xsLockID);
        return delegated_ ? delegatee : ownerOf(xsLockID);
    }

    function delegatedRights(address voter)
        public
        view
        returns (uint256)
    {
        require(
            voter != address(0),
            "VotingEscrowLock: delegate query for the zero address"
        );
        return _delegated[voter].length();
    }

    function delegatedRightByIndex(address voter, uint256 idx)
        public
        view
        returns (uint256 xsLockID)
    {
        require(
            voter != address(0),
            "VotingEscrowLock: delegate query for the zero address"
        );
        return _delegated[voter].at(idx);
    }

    function _updateLock(
        uint256 xsLockID,
        uint256 amount,
        uint256 end
    ) internal nonReentrant {
        Lock memory prevLock = locks[xsLockID];
        Lock memory newLock =
            Lock(amount, prevLock.start, (end / 1 weeks) * 1 weeks);
        require(_exists(xsLockID), "Lock does not exist.");
        require(
            prevLock.end == 0 || prevLock.end > block.timestamp,
            "Cannot update expired. Create a new lock."
        );
        require(
            newLock.end > block.timestamp,
            "Unlock time should be in the future"
        );
        require(
            newLock.end <= block.timestamp + MAXTIME,
            "Max lock is 4 years"
        );
        require(
            !(prevLock.amount == newLock.amount && prevLock.end == newLock.end),
            "No update"
        );
        require(
            prevLock.amount <= newLock.amount,
            "new amount should be greater than before"
        );
        require(
            prevLock.end <= newLock.end,
            "new end timestamp should be greater than before"
        );

        uint256 increment = (newLock.amount - prevLock.amount); // require prevents underflow
        // 2. transfer
        if (increment > 0) {
            SafeERC20.safeTransferFrom(
                IERC20(baseToken),
                msg.sender,
                address(this),
                increment
            );
            // 3. update lock amount
            totalLockedSupply += increment;
        }
        locks[xsLockID] = newLock;

        // 4. updateCheckpoint
        IxSOLACE(veToken).checkpoint(xsLockID, prevLock, newLock);
        emit LockUpdate(xsLockID, amount, newLock.end);
    }

    function _delegate(uint256 xsLockID, address to) internal {
        address voter = delegateeOf(xsLockID);
        _delegated[voter].remove(xsLockID);
        _delegated[to].add(xsLockID);
        _rightOwners.set(xsLockID, to);
        emit VoteDelegated(xsLockID, to);
    }

    function _beforeTokenTransfer(
        address,
        address to,
        uint256 xsLockID
    ) internal override {
        _delegate(xsLockID, to);
    }
}

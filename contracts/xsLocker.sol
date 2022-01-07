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
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

//import "../../../core/governance/Governed.sol";
//import "../../../core/governance/libraries/VotingEscrowToken.sol";
//import "../../../core/governance/interfaces/IVotingEscrowLock.sol";
import "./Governable.sol";
import "./interface/IxSOLACE.sol";
import "./interface/IxsLocker.sol";

contract xsLocker is IxsLocker, ERC721Enhanced, EIP712, ReentrancyGuard, /*Initializable,*/ Governable {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableMap for EnumerableMap.UintToAddressMap;

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    uint256 public constant MAXTIME = 4 * (365 days);

    address public override solace;
    address public override xsolace;
    uint256 public override totalLockedSupply;

    mapping(uint256 => Lock) private _locks;

    mapping(address => EnumerableSet.UintSet) private _delegated;
    EnumerableMap.UintToAddressMap private _rightOwners;

    EnumerableSet.AddressSet private _listeners;

    bytes32 public constant LOCK_TYPEHASH = keccak256("xSOLACE(address account,uint256 end,uint256 deadline)");

    modifier onlyOwner(uint256 xsLockID) {
        require(
            ownerOf(xsLockID) == msg.sender,
            "Only the owner can call this function"
        );
        _;
    }

    constructor(address governance_, address solace_)
        ERC721Enhanced("xsolace lock", "xsLOCK")
        EIP712("Solace.fi-xsLocker", "1")
        Governable(governance_)
    {
        require(solace_ != address(0x0), "zero address solace");
        solace = solace_;
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    function locks(uint256 xsLockID) external view override returns (Lock memory) {
        return _locks[xsLockID];
    }

    /**
     * @notice Returns the amount of **SOLACE** the user has staked.
     * @param account The account to query.
     * @return balance The user's balance.
     */
    function stakedBalance(address account) public view override returns (uint256 balance) {
        uint256 numOfLocks = balanceOf(account);
        balance = 0;
        for (uint256 i = 0; i < numOfLocks; i++) {
            uint256 xsLockID = tokenOfOwnerByIndex(account, i);
            balance += _locks[xsLockID].amount;
        }
        return balance;
    }

    function delegateeOf(uint256 xsLockID) external view returns (address) {
        if (!_exists(xsLockID)) return address(0);
        (bool delegated_, address delegatee) = _rightOwners.tryGet(xsLockID);
        return delegated_ ? delegatee : ownerOf(xsLockID);
    }

    function delegatedRights(address voter) external view returns (uint256 length) {
        require(
            voter != address(0),
            "VotingEscrowLock: delegate query for the zero address"
        );
        return _delegated[voter].length();
    }

    function delegatedRightByIndex(address voter, uint256 idx) external view returns (uint256 xsLockID) {
        require(
            voter != address(0),
            "VotingEscrowLock: delegate query for the zero address"
        );
        return _delegated[voter].at(idx);
    }

    function listeners() external view returns (address[] memory listeners_) {
        uint256 len = _listeners.length();
        listeners_ = new address[](len);
        for(uint256 index = 0; index < len; index++) {
            listeners_[index] = _listeners.at(index);
        }
        return listeners_;
    }

    /***************************************
    MUTATOR FUNCTIONS
    ***************************************/

    // deposit using approve-transfer. creates a new lock. optionally credited to another user
    // use end=0 to deposit without lock
    function createLock(address recipient, uint256 amount, uint256 end) external nonReentrant returns (uint256 xsLockID) {
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(solace), msg.sender, address(this), amount);
        // accounting
        return _createLock(recipient, amount, end);
    }

    // deposit using permit. creates a new lock
    // use end=0 to deposit without lock
    function createLock(address depositor, uint256 amount, uint256 end, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant returns (uint256 xsLockID) {
        // permit
        IERC20Permit(solace).permit(depositor, address(this), amount, deadline, v, r, s);
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(solace), depositor, address(this), amount);
        // accounting
        return _createLock(depositor, amount, end);
    }

    // deposit using approve-transfer. increments an existing lock. optionally credited to another user
    function increaseAmount(uint256 xsLockID, uint256 amount, uint256 end) external nonReentrant {
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(solace), msg.sender, address(this), amount);
        // accounting
        uint256 newAmount = _locks[xsLockID].amount + amount;
        _updateLock(xsLockID, newAmount, _locks[xsLockID].end);
    }

    // deposit using permit. increments an existing lock. optionally credited to another user
    function increaseAmount(address depositor, uint256 xsLockID, uint256 amount, uint256 end, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        // permit
        IERC20Permit(solace).permit(depositor, address(this), amount, deadline, v, r, s);
        // pull solace
        SafeERC20.safeTransferFrom(IERC20(solace), depositor, address(this), amount);
        // accounting
        uint256 newAmount = _locks[xsLockID].amount + amount;
        _updateLock(xsLockID, newAmount, _locks[xsLockID].end);
    }

    function extendLock(uint256 xsLockID, uint256 end) external onlyOwner(xsLockID) {
        _updateLock(xsLockID, _locks[xsLockID].amount, end);
    }

    // withdraw in full. optionally credited to another user
    function withdraw(uint256 xsLockID, address recipient) external onlyOwner(xsLockID) {
        require(block.timestamp >= _locks[xsLockID].end, "locked");
        _withdraw(xsLockID, _locks[xsLockID].amount);
    }

    // withdraw in part. optionally credited to another user
    function withdraw(uint256 xsLockID, address recipient, uint256 amount) external onlyOwner(xsLockID) {
        require(block.timestamp >= _locks[xsLockID].end, "locked");
        require(amount <= lock.amount, "excess withdraw");
        _withdraw(xsLockID, _amount);
    }

    function delegate(uint256 xsLockID, address to) external onlyOwner(xsLockID) {
        _delegate(xsLockID, to);
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    function _createLock(address recipient, uint256 amount, uint256 end) internal returns (uint256 xsLockID) {
        xsLockID = ++totalNumLocks;
        Lock memory newLock = Lock(amount, (end / 1 weeks) * 1 weeks);
        require(newLock.end <= block.timestamp + MAXTIME, "Max lock is 4 years");
        // accounting
        totalLockedSupply = totalLockedSupply + amount;
        _locks[xsLockID] = newLock;
        IxSOLACE(xsolace).checkpoint(xsLockID, prevLock, newLock);
        _safeMint(recipient, xsLockID);
        emit LockCreated(xsLockID);
    }

    function _updateLock(uint256 xsLockID, uint256 amount, uint256 end) internal {
        // checks
        Lock memory prevLock = _locks[xsLockID];
        Lock memory newLock = Lock(amount, (end / 1 weeks) * 1 weeks);
        require(newLock.end <= block.timestamp + MAXTIME, "Max lock is 4 years");
        require(prevLock.end <= newLock.end, "new end timestamp should be greater than before");
        // accounting
        totalLockedSupply = totalLockedSupply - prevLock.amount + amount;
        _locks[xsLockID] = newLock;
        address owner = ownerOf(xsLockID);
        _notify(xsLockID, owner, owner, prevLock, newLock);
        emit LockUpdated(xsLockID, amount, newLock.end);
    }

    function _withdraw(uint256 xsLockID, uint256 amount) internal {
        // accounting
        totalLockedSupply -= amount;
        if(amount == lock.amount) {
            _burn(xsLockID);
            delete _locks[xsLockID];
        }
        else {
            Lock memory oldLock = _locks[xsLockID];
            Lock memory newLock = Lock(oldLock.amount-amount, lock.end);
            _locks[xsLockID].amount -= amount;
            address owner = ownerOf(xsLockID);
            _notify(xsLockID, owner, owner, oldLock, newLock);
        }
        // transfer
        SafeERC20.safeTransfer(IERC20(solace), msg.sender, amount);
        emit Withdraw(xsLockID, amount);
    }

    function _delegate(uint256 xsLockID, address to) internal {
        address voter = delegateeOf(xsLockID);
        _delegated[voter].remove(xsLockID);
        _delegated[to].add(xsLockID);
        _rightOwners.set(xsLockID, to);
        emit VoteDelegated(xsLockID, to);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 xsLockID
    ) internal override {
        super._beforeTokenTransfer(from, to, xsLockID);
        _delegate(xsLockID, to);
        Lock memory lock = _locks[xsLockID];
        _notify(xsLockID, from, to, lock, lock);
    }

    function _notify(uint256 xsLockID, address oldOwner, address newOwner, Lock calldata oldLock, Lock calldata newLock) internal {
        // register action with listener
        uint256 len = _listeners.length();
        for(uint256 i = 0; i < len; i++) {
            IxsListener(_listeners.at(i)).registerLockEvent(xsLockID, oldOwner, newOwner, oldLock, newLock);
        }
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener The listener to add.
     */
    function addListener(address listener) external onlyGovernance {
        _listeners.add(listener);
        emit ListenerAdded(listener);
    }

    /**
     * @notice Removes a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener The listener to remove.
     */
    function removeListener(address listener) external onlyGovernance {
        _listeners.remove(listener);
        emit ListenerRemoved(listener);
    }

    /**
     * @notice Sets the base URI for computing `tokenURI`.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param baseURI_ The new base URI.
     */
    function setBaseURI(string memory baseURI_) external onlyGovernance {
        _setBaseURI(baseURI_);
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "./../utils/ERC721Enhanced.sol";
import "./../utils/Governable.sol";
import "./../interfaces/utils/IRegistry.sol";
import "./../interfaces/native/IUnderwritingLockListener.sol";
import "./../interfaces/native/IUnderwritingLocker.sol";
import "hardhat/console.sol";

/**
 * @title UnderwritingLocker
 * @author solace.fi
 * @notice Having an underwriting lock is a requirement to vote on Solace Native insurance gauges.
 * To create an underwriting lock, $UWE must be locked for a minimum of 6 months.
 * 
 * Locks are ERC721s and can be viewed with [`locks()`](#locks). 
 * Each lock has an `amount` of locked $UWE, and an `end` timestamp.
 * Locks have a maximum duration of four years.
 *
 * Users can create locks via [`createLock()`](#createlock) or [`createLockSigned()`](#createlocksigned).
 * Users can deposit more $UWE into a lock via [`increaseAmount()`](#increaseamount), [`increaseAmountSigned()`] (#increaseamountsigned) or [`increaseAmountMultiple()`](#increaseamountmultiple).
 * Users can extend a lock via [`extendLock()`](#extendlock) or [`extendLockMultiple()`](#extendlockmultiple).
 * Users can withdraw from a lock via [`withdraw()`](#withdraw), [`withdrawInPart()`](#withdrawinpart), [`withdrawMultiple()`](#withdrawmultiple) or [`withdrawInPartMultiple()`](#withdrawinpartmultiple).
 *
 * Users and contracts may create a lock for another address.
 * Users and contracts may deposit into a lock that they do not own.
 * A portion (set by the funding rate) of withdraws will be burned. This is to incentivize longer staking periods - withdrawing later than other users will yield more tokens than withdrawing earlier.
 * Early withdrawls will incur an additional burn, which will increase with longer remaining lock duration.
 *
 * Any time a lock is minted, burned or otherwise modified it will notify the listener contracts.
 */
// solhint-disable-next-line contract-name-camelcase
contract UnderwritingLocker is 
        IUnderwritingLocker, 
        ERC721Enhanced, 
        ReentrancyGuard, 
        Governable 
    {    
    using EnumerableSet for EnumerableSet.AddressSet;

    /***************************************
    GLOBAL PUBLIC VARIABLES
    ***************************************/

    /// @notice Token locked in the underwriting lock.
    address public override token;

    /// @notice Registry address
    address public override registry;

    /// @notice UnderwriterLockVoting.sol address
    /// @dev We expect that UnderwriterLockVoting.sol will be deployed after this contract, so we do not require votingContract to be set in the registry at construction.
    address public override votingContract;

    /// @notice The total number of locks that have been created.
    /// @dev Difference with totalSupply is that totalNumLocks does not decrement when locks are burned.
    uint256 public override totalNumLocks;

    /// @notice Funding rate - amount that will be charged and burned from a regular withdraw.
    /// @dev Value of 1e18 => 100%.
    uint256 public override fundingRate;

    /// @notice The minimum lock duration (six months) that a new lock must be created with.
    uint256 public constant override MIN_LOCK_DURATION = (365 days) / 2;

    /// @notice The maximum time (four years) into the future that a lock can expire.
    uint256 public constant override MAX_LOCK_DURATION = 4 * (365 days);

    /// @notice The maximum number of locks one user can create.
    uint256 public constant override MAX_NUM_LOCKS = 10;

    /***************************************
    GLOBAL INTERNAL VARIABLES
    ***************************************/

    uint256 internal constant MONTH = 365 days / 12;
    uint256 internal constant SQRT_SIX = 2449489742; // Precompute to save 35K gas from computing this in _sqrt()

    // lockId => Lock {uint256 amount, uint256 end}
    mapping(uint256 => Lock) internal _locks;

    // Contracts that listen for lock changes
    EnumerableSet.AddressSet internal _lockListeners;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Construct the UnderwritingLocker contract.
     * @dev Requires 'uwe' address to be set in the Registry.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param registry_ The [`Registry`](./Registry) contract address.
     */
    constructor(address governance_, address registry_)
        ERC721Enhanced("Underwriting Lock", "UnderwritingLock")
        Governable(governance_)
    {
        _setRegistry(registry_);
    }

    /***************************************
    INTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Computes amount of token that will be burned on withdraw.
     * @param amount_ The amount to withdraw.
     * @param end_ The end timestamp of the lock.
     * @return withdrawAmount Token amount that will be withdrawn.
     * @return burnAmount Token amount that will be burned on wihtdraw.
     */
    function _getWithdrawAndBurnAmount(uint256 amount_, uint256 end_) internal view returns (uint256 withdrawAmount, uint256 burnAmount) {
        // solhint-disable-next-line not-rely-on-time
        bool isEarlyWithdraw = block.timestamp < end_;
        uint256 withdrawAmount = ( (1e18 - fundingRate) * amount_ ) / 1e18;
        
        if (isEarlyWithdraw) {
            uint256 multiplier = _getLockMultiplier(end_);
            withdrawAmount = 1e18 * withdrawAmount / (multiplier + 1e18);
        }

        uint256 burnAmount = amount_ - withdrawAmount;
        return (withdrawAmount, burnAmount);
    }

    /**
     * @notice Gets multiplier (applied for voting boost, and for early withdrawals)
     * @param end_ End timestamp of lock.
     * @return multiplier 1e18 => 1x multiplier, 2e18 => 2x multiplier
     */
    function _getLockMultiplier(uint256 end_) internal view returns (uint256 multiplier) {
        if (end_ < block.timestamp) {return 0;}
        else {
            uint256 timeLeftInMonthsScaled = 1e18 * (end_ - block.timestamp) / MONTH;
            return 1e18 * _sqrt(timeLeftInMonthsScaled) / SQRT_SIX;
        }
    }

    // https://github.com/paulrberg/prb-math/blob/86c068e21f9ba229025a77b951bd3c4c4cf103da/contracts/PRBMath.sol#L591-L647
    // Babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
    // https://ethereum.stackexchange.com/questions/2910/can-i-square-root-in-solidity
    // Initially attempted Uniswap implementation - https://github.com/Uniswap/v2-core/blob/master/contracts/libraries/Math.sol
    // However Uniswap implementation very gas inefficient - require ~30000 gas to calculate typical result
    // vs this implementation which take 700 gas to calculate same
    // Burden of more difficult code well worth 40x gas efficiency, especially given _sqrt() runs in an unbounded loop
    // in GaugeController.updateGaugeWeights().
    function _sqrt(uint256 x) internal pure returns (uint256 result) {
        if (x == 0) {
            return 0;
        }

        // Set the initial guess to the least power of two that is greater than or equal to sqrt(x).
        uint256 xAux = uint256(x);
        result = 1;
        if (xAux >= 0x100000000000000000000000000000000) {
            xAux >>= 128;
            result <<= 64;
        }
        if (xAux >= 0x10000000000000000) {
            xAux >>= 64;
            result <<= 32;
        }
        if (xAux >= 0x100000000) {
            xAux >>= 32;
            result <<= 16;
        }
        if (xAux >= 0x10000) {
            xAux >>= 16;
            result <<= 8;
        }
        if (xAux >= 0x100) {
            xAux >>= 8;
            result <<= 4;
        }
        if (xAux >= 0x10) {
            xAux >>= 4;
            result <<= 2;
        }
        if (xAux >= 0x8) {
            result <<= 1;
        }

        // The operations can never overflow because the result is max 2^127 when it enters this block.
        unchecked {
            result = (result + x / result) >> 1;
            result = (result + x / result) >> 1;
            result = (result + x / result) >> 1;
            result = (result + x / result) >> 1;
            result = (result + x / result) >> 1;
            result = (result + x / result) >> 1;
            result = (result + x / result) >> 1; // Seven iterations should be enough
            uint256 roundedDownResult = x / result;
            return result >= roundedDownResult ? roundedDownResult : result;
        }
    }

    /**
     * @notice Gets all active lockIDs for a user
     * @param user_ The address of user to query.
     * @return lockIDs Array of active lockIDs.
     */
    function _getAllLockIDsOf(address user_) internal view returns (uint256[] memory lockIDs) {
        uint256 userNumOfLocks = balanceOf(user_);
        lockIDs = new uint256[](userNumOfLocks);
        for(uint256 i = 0; i < userNumOfLocks; i++) {lockIDs[i] = tokenOfOwnerByIndex(user_, i);}
        return lockIDs;
    }

    /***************************************
    EXTERNAL VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice Get `amount` and `end` values for a lockID.
     * @param lockID_ The ID of the lock to query.
     * @return lock Lock {uint256 amount, uint256 end}
     */
    function locks(uint256 lockID_) external view override tokenMustExist(lockID_) returns (Lock memory lock) {
        return _locks[lockID_];
    }

    /**
     * @notice Determines if the lock is currently locked.
     * @param lockID_ The ID of the lock to query.
     * @return locked True if the lock is locked, false if unlocked.
     */
    function isLocked(uint256 lockID_) external view override tokenMustExist(lockID_) returns (bool locked) {
        // solhint-disable-next-line not-rely-on-time
        return _locks[lockID_].end > block.timestamp;
    }

    /**
     * @notice Determines the time left until the lock unlocks.
     * @param lockID_ The ID of the lock to query.
     * @return time The time left in seconds, 0 if unlocked.
     */
    function timeLeft(uint256 lockID_) external view override tokenMustExist(lockID_) returns (uint256 time) {
        // solhint-disable-next-line not-rely-on-time
        return (_locks[lockID_].end > block.timestamp)
            // solhint-disable-next-line not-rely-on-time
            ? _locks[lockID_].end - block.timestamp // locked
            : 0; // unlocked
    }

    /**
     * @notice Returns the total token amount that the user has staked in underwriting locks.
     * @param account_ The account to query.
     * @return balance The user's total staked token amount.
     */
    function totalStakedBalance(address account_) external view override returns (uint256 balance) {
        uint256 numOfLocks = balanceOf(account_);
        balance = 0;
        for (uint256 i = 0; i < numOfLocks; i++) {
            uint256 lockID = tokenOfOwnerByIndex(account_, i);
            balance += _locks[lockID].amount;
        }
        return balance;
    }

    /**
     * @notice The list of contracts that are listening to lock updates.
     * @return listeners_ The list as an array.
     */
    function getLockListeners() external view override returns (address[] memory listeners_) {
        uint256 len = _lockListeners.length();
        listeners_ = new address[](len);
        for(uint256 index = 0; index < len; index++) {
            listeners_[index] = _lockListeners.at(index);
        }
        return listeners_;
    }

    /**
     * @notice Computes amount of token that will be transferred to the user on full withdraw.
     * @param lockID_ The ID of the lock to query.
     * @return withdrawAmount Token amount that will be withdrawn.
     */
    function getWithdrawAmount(uint256 lockID_) external view override tokenMustExist(lockID_) returns (uint256 withdrawAmount) {
        Lock memory lock = _locks[lockID_];
        (withdrawAmount, ) = _getWithdrawAndBurnAmount(lock.amount, lock.end);
        return withdrawAmount;
    }

    /**
     * @notice Computes amount of token that will be transferred to the user on partial withdraw.
     * @param lockID_ The ID of the lock to query.
     * @param amount_ The requested amount to withdraw.
     * @return withdrawAmount Token amount that will be withdrawn.
     */
    function getWithdrawInPartAmount(uint256 lockID_, uint256 amount_) external view override tokenMustExist(lockID_) returns (uint256 withdrawAmount) {
        (withdrawAmount, ) = _getWithdrawAndBurnAmount(amount_, _locks[lockID_].end);
        return withdrawAmount;
    }

    /**
     * @notice Computes amount of token that will be burned on full withdraw.
     * @param lockID_ The ID of the lock to query.
     * @return burnAmount Token amount that will be burned on withdraw.
     */
    function getBurnOnWithdrawAmount(uint256 lockID_) external view override tokenMustExist(lockID_) returns (uint256 burnAmount) {
        Lock memory lock = _locks[lockID_];
        (, burnAmount) = _getWithdrawAndBurnAmount(lock.amount, lock.end);
        return burnAmount;
    }

    /**
     * @notice Computes amount of token that will be burned on partial withdraw.
     * @param lockID_ The ID of the lock to query.
     * @param amount_ The requested amount to withdraw.
     * @return burnAmount Token amount that will be burned on withdraw.
     */
    function getBurnOnWithdrawInPartAmount(uint256 lockID_, uint256 amount_) external view override tokenMustExist(lockID_) returns (uint256 burnAmount) {
        (, burnAmount) = _getWithdrawAndBurnAmount(amount_, _locks[lockID_].end);
        return burnAmount;
    }

    /**
     * @notice Gets multiplier (applied for voting boost, and for early withdrawals)
     * @param lockID_ The ID of the lock to query.
     * @return multiplier 1e18 => 1x multiplier, 2e18 => 2x multiplier
     */
    function getLockMultiplier(uint256 lockID_) external view override tokenMustExist(lockID_) returns (uint256 multiplier) {
        return _getLockMultiplier(_locks[lockID_].end);
    }

    /**
     * @notice Gets all active lockIDs for a user
     * @param user_ The address of user to query.
     * @return lockIDs Array of active lockIDs.
     */
    function getAllLockIDsOf(address user_) external view override returns (uint256[] memory lockIDs) {
        return _getAllLockIDsOf(user_);
    }

    /***************************************
    INTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Creates a new lock.
     * @dev There is no input validation that amount_ must > 0, but a lock is burned on complete withdraw lol. Trivial bug.
     * @param recipient_ The user that the lock will be minted to.
     * @param amount_ The amount of token in the lock.
     * @param end_ The end of the lock.
     * @return lockID The ID of the new lock.
     */
    function _createLock(address recipient_, uint256 amount_, uint256 end_) internal returns (uint256 lockID) {
        if (amount_ == 0) revert CannotCreateEmptyLock();
        // solhint-disable-next-line not-rely-on-time
        if(end_ < block.timestamp + MIN_LOCK_DURATION) revert LockTimeTooShort();
        // solhint-disable-next-line not-rely-on-time
        if(end_ > block.timestamp + MAX_LOCK_DURATION) revert LockTimeTooLong();
        if( balanceOf(recipient_) >= MAX_NUM_LOCKS ) revert CreatedMaxLocks();
        lockID = ++totalNumLocks;
        Lock memory newLock = Lock(amount_, end_);
        // accounting
        _locks[lockID] = newLock;
        _safeMint(recipient_, lockID);
        emit LockCreated(lockID);
    }

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID_ The ID of the lock to update.
     * @param amount_ The amount of token to deposit.
     */
    function _increaseAmount(uint256 lockID_, uint256 amount_) internal {
        uint256 newTotalAmount = _locks[lockID_].amount + amount_;
        _updateLock(lockID_, newTotalAmount, _locks[lockID_].end);
        emit LockIncreased(lockID_, newTotalAmount, amount_);
    }


    /**
     * @notice Updates an existing lock.
     * @param lockID_ The ID of the lock to update.
     * @param amount_ The amount of token now in the lock.
     * @param end_ The end of the lock.
     */
    function _updateLock(uint256 lockID_, uint256 amount_, uint256 end_) internal {
        // checks
        Lock memory prevLock = _locks[lockID_];
        Lock memory newLock = Lock(amount_, end_); // end was sanitized before passed in
        // accounting
        _locks[lockID_] = newLock;
        address owner = ownerOf(lockID_);
        _notify(lockID_, owner, owner, prevLock, newLock);
        emit LockUpdated(lockID_, amount_, end_);
    }

    /**
     * @notice Extend a lock's duration.
     * @dev Can only be called by the lock owner or approved.
     * @param lockID_ The ID of the lock to update.
     * @param end_ The new time for the lock to unlock.
     */
    function _extendLock(uint256 lockID_, uint256 end_) internal onlyOwnerOrApproved(lockID_) {
        // solhint-disable-next-line not-rely-on-time
        if(end_ > block.timestamp + MAX_LOCK_DURATION) revert LockTimeTooLong();
        if(_locks[lockID_].end >= end_) revert LockTimeNotExtended();
        _updateLock(lockID_, _locks[lockID_].amount, end_);
        emit LockExtended(lockID_, end_);
    }

    /**
     * @notice Withdraws from a lock.
     * @param lockID_ The ID of the lock to withdraw from.
     * @param amount_ The amount of token to withdraw.
     * @return withdrawAmount Amount that will be withdrawn.
     * @return burnAmount Amount that will be burned.
     */
    function _withdraw(uint256 lockID_, uint256 amount_) 
        internal 
        onlyOwnerOrApproved(lockID_) 
        returns (uint256 withdrawAmount, uint256 burnAmount) 
    {
        // solhint-disable-next-line not-rely-on-time
        bool isEarlyWithdraw = block.timestamp < _locks[lockID_].end;
        (withdrawAmount, burnAmount) = _getWithdrawAndBurnAmount(amount_, _locks[lockID_].end);

        // full withdraw
        if(amount_ == _locks[lockID_].amount) {
            _burn(lockID_);
            delete _locks[lockID_];
        // partial withdraw
        } else {
            Lock memory oldLock = _locks[lockID_];
            Lock memory newLock = Lock(oldLock.amount - amount_, oldLock.end);
            _locks[lockID_].amount -= amount_;
            address owner = ownerOf(lockID_);
            _notify(lockID_, owner, owner, oldLock, newLock);
        }

        if(isEarlyWithdraw) {emit EarlyWithdrawal(lockID_, amount_, withdrawAmount, burnAmount);} 
        else {emit Withdrawal(lockID_, amount_, withdrawAmount, burnAmount);}
        return (withdrawAmount, burnAmount);
    }

    /**
     * @notice Hook that is called after any token transfer. This includes minting and burning.
     * @param from_ The user that sends the token, or zero if minting.
     * @param to_ The zero that receives the token, or zero if burning.
     * @param lockID_ The ID of the token being transferred.
     */
    function _afterTokenTransfer(
        address from_,
        address to_,
        uint256 lockID_
    ) internal override {
        super._afterTokenTransfer(from_, to_, lockID_);
        Lock memory lock = _locks[lockID_];
        // notify listeners
        if(from_ == address(0x0)) _notify(lockID_, from_, to_, Lock(0, 0), lock); // mint
        else if(to_ == address(0x0)) _notify(lockID_, from_, to_, lock, Lock(0, 0)); // burn
        else {_notify(lockID_, from_, to_, lock, lock);} // transfer
    }

    /**
     * @notice Notify the listeners of any updates.
     * @dev Called on transfer, mint, burn, and update.
     * Either the owner will change or the lock will change, not both.
     * @param lockID_ The ID of the lock that was altered.
     * @param oldOwner_ The old owner of the lock.
     * @param newOwner_ The new owner of the lock.
     * @param oldLock_ The old lock data.
     * @param newLock_ The new lock data.
     */
    function _notify(uint256 lockID_, address oldOwner_, address newOwner_, Lock memory oldLock_, Lock memory newLock_) internal {
        // register action with listener
        uint256 len = _lockListeners.length();
        for(uint256 i = 0; i < len; i++) {
            IUnderwritingLockListener(_lockListeners.at(i)).registerLockEvent(lockID_, oldOwner_, newOwner_, oldLock_, newLock_);
        }
    }

    /**
     * @notice Sets registry and related contract addresses.
     * @dev Requires 'uwe' addresses to be set in the Registry.
     * @param registry_ The registry address to set.
     */
    function _setRegistry(address registry_) internal {
        // set registry        
        if(registry_ == address(0x0)) revert ZeroAddressInput("registry");
        registry = registry_;
        IRegistry reg = IRegistry(registry_);
        // set token ($UWE)
        (, address uweAddr) = reg.tryGet("uwe");
        if(uweAddr == address(0x0)) revert ZeroAddressInput("uwe");
        token = uweAddr;
        emit RegistrySet(registry_);
    }

    /***************************************
    EXTERNAL MUTATOR FUNCTIONS
    ***************************************/

    /**
     * @notice Deposit token to create a new lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @param recipient_ The account that will receive the lock.
     * @param amount_ The amount of token to deposit.
     * @param end_ The timestamp the lock will unlock.
     * @return lockID The ID of the newly created lock.
     */
    function createLock(address recipient_, uint256 amount_, uint256 end_) external override nonReentrant returns (uint256 lockID) {
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount_);
        // accounting
        return _createLock(recipient_, amount_, end_);
    }

    /**
     * @notice Deposit token to create a new lock.
     * @dev Token is transferred from msg.sender using ERC20Permit.
     * @dev recipient = msg.sender
     * @param amount_ The amount of token to deposit.
     * @param end_ The timestamp the lock will unlock.
     * @param deadline_ Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     * @return lockID The ID of the newly created lock.
     */
    function createLockSigned(uint256 amount_, uint256 end_, uint256 deadline_, uint8 v, bytes32 r, bytes32 s) external override nonReentrant returns (uint256 lockID) {
        // permit
        IERC20Permit(token).permit(msg.sender, address(this), amount_, deadline_, v, r, s);
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount_);
        // accounting
        return _createLock(msg.sender, amount_, end_);
    }

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID_ The ID of the lock to update.
     * @param amount_ The amount of token to deposit.
     */
    function increaseAmount(uint256 lockID_, uint256 amount_) external override nonReentrant {
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount_);
        // accounting
        _increaseAmount(lockID_, amount_);
    }

    /**
     * @notice Deposit token to increase the value of multiple existing locks.
     * @dev Token is transferred from msg.sender, assumes its already approved.
     * @dev If a lockID does not exist, the corresponding amount will be refunded to msg.sender.
     * @dev Anyone (not just the lock owner) can call increaseAmountMultiple() and deposit to existing locks.
     * @param lockIDs_ Array of lock IDs to update.
     * @param amounts_ Array of token amounts to deposit.
     */
    function increaseAmountMultiple(uint256[] calldata lockIDs_, uint256[] calldata amounts_) external override nonReentrant {
        if (lockIDs_.length != amounts_.length) revert ArrayArgumentsLengthMismatch();
        uint256 totalAmount;
        for (uint256 i = 0; i < lockIDs_.length; i++) {
            totalAmount += amounts_[i];
            _increaseAmount(lockIDs_[i], amounts_[i]);
        }
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), totalAmount);
    }

    /**
     * @notice Deposit token to increase the value of an existing lock.
     * @dev Token is transferred from msg.sender using ERC20Permit.
     * @dev Anyone (not just the lock owner) can call increaseAmount() and deposit to an existing lock.
     * @param lockID_ The ID of the lock to update.
     * @param amount_ The amount of token to deposit.
     * @param deadline_ Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     */
    function increaseAmountSigned(uint256 lockID_, uint256 amount_, uint256 deadline_, uint8 v, bytes32 r, bytes32 s) external override nonReentrant {
        // permit
        IERC20Permit(token).permit(msg.sender, address(this), amount_, deadline_, v, r, s);
        // pull token
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount_);
        // accounting
        _increaseAmount(lockID_, amount_);
    }

    /**
     * @notice Extend a lock's duration.
     * @dev Can only be called by the lock owner or approved.
     * @param lockID_ The ID of the lock to update.
     * @param end_ The new time for the lock to unlock.
     */
    function extendLock(uint256 lockID_, uint256 end_) external override nonReentrant {
        _extendLock(lockID_, end_);
    }

    /**
     * @notice Extend multiple locks' duration.
     * @dev Can only be called by the lock owner or approved.
     * @dev If non-existing lockIDs are entered, these will be skipped.
     * @param lockIDs_ Array of lock IDs to update.
     * @param ends_ Array of new unlock times.
     */
    function extendLockMultiple(uint256[] calldata lockIDs_, uint256[] calldata ends_) external override nonReentrant {
        if (lockIDs_.length != ends_.length) revert ArrayArgumentsLengthMismatch();
        for (uint256 i = 0; i < lockIDs_.length; i++) {
            _extendLock(lockIDs_[i], ends_[i]);
        }
    }

    /**
     * @notice Withdraw from a lock in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur additional burn amount.
     * @param lockID_ The ID of the lock to withdraw from.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdraw(uint256 lockID_, address recipient_) external override nonReentrant {
        uint256 amount = _locks[lockID_].amount;
        (uint256 withdrawAmount, uint256 burnAmount) = _withdraw(lockID_, amount);
        // transfer token
        SafeERC20.safeTransfer(IERC20(token), address(0x1), burnAmount);
        SafeERC20.safeTransfer(IERC20(token), recipient_, withdrawAmount);
    }

    /**
     * @notice Withdraw from a lock in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur additional burn amount.
     * @param lockID_ The ID of the lock to withdraw from.
     * @param amount_ The amount of token to withdraw.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawInPart(uint256 lockID_, uint256 amount_, address recipient_) external override nonReentrant {
        if (amount_ > _locks[lockID_].amount) revert ExcessWithdraw(lockID_, _locks[lockID_].amount, amount_);
        (uint256 withdrawAmount, uint256 burnAmount) = _withdraw(lockID_, amount_);
        // transfer token
        SafeERC20.safeTransfer(IERC20(token), address(0x1), burnAmount);
        SafeERC20.safeTransfer(IERC20(token), recipient_, withdrawAmount);
    }

    /**
     * @notice Withdraw from multiple locks in full.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur additional burn amount.
     * @param lockIDs_ The ID of the locks to withdraw from.
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawMultiple(uint256[] calldata lockIDs_, address recipient_) external override nonReentrant {
        uint256 len = lockIDs_.length;
        uint256 totalWithdrawAmount = 0;
        uint256 totalBurnAmount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs_[i];
            if (!_isApprovedOrOwner(msg.sender, lockID)) revert NotOwnerNorApproved();
            uint256 singleLockAmount = _locks[lockID].amount;
            (uint256 withdrawAmount, uint256 burnAmount) = _withdraw(lockID, singleLockAmount);
            totalBurnAmount += burnAmount;
            totalWithdrawAmount += withdrawAmount;
        }
        // batched token transfer
        if (totalBurnAmount > 0) {SafeERC20.safeTransfer(IERC20(token), address(0x1), totalBurnAmount);}
        SafeERC20.safeTransfer(IERC20(token), recipient_, totalWithdrawAmount);
    }

    /**
     * @notice Withdraw from multiple locks in part.
     * @dev Can only be called by the lock owner or approved.
     * @dev If called before `end` timestamp, will incur additional burn amount.
     * @param lockIDs_ The ID of the locks to withdraw from.
     * @param amounts_ Array of token amounts to withdraw
     * @param recipient_ The user to receive the lock's token.
     */
    function withdrawInPartMultiple(uint256[] calldata lockIDs_, uint256[] calldata amounts_ ,address recipient_) external override nonReentrant {
        if (lockIDs_.length != amounts_.length) revert ArrayArgumentsLengthMismatch();
        uint256 len = lockIDs_.length;
        uint256 totalWithdrawAmount = 0;
        uint256 totalBurnAmount = 0;
        for(uint256 i = 0; i < len; i++) {
            uint256 lockID = lockIDs_[i];
            if (!_isApprovedOrOwner(msg.sender, lockID)) revert NotOwnerNorApproved();
            uint256 singleLockAmount = amounts_[i];
            if (singleLockAmount > _locks[lockID].amount) revert ExcessWithdraw(lockID, _locks[lockID].amount, singleLockAmount);
            (uint256 withdrawAmount, uint256 burnAmount) = _withdraw(lockID, singleLockAmount);
            totalBurnAmount += burnAmount;
            totalWithdrawAmount += withdrawAmount;
        }
        // batched token transfer
        if (totalBurnAmount > 0) {SafeERC20.safeTransfer(IERC20(token), address(0x1), totalBurnAmount);}
        SafeERC20.safeTransfer(IERC20(token), recipient_, totalWithdrawAmount);
    }

    /***************************************
    VOTING CONTRACT FUNCTIONS
    ***************************************/

    /**
     * @notice Perform accounting for voting premiums to be charged by UnderwritingLockVoting.chargePremiums().
     * @dev Can only be called by votingContract set in the registry.
     * @dev Not meant to be called directly, and within UnderwritingLockVoting.chargePremiums().
     * @dev Costs 5K gas per call to add notification functionality. This will quickly add-up in an unbounded loop.
     * @param lockID_ The ID of the lock to charge.
     * @param premium_ The amount of token charged as premium.
     */
    function chargePremium(uint256 lockID_, uint256 premium_) external override nonReentrant {
        if (msg.sender != votingContract) revert NotVotingContract();
        if (!_exists(lockID_)) {return;}
        // Lock memory oldLock = _locks[lockID_];
        // Lock memory newLock = Lock(oldLock.amount - premium_, oldLock.end); // Relying on Solidity ^8.0 native underflow check.
        _locks[lockID_].amount -= premium_;
        // address owner = ownerOf(lockID_);
        // _notify(lockID_, owner, owner, oldLock, newLock);
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener_ The listener to add.
     */
    function addLockListener(address listener_) external override onlyGovernance {
        _lockListeners.add(listener_);
        emit LockListenerAdded(listener_);
    }

    /**
     * @notice Removes a listener.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param listener_ The listener to remove.
     */
    function removeLockListener(address listener_) external override onlyGovernance {
        _lockListeners.remove(listener_);
        emit LockListenerRemoved(listener_);
    }

    /**
     * @notice Sets the base URI for computing `tokenURI`.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param baseURI_ The new base URI.
     */
    function setBaseURI(string memory baseURI_) external override onlyGovernance {
        _setBaseURI(baseURI_);
    }

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * @dev Requires 'uwe' address to be set in the Registry.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
     */
    function setRegistry(address registry_) external override onlyGovernance {
        _setRegistry(registry_);
    }

    /**
     * @notice Sets votingContract and enable safeTransferFrom call by `underwritingLockVoting` address stored in Registry.
     * @dev Hacky fix to the issue that [`UnderwritingLockVoting`](./UnderwritingLockVoting) needs token transfer approval, but will be deployed after this contract.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     */
    function setVotingContract() external override onlyGovernance {
        // Remove approval for old contract.
        if (votingContract != address(0x0)) SafeERC20.safeApprove(IERC20(token), votingContract, 0);
        // Grant approval for new contract
        (, address votingContractAddr) = IRegistry(registry).tryGet("underwritingLockVoting");
        if(votingContractAddr == address(0x0)) revert ZeroAddressInput("underwritingLockVoting");
        votingContract = votingContractAddr;
        SafeERC20.safeApprove(IERC20(token), votingContractAddr, type(uint256).max);        
        emit VotingContractSet(votingContractAddr);
    }

    /**
     * @notice Sets fundingRate.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param fundingRate_ Desired funding rate, 1e18 => 100%
     */
    function setFundingRate(uint256 fundingRate_) external override onlyGovernance {
        if (fundingRate_ > 1e18) revert FundingRateAboveOne();
        fundingRate = fundingRate_;
        emit FundingRateSet(fundingRate_);
    }
}

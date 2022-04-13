// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";
import "./../utils/Governable.sol";
import "./../interfaces/products/ISCD.sol";

/**
 * @title Solace Cover Dollars (SCD)
 * @author solace.fi
 * @notice **SCD** is a stablecoin pegged to **USD**. It is used to pay for coverage.
 *
 * **SCD** conforms to the ERC20 standard but cannot be minted or transferred by most users. Balances can only be modified by "SCD movers" such as SCD Tellers and coverage contracts. In some cases the user may be able to exchange **SCD** for the payment token, if not the balance will be marked non refundable. Some coverage contracts may have a minimum balance required to prevent abuse - these are called "SCD retainers" and may block [`withdraw()`](#withdraw).
 *
 * [**Governance**](/docs/protocol/governance) can add and remove SCD movers and retainers. SCD movers can modify token balances via [`mint()`](#mint), [`burn()`](#burn), [`transfer()`](#transfer), [`transferFrom()`](#transferfrom), and [`withdraw()`](#withdraw).
 */
contract SCD is ISCD, Multicall, Governable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /***************************************
    ERC20 DATA
    ***************************************/

    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _balancesNonRefundable;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    /***************************************
    MOVER AND RETAINER DATA
    ***************************************/

    EnumerableSet.AddressSet private _scdMovers;
    EnumerableSet.AddressSet private _scdRetainers;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the Solace Cover Dollars contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     */
    constructor(address governance_) Governable(governance_) {
        _name = "scd";
        _symbol = "SCD";
    }

    /***************************************
    ERC20 FUNCTIONS
    ***************************************/

    /// @notice The name of the token.
    function name() public view virtual override returns (string memory) {
        return _name;
    }

    /// @notice The symbol of the token.
    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    /// @notice The number of decimals in the numeric representation.
    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    /// @notice The amount of tokens in existence.
    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    /// @notice The amount of tokens owned by `account`.
    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    /// @notice Overwritten. Returns zero.
    function allowance(address, address) public view virtual override returns (uint256) {
        return 0;
    }

    /// @notice Overwritten. Reverts when called.
    function approve(address, uint256) public virtual override returns (bool) {
        revert("SCD: token not approvable");
    }

    /**
     * @notice Moves `amount` tokens from the caller's account to `recipient`.
     * Can only be called by a scd mover.
     * Requirements:
     * - `recipient` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    /**
     * @notice Moves `amount` tokens from `sender` to `recipient`.
     * Can only be called by a scd mover.
     * Requirements:
     * - `sender` and `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);
        return true;
    }

    /**
     * @notice Moves `amount` of tokens from `sender` to `recipient`.
     * Requirements:
     * - `sender` cannot be the zero address.
     * - `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     */
    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual {
        require(isScdMover(msg.sender), "!scd mover");
        require(sender != address(0), "SCD: transfer from the zero address");
        require(recipient != address(0), "SCD: transfer to the zero address");

        uint256 senderBalance = _balances[sender];
        require(senderBalance >= amount, "SCD: transfer amount exceeds balance");
        unchecked {
            _balances[sender] = senderBalance - amount;
        }
        _balances[recipient] += amount;
        // transfer nonrefundable amount first
        uint256 bnr1 = _balancesNonRefundable[sender];
        uint256 bnr2 = _subOrZero(bnr1, amount);
        if(bnr2 != bnr1) {
            _balancesNonRefundable[sender] = bnr2;
            _balancesNonRefundable[recipient] += (bnr1 - bnr2);
        }
        emit Transfer(sender, recipient, amount);
    }

    /**
     * @notice Creates `amount` tokens and assigns them to `account`, increasing the total supply.
     * Requirements:
     * - `account` cannot be the zero address.
     */
    function mint(address account, uint256 amount, bool isRefundable) external override {
        require(isScdMover(msg.sender), "!scd mover");
        require(account != address(0), "SCD: mint to the zero address");
        _totalSupply += amount;
        _balances[account] += amount;
        if(!isRefundable) _balancesNonRefundable[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    /**
     * @notice Destroys `amount` tokens from `account`, reducing the total supply.
     * Requirements:
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function burn(address account, uint256 amount) external override {
        // checks
        require(isScdMover(msg.sender), "!scd mover");
        require(account != address(0), "SCD: burn from the zero address");
        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "SCD: burn amount exceeds balance");
        // effects
        unchecked {
            _balances[account] = accountBalance - amount;
        }
        _totalSupply -= amount;
        // burn nonrefundable amount first
        uint256 bnr1 = _balancesNonRefundable[account];
        uint256 bnr2 = _subOrZero(bnr1, amount);
        if(bnr2 != bnr1) _balancesNonRefundable[account] = bnr2;
        emit Transfer(account, address(0), amount);
    }

    /**
     * @notice Withdraws funds from an account.
     * @dev Same as burn() except uses refundable amount and checks min scd required.
     * The user must have sufficient refundable balance.
     * @param account The account to withdraw from.
     * @param amount The amount to withdraw.
     */
    function withdraw(address account, uint256 amount) external override {
        // checks
        require(isScdMover(msg.sender), "!scd mover");
        require(account != address(0), "SCD: withdraw from the zero address");
        uint256 bal = _balances[account]; // total
        uint256 bnr = _balancesNonRefundable[account]; // nonrefundable
        uint256 br = _subOrZero(bal, bnr); // refundable
        require(br >= amount, "SCD: withdraw amount exceeds balance");
        uint256 minScd = minScdRequired(account);
        uint256 newBal = bal - amount;
        require(newBal >= minScd, "SCD: withdraw to below min");
        // effects
        _totalSupply -= amount;
        _balances[account] = newBal;
        emit Transfer(account, address(0), amount);
    }

    /***************************************
    MOVER AND RETAINER FUNCTIONS
    ***************************************/

    /// @notice Returns true if `account` has permissions to move balances.
    function isScdMover(address account) public view override returns (bool status) {
        return _scdMovers.contains(account);
    }

    /// @notice Returns the number of scd movers.
    function scdMoverLength() external view override returns (uint256 length) {
        return _scdMovers.length();
    }

    /// @notice Returns the scd mover at `index`.
    function scdMoverList(uint256 index) external view override returns (address scdMover) {
        return _scdMovers.at(index);
    }

    /// @notice Returns true if `account` may need to retain scd on behalf of a user.
    function isScdRetainer(address account) public view override returns (bool status) {
        return _scdRetainers.contains(account);
    }

    /// @notice Returns the number of scd retainers.
    function scdRetainerLength() external view override returns (uint256 length) {
        return _scdRetainers.length();
    }

    /// @notice Returns the scd retainer at `index`.
    function scdRetainerList(uint256 index) external view override returns (address scdRetainer) {
        return _scdRetainers.at(index);
    }

    /// @notice The amount of tokens owned by account that cannot be withdrawn.
    function balanceOfNonRefundable(address account) public view virtual override returns (uint256) {
        return _balancesNonRefundable[account];
    }

    /**
     * @notice Calculates the minimum amount of Solace Cover Dollars required by this contract for the account to hold.
     * @param account Account to query.
     * @return amount The amount of SCD the account must hold.
     */
    function minScdRequired(address account) public view override returns (uint256 amount) {
        amount = 0;
        uint256 len = _scdRetainers.length();
        for(uint256 i = 0; i < len; i++) {
            amount += ISCDRetainer(_scdRetainers.at(i)).minScdRequired(account);
        }
        return amount;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Adds or removes a set of scd movers.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param scdMovers List of scd movers to set.
     * @param statuses Statuses to set.
     */
    function setScdMoverStatuses(address[] calldata scdMovers, bool[] calldata statuses) external override onlyGovernance {
        uint256 len = scdMovers.length;
        require(statuses.length == len, "length mismatch");
        for(uint256 i = 0; i < len; i++) {
            if(statuses[i]) _scdMovers.add(scdMovers[i]);
            else _scdMovers.remove(scdMovers[i]);
            emit ScdMoverStatusSet(scdMovers[i], statuses[i]);
        }
    }

    /**
     * @notice Adds or removes a set of scd retainers.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param scdRetainers List of scd retainers to set.
     * @param statuses Statuses to set.
     */
    function setScdRetainerStatuses(address[] calldata scdRetainers, bool[] calldata statuses) external override onlyGovernance {
        uint256 len = scdRetainers.length;
        require(statuses.length == len, "length mismatch");
        for(uint256 i = 0; i < len; i++) {
            if(statuses[i]) _scdRetainers.add(scdRetainers[i]);
            else _scdRetainers.remove(scdRetainers[i]);
            emit ScdRetainerStatusSet(scdRetainers[i], statuses[i]);
        }
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Safely performs `c = a - b`.
     * If negative overflow returns 0.
     * @param a First operand.
     * @param b Second operand.
     * @param c Result.
     */
    function _subOrZero(uint256 a, uint256 b) internal pure returns (uint256 c) {
        return (a >= b)
            ? (a - b)
            : 0;
    }
}

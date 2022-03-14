// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "./../utils/Governable.sol";
import "./../interfaces/products/ISolaceCoverMinutes.sol";

/**
 * @title Solace Cover Minutes
 * @author solace.fi
 * @notice
 */
contract SolaceCoverMinutes is Context, ISolaceCoverMinutes, Governable {

    /***************************************
    ERC20 DATA
    ***************************************/

    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _balancesNonRefundable;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    /***************************************
    BALANCE MANAGER DATA
    ***************************************/

    mapping(address => uint256) public override balanceManagerIndex;
    mapping(uint256 => address) public override balanceManagerList;
    uint256 public override balanceManagerLength;

    /***************************************
    SCM HOLDERS DATA
    ***************************************/

    mapping(address => uint256) public override scmRetainerIndex;
    mapping(uint256 => address) public override scmRetainerList;
    uint256 public override scmRetainerLength;

    /***************************************
    CONSTRUCTOR
    ***************************************/

    /**
     * @notice Constructs the Solace Cover Minutes contract.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     */
    constructor(address governance_) Governable(governance_) {
        _name = "scm";
        _symbol = "SCM";
    }

    /***************************************
    ERC20 FUNCTIONS
    ***************************************/

    /**
     * @dev Returns the name of the token.
     */
    function name() public view virtual override returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the value {ERC20} uses, unless this function is
     * overridden;
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `recipient` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        require(isBalanceManager(msg.sender), "!balance manager");
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. See the note at the beginning of {ERC20}.
     *
     * Requirements:
     *
     * - `sender` and `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     * - the caller must have allowance for ``sender``'s tokens of at least
     * `amount`.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        require(isBalanceManager(msg.sender), "!balance manager");
        _transfer(sender, recipient, amount);
        return true;
    }

    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function mint(address account, uint256 amount, bool isRefundable) external override {
        require(isBalanceManager(msg.sender), "!balance manager");
        _mint(account, amount, isRefundable);
    }

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function burn(address account, uint256 amount) external override {
        require(isBalanceManager(msg.sender), "!balance manager");
        _burn(account, amount);
    }

    /**
     * @dev Sets the balance of an account.
     * @param account The account to change balance.
     * @param amount The new balance of the account.
     */
    /*
    function setBalance(address account, uint256 amount) external override {
        require(isBalanceManager(msg.sender), "!balance manager");
        uint256 bal = _balances[account];
        if(amount > bal) _mint(account, amount - bal, true);
        else if(amount < bal) _burn(account, bal - amount);
    }
    */

    /**
     * @notice Withdraws funds from an account.
     * The user must have sufficient refundable balance.
     * @param account The account to withdraw from.
     * @param amount The amount to withdraw.
     */
    function withdraw(address account, uint256 amount) external override {
        // checks
        require(isBalanceManager(msg.sender), "!balance manager");
        uint256 bal = _balances[account];
        uint256 bnr = _balancesNonRefundable[account];
        uint256 br = _subOrZero(bal, bnr);
        require(br >= amount, "insufficient balance");
        uint256 minScm = minScmRequired(account);
        uint256 newBal = bal - amount;
        require(newBal >= minScm, "cannot withdraw below min scm");
        // effects
        _balances[account] = newBal;
        _balancesNonRefundable[account] = _subOrZero(bnr, amount);
    }

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return 0;
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        revert("SCM: token not approvable");
    }

    /**
     * @notice Calculates the minimum amount of Solace Cover Minutes required by this contract for the account to hold.
     * @param account Account to query.
     * @return amount The amount of SCM the account must hold.
     */
    function minScmRequired(address account) public view override returns (uint256 amount) {
        amount = 0;
        uint256 len = scmRetainerLength;
        for(uint256 i = 1; i <= len; i++) {
            amount += ISolaceCoverMinutesRetainer(scmRetainerList[i]).minScmRequired(account);
        }
        return amount;
    }

    /**
     * @dev Moves `amount` of tokens from `sender` to `recipient`.
     *
     * This internal function is equivalent to {transfer}, and can be used to
     * e.g. implement automatic token fees, slashing mechanisms, etc.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - `sender` cannot be the zero address.
     * - `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     */
    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        uint256 senderBalance = _balances[sender];
        require(senderBalance >= amount, "ERC20: transfer amount exceeds balance");
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

    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function _mint(address account, uint256 amount, bool isRefundable) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");
        _totalSupply += amount;
        _balances[account] += amount;
        if(!isRefundable) _balancesNonRefundable[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: burn from the zero address");
        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "ERC20: burn amount exceeds balance");
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

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    function isBalanceManager(address bm) public view override returns (bool status) {
        return balanceManagerIndex[bm] > 0;
    }

    function isScmRetainer(address scmRetainer) external view override returns (bool status) {
        return scmRetainerIndex[scmRetainer] > 0;
    }

    /**
     * @notice Adds or removes a set of balance managers.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param bms List of balance managers to set.
     * @param statuses Statuses to set.
     */
    function setBalanceManagerStatuses(address[] calldata bms, bool[] calldata statuses) external override onlyGovernance {
        uint256 len = bms.length;
        require(statuses.length == len, "length mismatch");
        for(uint256 i = 0; i < len; i++) {
            // adding balance manager
            if(statuses[i]) {
                // not yet added
                if(balanceManagerIndex[bms[i]] == 0) {
                    // add to enumeration
                    uint256 index = ++balanceManagerLength;
                    balanceManagerIndex[bms[i]] = index;
                    balanceManagerList[index] = bms[i];
                }
            }
            // removing balance manager
            else {
                // was added
                uint256 index = balanceManagerIndex[bms[i]];
                if(index >= 0) {
                    // not last entry, need to shift down
                    uint256 length = balanceManagerLength;
                    if(index < length) {
                        address last = balanceManagerList[length];
                        balanceManagerIndex[last] = index;
                        balanceManagerList[index] = last;
                    }
                    // remove from enumeration
                    balanceManagerIndex[bms[i]] = 0;
                    balanceManagerList[length] = address(0x0);
                    balanceManagerLength--;
                }
            }
            emit BalanceManagerStatusSet(bms[i], statuses[i]);
        }
    }

    /**
     * @notice Adds or removes a set of scm retainers.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param retainers List of scm retainers to set.
     * @param statuses Statuses to set.
     */
    function setScmRetainerStatuses(address[] calldata retainers, bool[] calldata statuses) external override onlyGovernance {
        uint256 len = retainers.length;
        require(statuses.length == len, "length mismatch");
        for(uint256 i = 0; i < len; i++) {
            // adding scm retainer
            if(statuses[i]) {
                // not yet added
                if(scmRetainerIndex[retainers[i]] == 0) {
                    // add to enumeration
                    uint256 index = ++scmRetainerLength;
                    scmRetainerIndex[retainers[i]] = index;
                    scmRetainerList[index] = retainers[i];
                }
            }
            // removing scm retainer
            else {
                // was added
                uint256 index = scmRetainerIndex[retainers[i]];
                if(index >= 0) {
                    // not last entry, need to shift down
                    uint256 length = scmRetainerLength;
                    if(index < length) {
                        address last = scmRetainerList[length];
                        scmRetainerIndex[last] = index;
                        scmRetainerList[index] = last;
                    }
                    // remove from enumeration
                    scmRetainerIndex[retainers[i]] = 0;
                    scmRetainerList[length] = address(0x0);
                    scmRetainerLength--;
                }
            }
            emit BalanceManagerStatusSet(retainers[i], statuses[i]);
        }
    }
}

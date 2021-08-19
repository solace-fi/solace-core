// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./Governable.sol";
import "./interface/IRegistry.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IRiskManager.sol";
import "./interface/IVault.sol";

/**
 * @title Vault
 * @author solace.fi
 * @notice The `Vault` smart contract enables `Capital Providers` to deposit **ETH** to mint shares of the `Vault`. Shares are represented as `CP Tokens` and extend ERC20.
 */
contract Vault is ERC20Permit, IVault, ReentrancyGuard, Governable {
    using SafeERC20 for IERC20;
    using Address for address;

    // pauses deposits
    bool public emergencyShutdown;

    /// WETH
    IWETH9 public override weth;

    /// Registry of protocol contract addresses
    IRegistry public registry;

    // capital providers must wait some time in this range in order to withdraw
    // used to prevent withdraw before claim payout
    /// @notice The minimum amount of time a user must wait to withdraw funds.
    uint40 public override cooldownMin = 604800;  // 7 days

    /// @notice The maximum amount of time a user must wait to withdraw funds.
    uint40 public override cooldownMax = 3024000; // 35 days

    // The timestamp that a depositor's cooldown started.
    mapping(address => uint40) public override cooldownStart;

    // Returns true if the destination is authorized to request ETH.
    mapping(address => bool) public override isRequestor;

    constructor (address _governance, address _registry, address _weth) ERC20("Solace CP Token", "SCP") ERC20Permit("Solace CP Token") Governable(_governance) {
        registry = IRegistry(_registry);
        weth = IWETH9(payable(_weth));
    }

    /*************
    GOVERNANCE FUNCTIONS
    *************/

    /**
     * @notice Activates or deactivates emergency shutdown.
     * Can only be called by the current `governor`.
     * During Emergency Shutdown:
     * 1. No users may deposit into the `Vault`.
     * 2. Withdraws can bypass cooldown.
     * 3. Only `governance` may undo Emergency Shutdown.
     * @param active If true, the `Vault` goes into Emergency Shutdown.
     * If false, the `Vault` goes back into Normal Operation.
    */
    function setEmergencyShutdown(bool active) external override onlyGovernance {
        emergencyShutdown = active;
        emit EmergencyShutdown(active);
    }

    /**
     * @notice Sets the `minimum` and `maximum` amount of time in seconds that a user must wait to withdraw funds.
     * Can only be called by the current `governor`.
     * @param _min Minimum time in seconds.
     * @param _max Maximum time in seconds.
     */
    function setCooldownWindow(uint40 _min, uint40 _max) external override onlyGovernance {
        require(_min < _max, "invalid window");
        cooldownMin = _min;
        cooldownMax = _max;
    }

    /**
     * @notice Adds or removes requesting rights. The `requestor` can be user account or smart contract.
     * Can only be called by the current `governor`.
     * @param _dst The requestor address.
     * @param _status True to add or false to remove rights.
     */
    function setRequestor(address _dst, bool _status) external override onlyGovernance {
        isRequestor[_dst] = _status;
    }

    /*************
    EXTERNAL FUNCTIONS
    *************/

    /**
     * @notice Allows a user to deposit **ETH** into the `Vault`(becoming a **Capital Provider**).
     * Shares of the `Vault` (CP tokens) are minted to caller.
     * It is called when `Vault` receives **ETH**.
     * It issues the amount of token share respected to the deposit to the `recipient`.
     * Reverts if `Vault` is in **Emergency Shutdown**
     * @return tokens The number of shares minted.
     */
    function depositEth() public payable override nonReentrant returns (uint256) {
        // mint
        return _deposit(msg.value);
    }

    /**
     * @notice Allows a user to deposit **WETH** into the `Vault`(becoming a **Capital Provider**).
     * Shares of the Vault (CP tokens) are minted to caller.
     * It issues the amount of token share respected to the deposit to the `recipient`.
     * Reverts if `Vault` is in Emergency Shutdown
     * @param _amount Amount of weth to deposit.
     * @return tokens The number of shares minted.
     */
    function depositWeth(uint256 _amount) external override nonReentrant returns (uint256) {
        // pull weth
        SafeERC20.safeTransferFrom(weth, msg.sender, address(this), _amount);
        // mint
        return _deposit(_amount);
    }

    /**
     * @notice Handles minting of tokens during deposit. It is called by **depositEth()** or **depositWeth()**.
     * @param _amount Amount of **ETH** or **WETH** deposited.
     * @return tokens The number of shares minted.
     */
    function _deposit(uint256 _amount) internal returns (uint256) {
        require(!emergencyShutdown, "cannot deposit when vault is in emergency shutdown");
        // stop cooldown
        if(cooldownStart[msg.sender] != 0) cooldownStart[msg.sender] = 0;
        // calculate and mint shares
        uint256 ts = totalSupply();
        uint256 ta = _totalAssets() - _amount;
        uint256 shares = (ts == 0 || ta == 0)
          ? _amount
          : (_amount * ts / ta);
        _mint(msg.sender, shares);
        emit DepositMade(msg.sender, _amount, shares);
        return shares;
    }

    /**
     * @notice Starts the **cooldown** period for the user.
     */
    function startCooldown() external override {
        cooldownStart[msg.sender] = uint40(block.timestamp);
    }

    /**
     * @notice Stops the **cooldown** period for the user.
     */
    function stopCooldown() external override {
        cooldownStart[msg.sender] = 0;
    }

    /**
     * @notice Allows a user to redeem shares for **ETH**.
     * Burns **CP**(Capital Provider) tokens and transfers **ETH** to the **Capital Provider**.
     * @param _shares amount of shares to redeem.
     * @return value The amount in **ETH** that the shares where redeemed for.
     */
    function withdrawEth(uint256 _shares) external override nonReentrant returns (uint256) {
        uint256 value = _withdraw(_shares);
        // unwrap weth
        if(value > address(this).balance) {
            weth.withdraw(value - address(this).balance);
        }
        // transfer eth
        payable(msg.sender).transfer(value);
        emit WithdrawalMade(msg.sender, value);
        return value;
    }

    /**
     * @notice Allows a user to redeem shares for **WETH**.
     * Burns **CP**(Capital Provider) tokens and transfers **WETH** to the **Capital Provider**.
     * @param _shares amount of shares to redeem.
     * @return value The amount in **WETH** that the shares where redeemed for.
     */
    function withdrawWeth(uint256 _shares) external override nonReentrant returns (uint256) {
        uint256 value = _withdraw(_shares);
        // wrap eth
        uint256 balance = weth.balanceOf(address(this));
        if(value > balance) {
            weth.deposit{value: value - balance}();
        }
        // transfer weth
        SafeERC20.safeTransfer(weth, msg.sender, value);
        emit WithdrawalMade(msg.sender, value);
        return value;
    }

    /**
     * @notice Handles burning of tokens during withdraw.
     * @param _shares amount of shares to redeem.
     * @return value The amount in **ETH** that the shares where redeemed for.
     */
    function _withdraw(uint256 _shares) internal returns (uint256) {
        // validate shares to withdraw
        require(_shares <= balanceOf(msg.sender), "cannot redeem more shares than you own");
        uint256 value = _shareValue(_shares);
        // bypass some checks in emergency shutdown
        if(!emergencyShutdown) {
            // Stop withdrawal if process brings the Vault's `totalAssets` value below minimum capital requirement
            uint256 mcr = IRiskManager(registry.riskManager()).minCapitalRequirement();
            require(_totalAssets() - value >= mcr, "withdrawal brings Vault assets below MCR");
            // validate cooldown
            require(canWithdraw(msg.sender), "not in cooldown window");
        }
        // burn shares
        _burn(msg.sender, _shares);
        return value;
    }

    /**
     * @notice Sends **ETH** to other users or contracts. The users or contracts should be authorized requestors.
     * Can only be called by authorized `requestors`.
     * @param _amount The amount of **ETH** wanted.
     * @return amount The amount of **ETH** sent.
     */
    function requestEth(uint256 _amount) external override nonReentrant returns (uint256) {
        require(isRequestor[msg.sender], "!requestor");
        // unwrap some WETH to make ETH available for claims payout
        if(_amount > address(this).balance) {
            uint256 wanted = _amount - address(this).balance;
            uint256 withdrawAmount = min(weth.balanceOf(address(this)), wanted);
            weth.withdraw(withdrawAmount);
        }
        // transfer funds
        uint256 transferAmount = min(_amount, address(this).balance);
        payable(msg.sender).transfer(transferAmount);
        emit FundsSent(transferAmount);
        return transferAmount;
    }


    /*************
    EXTERNAL VIEW FUNCTIONS
    *************/

    /**
    * @notice Returns the maximum redeemable shares by the `user` such that `Vault` does not go under **MCR**(Minimum Capital Requirement).
    * @param user The adddress of user to check.
    * @return balance The max redeemable shares by the user.
    */
    function maxRedeemableShares(address user) external view override returns (uint256) {
        uint256 userBalance = balanceOf(user);
        uint256 vaultBalanceAfterWithdraw = _totalAssets() - _shareValue(userBalance);

        // if user's CP token balance takes Vault `totalAssets` below MCR,
        //... return the difference between totalAsset and MCR (in # shares)
        uint256 mcr = IRiskManager(registry.riskManager()).minCapitalRequirement();
        if (vaultBalanceAfterWithdraw < mcr) {
            uint256 diff = _totalAssets() - mcr;
            return _sharesForAmount(_shareValue(diff));
        } else {
            // else, user can withdraw up to their balance of CP tokens
            return userBalance;
        }
    }

    /**
     * @notice Returns the total quantity of all assets under control of this
        `Vault`, including those loaned out to a `Strategy` as well as those currently
        held in the `Vault`.
     * @return totalAssets The total assets under control of this vault.
    */
    function totalAssets() external view override returns (uint256) {
        return _totalAssets();
    }

    /**
     * @notice Returns true if the user is allowed to receive or send vault shares.
     * @param _user User to query.
     * return status True if can transfer.
     */
    function canTransfer(address _user) external view override returns (bool status) {
        uint40 start = cooldownStart[_user];
        uint40 timestamp = uint40(block.timestamp);
        uint40 elapsed = timestamp - start;
        // cooldown timer not started or
        // past withdrawable period
        return start == 0 || elapsed >= cooldownMax;
    }

    /**
     * @notice Returns true if the user is allowed to withdraw vault shares.
     * @param _user User to query.
     * return status True if can withdraw.
     */
    function canWithdraw(address _user) public view override returns (bool status) {
        // validate cooldown
        uint40 elapsed = uint40(block.timestamp) - cooldownStart[_user];
        // cooldownMin <= elapsed <= cooldownMax
        return cooldownMin <= elapsed && elapsed <= cooldownMax;
    }


    /*************
    INTERNAL VIEW FUNCTIONS
    *************/

    /**
     * @notice Internal function that returns quantity of all assets under control of this `Vault`, including those loaned out to `Strategies`.
     * Called by **totalAssets()** function.
     * @return totalAssets The total assets under control of this vault.
     */
    function _totalAssets() internal view returns (uint256) {
        return weth.balanceOf(address(this)) + address(this).balance;
    }

    /**
     * @notice Internal function that determines the current value of given shares.
     * @param shares The amount of shares to calculate value for.
     * @return value The amount of value for given shares.
     */
    function _shareValue(uint256 shares) internal view returns (uint256) {
        // using 1e3 for extra precision here when decimals is low
        return (totalSupply() == 0)
            ? 0
            : (((10 ** 3 * (shares * _totalAssets())) / totalSupply()) / 10 ** 3);
    }

    /**
     * @notice Internal function that determines how many shares for given amount of token would receive.
     * @param amount of tokens to calculate number of shares for.
     * @return shares The amount of shares(tokens) for given amount.
     */
    function _sharesForAmount(uint256 amount) internal view returns (uint256) {
        // NOTE: if sqrt(token.totalSupply()) > 1e37, this could potentially revert
        return (_totalAssets() > 0)
            ? (((10 ** 3 * (amount * totalSupply())) / _totalAssets()) / 10 ** 3)
            : 0;
    }

    /**
     * @notice Internal function that returns the minimum value between two values.
     * @param a  The first value.
     * @param b  The second value.
     * @return minValue The minimum value.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /**
     * @notice Internal function that is called before token transfer in order to apply some security check.
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        // only care about user->user transfers
        // mint and burn are validated in deposit and withdraw
        if(from != address(0x0) && to != address(0x0)) {
            // bypass check in emergency shutdown
            if(!emergencyShutdown) {
                uint40 cdm = cooldownMax;
                uint40 start1 = cooldownStart[from];
                uint40 start2 = cooldownStart[to];
                uint40 timestamp = uint40(block.timestamp);
                uint40 elapsed1 = timestamp - start1;
                uint40 elapsed2 = timestamp - start2;
                require(
                    (start1 == 0 || elapsed1 >= cdm) &&
                    (start2 == 0 || elapsed2 >= cdm),
                    "cannot transfer during cooldown"
                );
            }
        }
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @notice Fallback function to allow contract to receive *ETH*.
     * Does not mint **CP** tokens.
     */
    receive() external payable { }

    /**
     * @notice Fallback function to allow contract to receive **ETH**.
     * Does not mint **CP** tokens.
     */
    fallback() external payable { }
}

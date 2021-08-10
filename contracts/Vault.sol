// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interface/IWETH9.sol";
import "./interface/IRegistry.sol";
import "./interface/IPolicyManager.sol";
import "./interface/IRiskManager.sol";
import "./interface/IVault.sol";

/**
 * @title Vault
 * @author solace.fi
 * @notice Capital Providers can deposit ETH to mint shares of the Vault (CP tokens)
 */
contract Vault is ERC20Permit, IVault, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address;

    /// @notice Governor.
    address public override governance;

    /// @notice Governance to take over.
    address public override newGovernance;

    // pauses deposits
    bool public emergencyShutdown;

    /// WETH
    IERC20 public override token;

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

    constructor (address _governance, address _registry, address _token) ERC20("Solace CP Token", "SCP") ERC20Permit("Solace CP Token") {
        governance = _governance;
        registry = IRegistry(_registry);
        token = IERC20(_token);
    }

    /*************
    GOVERNANCE FUNCTIONS
    *************/

    /**
     * @notice Allows governance to be transferred to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external override {
        // can only be called by governor
        require(msg.sender == governance, "!governance");
        newGovernance = _governance;
    }

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external override {
        // can only be called by new governor
        require(msg.sender == newGovernance, "!governance");
        governance = newGovernance;
        newGovernance = address(0x0);
        emit GovernanceTransferred(msg.sender);
    }

    /**
     * @notice Activates or deactivates emergency shutdown.
     * Can only be called by the current governor.
     * During Emergency Shutdown:
     * 1. No users may deposit into the Vault.
     * 2. Withdrawls can bypass cooldown.
     * 3. Only Governance may undo Emergency Shutdown.
     * @param active If true, the Vault goes into Emergency Shutdown.
     * If false, the Vault goes back into Normal Operation.
    */
    function setEmergencyShutdown(bool active) external override {
        require(msg.sender == governance, "!governance");
        emergencyShutdown = active;
        emit EmergencyShutdown(active);
    }

    /**
     * @notice Sets the minimum and maximum amount of time a user must wait to withdraw funds.
     * Can only be called by the current governor.
     * @param _min Minimum time in seconds.
     * @param _max Maximum time in seconds.
     */
    function setCooldownWindow(uint40 _min, uint40 _max) external override {
        require(msg.sender == governance, "!governance");
        require(_min < _max, "invalid window");
        cooldownMin = _min;
        cooldownMax = _max;
    }

    /**
     * @notice Adds or removes requesting rights.
     * Can only be called by the current governor.
     * @param _dst The requestor.
     * @param _status True to add or false to remove rights.
     */
    function setRequestor(address _dst, bool _status) external override {
        require(msg.sender == governance, "!governance");
        isRequestor[_dst] = _status;
    }

    /*************
    EXTERNAL FUNCTIONS
    *************/

    /**
     * @notice Allows a user to deposit ETH into the Vault (becoming a Capital Provider)
     * Shares of the Vault (CP tokens) are minted to caller
     * Called when Vault receives ETH
     * Deposits `_amount` `token`, issuing shares to `recipient`.
     * Reverts if Vault is in Emergency Shutdown
     */
    function depositEth() public payable override nonReentrant {
        require(!emergencyShutdown, "cannot deposit when vault is in emergency shutdown");
        // stop cooldown
        if(cooldownStart[msg.sender] != 0) cooldownStart[msg.sender] = 0;
        // pull eth
        uint256 amount = msg.value;
        // calculate and mint shares
        uint256 ts = totalSupply();
        uint256 ta = _totalAssets() - amount;
        uint256 shares = (ts == 0 || ta == 0)
          ? amount
          : (amount * ts / ta);
        _mint(msg.sender, shares);
        emit DepositMade(msg.sender, amount, shares);
    }

    /**
     * @notice Allows a user to deposit WETH into the Vault (becoming a Capital Provider)
     * Shares of the Vault (CP tokens) are minted to caller
     * Deposits `_amount` `token`, issuing shares to `recipient`.
     * Reverts if Vault is in Emergency Shutdown
     * @param amount Amount of weth to deposit.
     */
    function depositWeth(uint256 amount) external override nonReentrant {
        require(!emergencyShutdown, "cannot deposit when vault is in emergency shutdown");
        // stop cooldown
        if(cooldownStart[msg.sender] != 0) cooldownStart[msg.sender] = 0;
        // pull weth
        SafeERC20.safeTransferFrom(token, msg.sender, address(this), amount);
        // calculate and mint shares
        uint256 ts = totalSupply();
        uint256 ta = _totalAssets() - amount;
        uint256 shares = (ts == 0 || ta == 0)
          ? amount
          : (amount * ts / ta);
        _mint(msg.sender, shares);
        emit DepositMade(msg.sender, amount, shares);
    }

    /**
     * @notice Starts the cooldown.
     */
    function startCooldown() external override {
        cooldownStart[msg.sender] = uint40(block.timestamp);
    }

    /**
     * @notice Stops the cooldown.
     */
    function stopCooldown() external override {
        cooldownStart[msg.sender] = 0;
    }

    /**
     * @notice Allows a user to redeem shares for ETH
     * Burns CP tokens and transfers ETH to the CP
     * @param shares amount of shares to redeem
     * @return value in ETH that the shares where redeemed for
     */
    function withdraw(uint256 shares) external override nonReentrant returns (uint256) {
        // validate shares to withdraw
        require(shares <= balanceOf(msg.sender), "cannot redeem more shares than you own");
        uint256 value = _shareValue(shares);
        // bypass some checks in emergency shutdown
        if(!emergencyShutdown) {
            // Stop withdrawal if process brings the Vault's `totalAssets` value below minimum capital requirement
            uint256 mcr = IRiskManager(registry.riskManager()).minCapitalRequirement();
            require(_totalAssets() - value >= mcr, "withdrawal brings Vault assets below MCR");
            // validate cooldown
            uint40 elapsed = uint40(block.timestamp) - cooldownStart[msg.sender];
            require(cooldownMin <= elapsed && elapsed <= cooldownMax, "not in cooldown window");
        }
        // burn shares and transfer ETH to withdrawer
        _burn(msg.sender, shares);
        // unwrap weth
        if(value > address(this).balance) {
            IWETH9(payable(address(token))).withdraw(value - address(this).balance);
        }
        payable(msg.sender).transfer(value);
        emit WithdrawalMade(msg.sender, value);
        return value;
    }

    /**
     * @notice Sends ETH to other users or contracts.
     * Can only be called by authorized requestors.
     * @param _amount Amount of ETH wanted.
     * @return Amount of ETH sent.
     */
    function requestEth(uint256 _amount) external override nonReentrant returns (uint256) {
        require(isRequestor[msg.sender], "!requestor");
        // unwrap some WETH to make ETH available for claims payout
        if(_amount > address(this).balance) {
            IWETH9 weth = IWETH9(payable(address(token)));
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
    * @notice Returns the maximum redeemable shares by the `user` such that Vault does not go under MCR
    * @param user Address of user to check
    * @return Max redeemable shares by the user
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
        Vault, including those loaned out to a Strategy as well as those currently
        held in the Vault.
     * @return The total assets under control of this vault.
    */
    function totalAssets() external view override returns (uint256) {
        return _totalAssets();
    }


    /*************
    INTERNAL VIEW FUNCTIONS
    *************/

    /**
     * @notice Quantity of all assets under control of this Vault, including those loaned out to Strategies
     */
    function _totalAssets() internal view returns (uint256) {
        return token.balanceOf(address(this)) + address(this).balance;
    }

    /**
     * @notice Determines the current value of `shares`
     * @param shares amount of shares to calculate value for.
     */
    function _shareValue(uint256 shares) internal view returns (uint256) {
        // using 1e3 for extra precision here when decimals is low
        return totalSupply() == 0
            ? 0
            : ((10 ** 3 * (shares * _totalAssets())) / totalSupply()) / 10 ** 3;
    }

    /**
     * @notice Determines how many shares `amount` of token would receive.
     * @param amount of tokens to calculate number of shares for
     */
    function _sharesForAmount(uint256 amount) internal view returns (uint256) {
        // NOTE: if sqrt(token.totalSupply()) > 1e37, this could potentially revert
        return _totalAssets() > 0
            ? ((10 ** 3 * (amount * totalSupply())) / _totalAssets()) / 10 ** 3
            : 0;
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

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
     * @notice Fallback function to allow contract to receive ETH
     * Mints CP tokens to caller if caller is not Vault or WETH or Treasury
     */
    receive() external payable { }

    /**
     * @notice Fallback function to allow contract to receive ETH
     * Mints CP tokens to caller if caller is not Vault or WETH or Treasury
     */
    fallback() external payable { }
}

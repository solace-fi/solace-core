// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;


/**
 * @title ITreasury
 * @author solace.fi
 * @notice The interface of the war chest of Castle Solace.
 */
interface ITreasury {

    // events
    // Emitted when eth is deposited
    event EthDeposited(uint256 _amount);
    // Emitted when a token is deposited
    event TokenDeposited(address _token, uint256 _amount);
    // Emitted when a token is spent
    event FundsSpent(address _token, uint256 _amount, address _recipient);
    // Emitted when Governance is set
    event GovernanceTransferred(address _newGovernance);

    /**
     * Receive function. Deposits eth.
     */
    receive() external payable;

    /**
     * Fallback function. Deposits eth.
     */
    fallback () external payable;

    /// @notice Governance.
    function governance() external view returns (address);

    /// @notice Governance to take over.
    function newGovernance() external view returns (address);

    /**
     * @notice Transfers the governance role to a new governor.
     * Can only be called by the current governor.
     * @param _governance The new governor.
     */
    function setGovernance(address _governance) external;

    /**
     * @notice Accepts the governance role.
     * Can only be called by the new governor.
     */
    function acceptGovernance() external;

    /**
     * @notice Deposits some ether.
     */
    function depositEth() external payable;

    /**
     * @notice Deposit some ERC20 token.
     * @param _token The address of the token to deposit.
     * @param _amount The amount of the token to deposit.
     */
    function depositToken(address _token, uint256 _amount) external;

    /**
     * @notice Spends some tokens.
     * Can only be called by the current governor.
     * @param _token The address of the token to spend.
     * @param _amount The amount of the token to spend.
     * @param _recipient The address of the token receiver.
     */
    function spend(address _token, uint256 _amount, address _recipient) external;

    /**
     * @notice Manually swaps a token.
     * Can only be called by the current governor.
     * @dev Swaps the entire balance in case some tokens were unknowingly received.
     * Reverts if the swap was unsuccessful.
     * @param _path The path of pools to take.
     * @param _amountIn The amount to swap.
     * @param _amountOutMinimum The minimum about to receive.
     */
    function swap(bytes memory _path, uint256 _amountIn, uint256 _amountOutMinimum) external;

    /**
     * @notice Sets the premium recipients and their weights.
     * Can only be called by the current governor.
     * @param _recipients The premium recipients.
     * @param _weights The recipient weights.
     */
    function setPremiumRecipients(address payable[] calldata _recipients, uint32[] calldata _weights) external;

    /**
     * @notice Routes the premiums to the recipients
     */
    function routePremiums() external payable;

    /**
     * @notice Wraps some eth into weth.
     * Can only be called by the current governor.
     * @param _amount The amount to wrap.
     */
    function wrap(uint256 _amount) external;

    /**
     * @notice Unwraps some weth into eth.
     * Can only be called by the current governor.
     * @param _amount The amount to unwrap.
     */
    function unwrap(uint256 _amount) external;

    // used in Product
    function refund(address _user, uint256 _amount) external;

    /**
     * @notice The amount of eth that a user is owed if any.
     * @param _user The user.
     * @return The amount.
     */
    function unpaidRefunds(address _user) external view returns (uint256);

    /**
     * @notice Pull any unpaid rewards.
     */
    function withdraw() external;
}

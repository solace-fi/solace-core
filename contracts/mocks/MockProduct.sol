// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.6;

import "../products/BaseProduct.sol";

/**
 * @title MockProduct
 * @author solace.fi
 * @notice Mock product for testing purposes.
 */
contract MockProduct is BaseProduct {
    /// @notice The position value for the product.
    uint256 public positionValue = 1000000000000000000;

    /**
      * @notice The constructor.
      * @param _governance The governor.
      * @param _policyManager The IPolicyManager contract.
      * @param _registry The IRegistry contract.
      * @param _coveredPlatform A platform contract which locates contracts that are covered by this product.
      * @param _minPeriod The minimum policy period in blocks to purchase a **policy**.
      * @param _maxPeriod The maximum policy period in blocks to purchase a **policy**.
      * @param _price The cover price for the **Product**.
      * @param _maxCoverPerUserDivisor The max cover amount divisor for per user. (maxCover / divisor = maxCoverPerUser).
     */
    constructor (
        address _governance,
        IPolicyManager _policyManager,
        IRegistry _registry,
        address _coveredPlatform,
        uint40 _minPeriod,
        uint40 _maxPeriod,
        uint24 _price,
        uint32 _maxCoverPerUserDivisor
    ) BaseProduct(
        _governance,
        _policyManager,
        _registry,
        _coveredPlatform,
        _minPeriod,
        _maxPeriod,
        _price,
        _maxCoverPerUserDivisor
    )
    // solhint-disable-next-line no-empty-blocks
    { }

    /**
     * @notice It gives the user's total position in the product's protocol.
     * The `_positionContract` must be a **cToken** including **cETH** (Please see https://compound.finance/markets and https://etherscan.io/accounts/label/compound).
     * @param _buyer The `buyer` who is requesting the coverage quote.
     * @param _positionContract The address of the exact smart contract the `buyer` has their position in (e.g., for UniswapProduct this would be Pair's address).
     * @return positionAmount The user's total position in **Wei** in the product's protocol.
     */
    // solhint-disable-next-line no-unused-vars
    function appraisePosition(address _buyer, address _positionContract) public view override returns (uint256 positionAmount) {
        return positionValue; // given value for now in production this will be from a pool contract
    }

    /**
     * @notice The function sets the user's position value for the product.
     * @param _value The new position value for the product.
     */
    function setPositionValue(uint256 _value) external {
        positionValue = _value;
    }

    /**
     * @notice The function sets the policy's expiration block.
     * @param _policyID, The policy id to set expiration for.
     * @param _expirationBlock The new expiration block for the policy.
     */
    function setPolicyExpiration(uint256 _policyID, uint40 _expirationBlock) external {
        (address policyholder, , address positionContract, uint256 coverAmount, , uint24 price) = policyManager.getPolicyInfo(_policyID);
        policyManager.setPolicyInfo(_policyID, policyholder, positionContract, coverAmount, _expirationBlock, price);
    }

    /**
     * @notice The function purchases and deploys a policy on the behalf of the policyholder. It returns the id of newly created policy.
     * @param _policyholder Who's liquidity is being covered by the policy.
     * @param _positionContract The contract address where the policyholder has a position to be covered.
     * @param _coverAmount The value to cover in **ETH**.
     * @param _blocks The length (in blocks) for policy.
     * @return policyID The policy id.
     */
    function _buyPolicy(address _policyholder, address _positionContract, uint256 _coverAmount, uint40 _blocks) external payable nonReentrant returns (uint256 policyID){
        // create the policy
        uint40 expirationBlock = uint40(block.number + _blocks);
        policyID = policyManager.createPolicy(_policyholder, _positionContract, _coverAmount, expirationBlock, price);

        // update local book-keeping variables
        activeCoverAmount += positionValue;
        productPolicyCount++;

        emit PolicyCreated(policyID);

        return policyID;
    }

    /**
     * @notice Returns the name of the product.
     * @return Mock The name of the product.
     */
    function name() public pure override returns (string memory) {
        return "Mock";
    }
}

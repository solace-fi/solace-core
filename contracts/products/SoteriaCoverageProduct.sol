// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../Governable.sol";
import "../interface/ITreasury.sol";
import "../interface/IPolicyManager.sol";
import "../interface/IRegistry.sol";
import "../interface/IRiskManager.sol";
import "../interface/ISoteriaCoverageProduct.sol";
import "hardhat/console.sol";

contract SoteriaCoverageProduct is ISoteriaCoverageProduct, ERC721, EIP712, ReentrancyGuard, Governable {
    using Address for address;

    /***************************************
    GLOBAL VARIABLES
    ***************************************/

    /// @notice Typehash for claim submissions.
    // solhint-disable-next-line var-name-mixedcase
    bytes32 internal immutable _SUBMIT_CLAIM_TYPEHASH;

    /// @notice Registry contract.
    IRegistry internal _registry;

    /// @notice RiskManager contract
    IRiskManager internal _riskManager;

    /// @notice Cannot buy new policies while paused. (Default is False)
    bool internal _paused;

    /***************************************
    BOOK-KEEPING VARIABLES
    ***************************************/

    /// @notice The current amount covered (in wei).
    uint256 internal _activeCoverAmount;

    /// @notice The total policy count.
    uint256 internal _totalPolicyCount;

    /// @notice The policy holder funds.
    mapping(address => uint256) internal _funds;

    /// @notice The policy holder debts.
    mapping(address => uint256) internal _debts;

    /// @notice The policyholder => policyID.
    mapping(address => uint256) internal _ownerToPolicy;

    /// @notice The policyID => policyholder.
    mapping(uint256 => address) internal _policyToOwner;

    /// @notice The cover amount for each policy(policyID => coverAmount).
    mapping (uint256 => uint256) internal _coverAmountOf;

    /***************************************
    MODIFIERS
    ***************************************/
    modifier whileUnpaused() {
        require(!_paused, "contract paused");
        _;
    }

    /**
     * @notice Constructs `Soteria` product.
     * @param governance_ The governor.
     * @param registry_ The [`Registry`](./Registry) contract address.
     * @param typehash_ The typehash for submitting claims.
     * @param domain_ The user readable name of the EIP712 signing domain.
     * @param version_ The current major version of the signing domain.
     */
    constructor(
        address governance_,
        address registry_,
        bytes32 typehash_,
        string memory domain_,
        string memory version_
    ) ERC721("Soteria Policy", "SOPT") Governable(governance_) EIP712(domain_, version_) {
        // set registry
        require(registry_ != address(0x0), "zero address registry");
        _registry = IRegistry(registry_);

        // set risk manager
        require(_registry.riskManager() != address(0x0), "zero address riskmanager");
        _riskManager = IRiskManager(_registry.riskManager());

        _SUBMIT_CLAIM_TYPEHASH = typehash_;
    }
    
    /***************************************
    FALLBACK FUNCTIONS
    ***************************************/

    /**
     * @notice Fallback function to allow contract to receive *ETH*.
    */
    // solhint-disable-next-line 
    receive() external payable nonReentrant {
        _deposit(msg.sender, msg.value);
    }

    /**
     * @notice Fallback function to allow contract to receive *ETH*.
    */
    fallback() external payable nonReentrant {
        _deposit(msg.sender, msg.value);
    }

    /***************************************
    POLICY FUNCTIONS
    ***************************************/

    /**
     * @notice  Purchases and mints a policy on the behalf of the policyholder.
     * @param policyholder_ Holder of the position to cover.
     * @param coverAmount_ The value to cover in **ETH**
     * @return policyID The ID of newly created policy.
    */
    function buyPolicy(address policyholder_, uint256 coverAmount_) external payable override whileUnpaused returns (uint256 policyID) {
        require(policyholder_ != address(0x0), "zero address policyholder");
        require(coverAmount_ > 0, "zero cover value");
        require(funds(policyholder_) > 0 || msg.value > 0, "zero fund");
        require(balanceOf(policyholder_) == 0, "already bought policy");
        require(assessRisk(0, coverAmount_), "cannot accept that risk");

        // deposit funds
        _deposit(policyholder_, msg.value);

        // update cover amount
        _activeCoverAmount += coverAmount_;

        policyID = ++_totalPolicyCount;
        _coverAmountOf[policyID] += coverAmount_;
        _ownerToPolicy[policyholder_] = policyID;
        _policyToOwner[policyID] = policyholder_;
        _mint(policyholder_, policyID);

        emit PolicyCreated(policyID);
        return policyID;
    }

    /**
     * @notice Deposits funds for policy holders.
     * @param policyholder_ The holder of the policy.
    */
    function deposit(address policyholder_) external payable override whileUnpaused {
        _deposit(policyholder_, msg.value);
    }

    /**
     * @notice Charge premiums for each policy holder.
     * @param holders_ The policy holders.
     * @param premiums_ The premium amounts in `wei` per policy holder.
    */
    function chargePremiums(address[] calldata holders_, uint256[] calldata premiums_) external payable override onlyGovernance whileUnpaused {
        uint256 count = holders_.length;
        require(count == premiums_.length, "length mismatch");
        require(count == policyCount(), "policy count mismatch");
        
        uint256 amountToPay = 0;
        uint256 holderFunds = 0;
        address holder = address(0);
        for (uint256 i = 0; i < count; i++) {
            holder = holders_[i];
            holderFunds = funds(holder);
            amountToPay = debts(holder) + premiums_[i];
            if (amountToPay >= holderFunds) {
                _debts[holder] = amountToPay - holderFunds;
                _funds[holder] = 0;
                amountToPay = holderFunds;
            } else {
                _debts[holder] = 0;
                _funds[holder] = holderFunds - amountToPay;
            }
            // transfer premium to the treasury
            ITreasury(payable(_registry.treasury())).routePremiums{value: amountToPay}();
            emit PremiumCharged(holder, amountToPay);
        }
    }


    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
    * @notice Given a request for coverage, determines if that risk is acceptable and if so at what price.
    * @param currentCover_ If updating an existing policy's cover amount, the current cover amount, otherwise 0.
    * @param newCover_ The cover amount requested.
    * @return acceptable True if risk of the new cover is acceptable, false otherwise.
    */
    function assessRisk(uint256 currentCover_, uint256 newCover_) public view override returns (bool acceptable) {
        uint256 mc = maxCover();
        uint256 coverAmount = activeCoverAmount();
        coverAmount = coverAmount + newCover_ - currentCover_;
        if (coverAmount > mc) return false;
        return true;
    }

    /**
     * @notice Returns the policy holder fund amount.
     * @param policyHolder_ The address of the policy holder.
     * @return amount The amount of funds.    
    */
    function funds(address policyHolder_) public view override returns (uint256 amount) {
        return _funds[policyHolder_];
    }

    /**
     * @notice Returns the policy holder debt amount.
     * @param policyHolder_ The address of the policy holder.
     * @return debt The amount of dept.    
    */
    function debts(address policyHolder_) public view override returns (uint256 debt) {
        return _debts[policyHolder_];
    }

    /**
     * @notice Returns the policy holder's policy id.
     * @param policyHolder_ The address of the policy holder.
     * @return policyID The policy id.
    */
    function policyByOwner(address policyHolder_) public view override returns (uint256 policyID) {
        return _ownerToPolicy[policyHolder_];
    }

    /**
     * @notice Returns the policy owner policy for given policy id.
     * @param policyID_ The policy id.
     * @return owner The address of the policy holder.
    */
    function ownerOfPolicy(uint256 policyID_) public view override returns (address owner) {
        return _policyToOwner[policyID_];
    }

    /**
     * @notice The maximum amount of cover that `Soteria Product` can be sold.
     * @return cover The max amount of cover in `wei`
    */
    function maxCover() public view override returns (uint256 cover) {
        return _riskManager.maxCoverPerStrategy(address(this));
    }

    /**
     * @notice Returns [`Registry`](./Registry) contract address.
     * @return registry_ The `Registry` address.
    */
    function registry() external view override returns (address registry_) {
        return address(_registry);
    }

    /**
     * @notice Returns [`RiskManager`](./RiskManager) contract address.
     * @return riskManager_ The `RiskManager` address.
    */
    function riskManager() external view override returns (address riskManager_) {
        return address(_riskManager);
    }

    /**
     * @notice Returns whether or not product is currently in paused state.
     * @return status True if product is paused.
    */
    function paused() external view override returns (bool status) {
        return _paused;
    }

    /**
     * @notice Returns active cover amount in `wei`.
     * @return amount The active cover amount.
    */
    function activeCoverAmount() public view override returns (uint256 amount) {
        return _activeCoverAmount;
    }

    /**
     * @notice Returns all policy holders.
     * @return holders The array of policy holders.
    */
    function policyholders() public view override returns (address[] memory holders) {
        uint256 count = policyCount();
        holders = new address[](count);
        for (uint256 i = count; i > 0; i--) {
            holders[i-1] = _policyToOwner[i];
        }
        return holders;
    }

    /**
     * @notice Returns the policy count.
     * @return count The policy count.
    */
    function policyCount() public view override returns (uint256 count) {
        return _totalPolicyCount;
    }

    /**
     * @notice Returns cover amount of given policy id.
     * @param policy_ The policy id.
     * @return amount The cover amount for given policy.
    */
    function coverAmountOf(uint256 policy_) public view override returns (uint256 amount) {
        return _coverAmountOf[policy_];
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param registry_ The address of `Registry` contract.
    */
    function setRegistry(address registry_) external override onlyGovernance {
        require(registry_ != address(0x0), "zero address registry");
        _registry = IRegistry(registry_);
        require(_registry.riskManager() != address(0x0), "zero address riskmanager");
        _riskManager = IRiskManager(_registry.riskManager());
        emit RegistrySet(registry_);
    }

    /**
     * @notice Pauses or unpauses buying and extending policies.
     * Cancelling policies and submitting claims are unaffected by pause.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param paused_ True to pause, false to unpause.
    */
    function setPaused(bool paused_) external override onlyGovernance {
        _paused = paused_;
        emit PauseSet(paused_);
    }

    /***************************************
    INTERNAL FUNCTIONS
    ***************************************/
    /**
     * @notice Adds funds to policy holder's balance.
     * @param policyholder The policy holder address.
     * @param amount The amount of fund to deposit.
    */
    function _deposit(address policyholder, uint256 amount) internal whileUnpaused {
        _funds[policyholder] += amount;
        emit DepositMade(policyholder, amount);
    }

}
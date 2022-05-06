// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../utils/Governable.sol";
import "../interfaces/utils/IRegistry.sol";
import "../interfaces/risk/IRiskManager.sol";
import "../interfaces/payment/ISCP.sol";
import "../interfaces/products/ISolaceCoverProductV3.sol";

/**
 * @title SolaceCoverProductV3
 * @author solace.fi
 * @notice A Solace insurance product that allows users to insure all of their DeFi positions against smart contract risk through a single policy.
 *
 * Policies can be **purchased** via [`activatePolicy()`](#activatepolicy). Policies are represented as ERC721s, which once minted, cannot then be transferred or burned. Users can change the cover limit of their policy through [`updateCoverLimit()`](#updatecoverlimit).
 *
 * The policy will remain active until i.) the user cancels their policy or ii.) the user's account runs out of funds. The policy will be billed like a subscription, every epoch a fee will be charged from the user's account.
 *
 * Users can **deposit funds** into their account via [`deposit()`](#deposit). Currently the contract only accepts deposits in **FRAX**. Note that both [`activatePolicy()`](#activatepolicy) and [`deposit()`](#deposit) enables a user to perform these actions (activate a policy, make a deposit) on behalf of another user.
 *
 * Users can **cancel** their policy via [`deactivatePolicy()`](#deactivatepolicy). This will start a cooldown timer. Users can **withdraw funds** from their account via [`withdraw()`](#withdraw).
 *
 * Before the cooldown timer starts or passes, the user cannot withdraw their entire account balance. A minimum required account balance (to cover one epoch's fee) will be left in the user's account. After the cooldown has passed, a user will be able to withdraw their entire account balance.
 *
 * Users can enter a **referral code** with [`activatePolicy()`](#activatePolicy) or [`updateCoverLimit()`](#updatecoverlimit). A valid referral code will earn reward points to both the referrer and the referee. When the user's account is charged, reward points will be deducted before solace cover dollars.
 * Each account can only enter a valid referral code once, however there are no restrictions on how many times a referral code can be used for new accounts.
 */
contract SolaceCoverProductV3 is
    ISolaceCoverProductV3,
    ERC721,
    ReentrancyGuard,
    Governable
{
    /***************************************
    STATE VARIABLES
    ***************************************/

    /// @notice Registry contract.
    IRegistry public registry;

    /// @notice RiskManager contract.
    IRiskManager public riskManager;

    /// @notice SCP(Solace Cover Points) contract.
    ISCP public scp;

    /// @notice Cannot buy new policies while paused. (Default is False)
    bool public paused;

    /// @notice The base token uri url for policies.
    string public baseURI;

    /// @notice The total policy count.
    uint256 public policyCount;

    /// @notice The maximum rate charged per second per 1e-18 (wei) of coverLimit.
    /// @dev Default to charge 10% of cover limit annually = 1/315360000.
    uint256 public maxRateNum;

    /// @notice The maximum rate denomination value.
    /// @dev  Max premium rate of 10% of cover limit per annum.
    uint256 public maxRateDenom;

    /// @notice Maximum epoch duration over which premiums are charged (Default is one week).
    uint256 public chargeCycle; 

    /// @notice The latest premium charged timestamp.
    uint256 public latestChargedTime;

    /// @notice policyholder => policyID.
    mapping(address => uint256) public policyOf;

    /// @notice policyholder => policy debt.
    mapping(address => uint256) public debtOf;

    /// @notice policyID => coverLimit.
    mapping(uint256 => uint256) public coverLimitOf;

    /***************************************
    MODIFIERS
    ***************************************/

    modifier whileUnpaused() {
        require(!paused, "contract paused");
        _;
    }

    modifier onlyCollector() {
        require(
            msg.sender == registry.get("premiumCollector") ||
            msg.sender == governance(), "!premium collector"
        );
        _;
    }

    /**
     * @notice Constructs `Solace Cover Product`.
     * @param _governance The address of the governor.
     * @param _registry The [`Registry`](./Registry) contract address.
    */
    constructor(address _governance, address _registry) ERC721("Solace Wallet Coverage", "SWC") Governable(_governance) {
        // set registry
        _setRegistry(_registry);

        // set defaults
        maxRateNum = 1;
        maxRateDenom = 315360000;
        chargeCycle = 604800;
        baseURI = string(abi.encodePacked("https://stats.solace.fi/policy/?chainID=", Strings.toString(block.chainid), "&policyID="));
    }

    /***************************************
    POLICY FUNCTIONS
    ***************************************/

    /**
     * @notice Activates policy for `msg.sender`.
     * @param _user The account to purchase policy. 
     * @param _coverLimit The maximum value to cover in **USD**.
     * @return policyID The ID of the newly minted policy.
     */
    function purchaseFor(address _user, uint256 _coverLimit) external override nonReentrant whileUnpaused returns (uint256 policyID) {
        return _purchase(_user, _coverLimit);
    }

    /**
     * @notice Activates policy for `msg.sender`.
     * @param _coverLimit The maximum value to cover in **USD**.
     * @return policyID The ID of the newly minted policy.
     */
    function purchase(uint256 _coverLimit) external override nonReentrant whileUnpaused returns (uint256 policyID) {
       return _purchase(msg.sender, _coverLimit);
    }

    /**
     * @notice Cancels the policy.
     * The function cancels the policy of the policyholder.
     */
    function cancel() external override {
        require(policyStatus(policyOf[msg.sender]), "invalid policy");
        _cancel(msg.sender);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    /**
     * @notice The maximum amount of cover that can be sold in **USD** to 18 decimals places.
     * @return cover The max amount of cover.
     */
    function maxCover() public view override returns (uint256 cover) {
        return riskManager.maxCoverPerStrategy(address(this));
    }

    /**
     * @notice Returns the active cover limit in **USD** to 18 decimal places. In other words, the total cover that has been sold at the current time.
     * @return amount The active cover limit.
     */
    function activeCoverLimit() public view override returns (uint256 amount) {
        return riskManager.activeCoverLimitPerStrategy(address(this));
    }

    /**
     * @notice Determine the available remaining capacity for new cover.
     * @return capacity The amount of available remaining capacity for new cover.
     */
    function availableCoverCapacity() public view override returns (uint256 capacity) {
        capacity = maxCover() - activeCoverLimit();
    }

    /**
     * @notice Returns true if the policy is active, false if inactive
     * @param _policyID The policy ID.
     * @return status True if policy is active. False otherwise.
     */
    function policyStatus(uint256 _policyID) public view override returns (bool status) {
        return coverLimitOf[_policyID] > 0 ? true : false;
    }

    /**
     * @notice Calculate minimum required account balance for a given cover limit. Equals the maximum chargeable fee for one epoch.
     * @param _coverLimit The maximum value to cover in **USD**.
     */
    function minRequiredAccountBalance(uint256 _coverLimit) public view override returns (uint256 mrab) {
        mrab = (maxRateNum * chargeCycle * _coverLimit) / maxRateDenom;
    }

    /**
     * @notice Calculates the minimum amount of Solace Cover Dollars required by this contract for the account to hold.
     * @param _policyholder The account to query.
     * @return amount The amount of SCD the account must hold.
     */
    function minScpRequired(address _policyholder) external view override returns (uint256 amount) {
          return minRequiredAccountBalance(coverLimitOf[policyOf[_policyholder]]) + debtOf[_policyholder];
    }

    /**
     * @notice Returns the Uniform Resource Identifier (URI) for `policyID`.
     * @param policyID The policy ID.
     */
    function tokenURI(uint256 policyID) public view virtual override returns (string memory uri) {
        require(_exists(policyID), "invalid policy");
        return string(abi.encodePacked(baseURI, Strings.toString(policyID)));
    }

    /**
     * @notice Calculates the policy cancellation fee.
     * @param policyID The policy id.
     * @return fee The cancellation fee.
    */
    function calculateCancelFee(uint256 policyID) public view override returns (uint256 fee) {
        // calculate cancellation fee
        if (latestChargedTime > 0) {
            return (minRequiredAccountBalance(coverLimitOf[policyID]) * ((block.timestamp - latestChargedTime) / 86400)) / chargeCycle;
        }
        return 0;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the [`Registry`](./Registry) contract address.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _registry The address of `Registry` contract.
     */
    function setRegistry(address _registry) external override onlyGovernance {
        _setRegistry(_registry);
    }

    /**
     * @notice Pauses or unpauses policies.
     * Deactivating policies are unaffected by pause.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _paused True to pause, false to unpause.
     */
    function setPaused(bool _paused) external override onlyGovernance {
        paused = _paused;
        emit PauseSet(_paused);
    }

    /**
     * @notice set _maxRate.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _maxRateNum Desired maxRateNum.
     * @param _maxRateDenom Desired maxRateDenom.
     */
    function setMaxRate(uint256 _maxRateNum, uint256 _maxRateDenom) external override onlyGovernance {
        maxRateNum = _maxRateNum;
        maxRateDenom = _maxRateDenom;
        emit MaxRateSet(_maxRateNum, _maxRateDenom);
    }

    /**
     * @notice Sets maximum epoch duration over which premiums are charged.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param _chargeCycle The charge period to set.
     */
    function setChargeCycle(uint256 _chargeCycle) external override onlyGovernance {
        chargeCycle = _chargeCycle;
        emit ChargeCycleSet(_chargeCycle);
    }

    /**
     * @notice Sets the base URI for computing `tokenURI`.
     * @param _baseURI The new base URI.
     */
    function setBaseURI(string memory _baseURI) external override onlyGovernance {
        baseURI = _baseURI;
        emit BaseURISet(_baseURI);
    }

    /***************************************
    PREMIUM COLLECTOR FUNCTIONS
    ***************************************/

    /**
     * @notice Sets the latest premium charged time.
     * @param _timestamp The timestamp value when the premiums are charged.
    */
    function setChargedTime(uint256 _timestamp) external override whileUnpaused onlyCollector {
        require(_timestamp > 0 && _timestamp <= block.timestamp, "invalid charged timestamp");
        latestChargedTime = _timestamp;
        emit LatestChargeTimeSet(_timestamp);
    }

    /**
     * @notice Add debts for each policy holder. Can only be called by the **Premium Collector** role.
     * @param _policyholders The array of addresses of the policyholders to add debt.
     * @param _debts The array of debt amounts (in **USD** to 18 decimal places) for each policyholder.
     */
    function setDebts(address[] calldata _policyholders, uint256[] calldata _debts) external override whileUnpaused onlyCollector {
        uint256 count = _policyholders.length;
        require(count == _debts.length, "length mismatch");
        require(count <= policyCount, "policy count exceeded");

        address policyholder;
        uint256 debt;

        for (uint256 i = 0; i < count; i++) {
            policyholder = _policyholders[i];
            debt = _debts[i];
            debtOf[policyholder] += debt;
            emit DebtSet(policyholder, debt);
        }
    }

    /***************************************
    INTERNAL FUNCTIONS
    ***************************************/

    /**
     * @notice Returns true if there is sufficient capacity to update a policy's cover limit, false if not.
     * @param _currentCoverLimit The current cover limit, 0 if policy has not previously been activated.
     * @param _newCoverLimit  The new cover limit requested.
     * @return acceptable True there is sufficient capacity for the requested new cover limit, false otherwise.
     */
    function _checkCapacity(uint256 _currentCoverLimit, uint256 _newCoverLimit) internal view returns (bool acceptable) {
        // return true if user is lowering cover limit
        if (_newCoverLimit <= _currentCoverLimit) return true;

        // check capacity
        uint256 diff = _newCoverLimit - _currentCoverLimit;
        if (diff < availableCoverCapacity()) return true;
        
        // no available capacity
        return false;
    }

    /**
     * @notice Activates policy for `msg.sender`.
     * @param _user The account to purchase policy. 
     * @param _coverLimit The maximum value to cover in **USD**.
     * @return policyID The ID of the newly minted policy.
     */
     function _purchase(address _user, uint256 _coverLimit) internal returns (uint256 policyID) {
        require(_coverLimit > 0, "zero cover value");

        policyID = policyOf[_user];
        require(_checkCapacity(0, _coverLimit), "insufficient capacity");
        require(scp.balanceOf(_user) > minRequiredAccountBalance(_coverLimit), "insufficient scp balance");

        // mint policy if doesn't currently exist
        if (policyID == 0) {
            policyID = ++policyCount;
            policyOf[_user] = policyID;
            _mint(_user, policyID);
            emit PolicyCreated(policyID);
        } else {
            if (_coverLimit == coverLimitOf[policyID]) return policyID;
            emit PolicyUpdated(policyID);
        }

        // update cover amount
        _updateActiveCoverLimit(coverLimitOf[policyID], _coverLimit);
        coverLimitOf[policyID] = _coverLimit;
        return policyID;
    }

    /**
     * @notice Cancels the policy.
     * @param _policyholder The policyholder address.
     */
    function _cancel(address _policyholder) internal {
        uint256 policyID = policyOf[_policyholder];
        uint256 coverLimit = coverLimitOf[policyID];
        _updateActiveCoverLimit(coverLimit, 0);

        debtOf[_policyholder] += calculateCancelFee(policyID);
        coverLimitOf[policyID] = 0;
        emit PolicyCanceled(policyID);
    }

    /**
     * @notice Updates the Risk Manager on the current total cover limit purchased by policyholders.
     * @param _currentCoverLimit The current policyholder cover limit (0 if activating policy).
     * @param _newCoverLimit The new policyholder cover limit.
     */
    function _updateActiveCoverLimit(uint256 _currentCoverLimit, uint256 _newCoverLimit) internal {
        riskManager.updateActiveCoverLimitForStrategy(address(this), _currentCoverLimit, _newCoverLimit);
    }

    /**
     * @notice Override _beforeTokenTransfer hook from ERC721 standard to ensure policies are non-transferable, and only one can be minted per user.
     * @dev This hook is called on mint, transfer and burn.
     * @param from sending address.
     * @param to receiving address.
     * @param tokenId tokenId.
     */
    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal virtual override {
        super._beforeTokenTransfer(from, to, tokenId);
        require(from == address(0), "only minting permitted");
    }

    /**
     * @notice Sets registry and related contract addresses.
     * @param _registry The registry address to set.
    */
    function _setRegistry(address _registry) internal {
        // set registry
        require(_registry != address(0x0), "zero address registry");
        registry = IRegistry(_registry);

        // set risk manager
        (, address riskManagerAddr) = registry.tryGet("riskManager");
        require(riskManagerAddr != address(0x0), "zero address riskmanager");
        riskManager = IRiskManager(riskManagerAddr);

        // set scp
        (, address scpAddr) = registry.tryGet("scp");
        require(scpAddr != address(0x0), "zero address scp");
        scp = ISCP(scpAddr);
        emit RegistrySet(_registry);
    }
}

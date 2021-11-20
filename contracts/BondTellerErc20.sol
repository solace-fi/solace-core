// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.6;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./GovernableInitializable.sol";
import "./ERC721EnhancedInitializable.sol";
import "./interface/ISOLACE.sol";
import "./interface/IxSOLACE.sol";
import "./interface/IBondDepository.sol";
import "./interface/IBondTellerErc20.sol";


contract BondTellerErc20 is IBondTellerErc20, ReentrancyGuard, GovernableInitializable, ERC721EnhancedInitializable {

    using SafeERC20 for IERC20;


    /* ======== STRUCTS ======== */

    // Info about each type of bond
    uint256 public capacity;      // capacity remaining
    IERC20 public principal;      // token to accept as payment
    bool public termsSet;         // have terms been set
    bool public capacityIsPayout; // capacity limit is for payout vs principal
    bool public paused;           // pauses deposits

    // Info for creating new bonds
    uint64 public startTime;      // timestamp bonds start
    uint64 public endTime;        // timestamp bond no longer offered
    uint256 public vestingTerm;   // duration in seconds (fixed-term)
    uint256 public minimumPrice;  // measured in principal per 1 solace

    /* ======== STATE VARIABLES ======== */

    // Info for bond holder
    struct Bond {
        address payoutToken;  // solace or xsolace
        uint256 payoutAmount; // amount of solace or xsolace to be paid
        uint256 pricePaid;    // measured in 'principal', for front end viewing
        uint256 maturation;   // timestamp after which bond is redeemable
    }

    /// @notice mapping of bondID to Bond object
    mapping (uint256 => Bond) public bonds;

    uint256 public numBonds;

    ISOLACE public solace;
    IxSOLACE public xsolace;

    uint256 internal constant MAX_BPS = 10000; // 10k basis points (100%)
    uint256 public daoFeeBps;
    uint256 public stakeFeeBps;
    address public underwritingPool;
    address public dao;
    IBondDepository public bondDepo;

    // used to determine new price
    uint256 public nextPrice;
    uint128 public momentumNum;
    uint128 public momentumDenom;
    uint256 public halfLife;
    uint256 public lastPriceUpdate;

    uint256 public maxPayout;

    /***************************************
    INITIALIZER
    ***************************************/

    /**
     * @notice Initializes the teller.
     * @param governance_ The address of the [governor](/docs/protocol/governance).
     * @param solace_ The SOLACE token.
     * @param xsolace_ The xSOLACE token.
     * @param pool_ The underwriting pool.
     * @param dao_ The DAO.
     * @param principal_ address The ERC20 token that users deposit.
     * @param bondDepo_ The bond depository.
     */
    function initialize(
        address governance_,
        address solace_,
        address xsolace_,
        address pool_,
        address dao_,
        address principal_,
        address bondDepo_
    ) external override initializer {
        __Governable_init(governance_);
        require(solace_ != address(0x0), "zero address solace");
        require(xsolace_ != address(0x0), "zero address xsolace");
        require(pool_ != address(0x0), "zero address pool");
        require(dao_ != address(0x0), "zero address dao");
        require(principal_ != address(0x0), "zero address principal");
        require(bondDepo_ != address(0x0), "zero address bond depo");
        string memory name = string(abi.encodePacked("SOLACE-", ERC20(principal_).symbol(), " Bond"));
        string memory symbol = "SBT";
        __ERC721Enhanced_init(name, symbol);
        solace = ISOLACE(solace_);
        xsolace = IxSOLACE(xsolace_);
        solace.approve(xsolace_, type(uint256).max);
        underwritingPool = pool_;
        dao = dao_;
        principal = IERC20(principal_);
        bondDepo = IBondDepository(bondDepo_);
    }

    /***************************************
    VIEW FUNCTIONS
    ***************************************/

    // BOND PRICE

    /**
     * @notice Calculate the current price of a bond.
     * Assumes 1 SOLACE payout.
     * @return price_ The price of the bond measured in `principal`.
     */
    function bondPrice() public view returns (uint256 price_) {
        uint256 timeSinceLast = block.timestamp - lastPriceUpdate;
        price_ = exponentialDecay(nextPrice, timeSinceLast, halfLife);
        if (price_ < minimumPrice) {
            price_ = minimumPrice;
        }
    }

    /**
     * @notice Calculate the amount of **SOLACE** or **xSOLACE** out for an amount of `principal`.
     * @param amountIn Amount of principal to deposit.
     * @param stake True to stake, false to not stake.
     * @return amountOut Amount of **SOLACE** or **xSOLACE** out.
     */
    function calculateAmountOut(
        uint256 amountIn,
        bool stake
    ) external view returns (uint256 amountOut) {
        // exchange rate
        amountOut = 1 ether * amountIn / bondPrice(); // 1 ether => 1 solace
        // ensure there is remaining capacity for bond
        if (capacityIsPayout) {
            // capacity in payout terms
            require(capacity >= amountOut, "bond at capacity");
        } else {
            // capacity in principal terms
            require(capacity >= amountIn, "bond at capacity");
        }
        require(amountOut <= maxPayout, "bond too large");
        // route solace
        uint256 stakeFee = amountOut * stakeFeeBps / MAX_BPS;
        if(stakeFee > 0) {
            amountOut -= stakeFee;
        }
        // optionally stake
        if(stake) {
            amountOut = xsolace.solaceToXSolace(amountOut);
        }
        return amountOut;
    }

    /**
     * @notice Calculate the amount of `principal` in for an amount of **SOLACE** or **xSOLACE** out.
     * @param amountOut Amount of **SOLACE** or **xSOLACE** out.
     * @param stake True to stake, false to not stake.
     * @return amountIn Amount of principal to deposit.
     */
    function calculateAmountIn(uint256 amountOut, bool stake) public view returns (uint256 amountIn) {
        // optionally stake
        if(stake) {
            amountOut = xsolace.xSolaceToSolace(amountOut);
        }
        // stake fee
        amountOut = amountOut * MAX_BPS / (MAX_BPS - stakeFeeBps);
        // exchange rate
        amountIn = amountOut * bondPrice() / 1 ether;
        // ensure there is remaining capacity for bond
        if (capacityIsPayout) {
            // capacity in payout terms
            require(capacity >= amountOut, "bond at capacity");
        } else {
            // capacity in principal terms
            require(capacity >= amountIn, "bond at capacity");
        }
        require(amountOut <= maxPayout, "bond too large");
    }

    /***************************************
    BONDER FUNCTIONS
    ***************************************/

    /**
     * @notice Create a bond by depositing `amount` of `principal`.
     * Principal will be transferred from `msg.sender` using `allowance`.
     * @param amount Amount of principal to deposit.
     * @param minAmountOut The minimum **SOLACE** or **xSOLACE** out.
     * @param depositor The bond recipient, default msg.sender.
     * @param stake True to stake, false to not stake.
     * @return payout The amount of SOLACE or xSOLACE in the bond.
     * @return bondID The ID of the newly created bond.
     */
    function deposit(
        uint256 amount,
        uint256 minAmountOut,
        address depositor,
        bool stake
    ) external override returns (uint256 payout, uint256 bondID) {
        // pull tokens
        SafeERC20.safeTransferFrom(principal, msg.sender, address(this), amount);
        // accounting
        return _deposit(amount, minAmountOut, depositor, stake);
    }

    /**
     * @notice Create a bond by depositing `amount` of `principal`.
     * Principal will be transferred from `depositor` using `permit`.
     * Note that not all ERC20s have a permit function, in which case this function will revert.
     * @param amount Amount of principal to deposit.
     * @param minAmountOut The minimum **SOLACE** or **xSOLACE** out.
     * @param depositor The bond recipient, default msg.sender.
     * @param stake True to stake, false to not stake.
     * @param deadline Time the transaction must go through before.
     * @param v secp256k1 signature
     * @param r secp256k1 signature
     * @param s secp256k1 signature
     * @return payout The amount of SOLACE or xSOLACE in the bond.
     * @return bondID The ID of the newly created bond.
     */
    function depositSigned(
        uint256 amount,
        uint256 minAmountOut,
        address depositor,
        bool stake,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override returns (uint256 payout, uint256 bondID) {
        // permit
        IERC20Permit(address(principal)).permit(depositor, address(this), amount, deadline, v, r, s);
        // pull tokens
        SafeERC20.safeTransferFrom(principal, depositor, address(this), amount);
        // accounting
        return _deposit(amount, minAmountOut, depositor, stake);
    }

    /**
     * @notice Create a bond by depositing `amount` of `principal`.
     * @param amount Amount of principal to deposit.
     * @param minAmountOut The minimum **SOLACE** or **xSOLACE** out.
     * @param depositor The bond recipient, default msg.sender.
     * @param stake True to stake, false to not stake.
     * @return payout The amount of SOLACE or xSOLACE in the bond.
     * @return bondID The ID of the newly created bond.
     */
    function _deposit(
        uint256 amount,
        uint256 minAmountOut,
        address depositor,
        bool stake
    ) internal returns (uint256 payout, uint256 bondID) {
        require(depositor != address(0), "invalid address");
        require(!paused, "cannot deposit while paused");

        require(termsSet, "not initialized");
        require(block.timestamp >= uint256(startTime), "bond not yet started");
        require(block.timestamp <= uint256(endTime), "bond concluded");

        payout = _calculatePayout(amount);

        // ensure there is remaining capacity for bond
        if (capacityIsPayout) {
            // capacity in payout terms
            require(capacity >= payout, "bond at capacity");
            capacity = capacity - payout;
        } else {
            // capacity in principal terms
            require(capacity >= amount, "bond at capacity");
            capacity = capacity - amount;
        }
        require(payout <= maxPayout, "bond too large");

        uint256 maturation = vestingTerm + block.timestamp;
        // route principal
        uint256 daoFee = amount * daoFeeBps / MAX_BPS;
        if(daoFee > 0) SafeERC20.safeTransfer(principal, dao, daoFee);
        SafeERC20.safeTransfer(principal, underwritingPool, amount - daoFee);
        // route solace
        bondDepo.mint(payout);
        uint256 stakeFee = payout * stakeFeeBps / MAX_BPS;
        if(stakeFee > 0) {
            SafeERC20.safeTransfer(solace, address(xsolace), stakeFee);
            payout -= stakeFee;
        }

        // optionally stake
        address payoutToken;
        if(stake) {
            payoutToken = address(xsolace);
            payout = xsolace.stake(payout);
        } else {
            payoutToken = address(solace);
        }
        require(minAmountOut <= payout, "slippage protection: insufficient output");

        // record bond info
        bondID = ++numBonds;
        bonds[bondID] = Bond({
            payoutToken: payoutToken,
            payoutAmount: payout,
            pricePaid: amount,
            maturation: maturation
        });
        _mint(depositor, bondID);
        emit CreateBond(bondID, amount, payoutToken, payout, maturation);
        return (payout, bondID);
    }

    /**
     * @notice Redeem a bond.
     * Bond must be matured.
     * Redeemer must be owner or approved.
     * @param bondID The ID of the bond to redeem.
     */
    function redeem(uint256 bondID) external nonReentrant tokenMustExist(bondID) returns ( uint256 ) {
        // checks
        Bond memory bond = bonds[bondID];
        require(_isApprovedOrOwner(msg.sender, bondID), "!bonder");
        require(block.timestamp >= bond.maturation, "bond not yet redeemable");
        // send payout
        SafeERC20.safeTransfer(IERC20(bond.payoutToken), msg.sender, bond.payoutAmount);
        // delete bond
        _burn(bondID);
        delete bonds[bondID];
        emit RedeemBond(bondID, msg.sender, bond.payoutToken, bond.payoutAmount);
    }

    /***************************************
    HELPER FUNCTIONS
    ***************************************/

    /**
     * @notice Calculate the payout and update the current price of a bond.
     * @param depositAmount asdf
     * @return amountOut asdf
     */
    function _calculatePayout(uint256 depositAmount) internal returns (uint256 amountOut) {
        // calculate this price
        uint256 timeSinceLast = block.timestamp - lastPriceUpdate;
        uint256 price_ = exponentialDecay(nextPrice, timeSinceLast, halfLife);
        if(price_ < minimumPrice) price_ = minimumPrice;
        require(price_ != 0, "invalid price");
        lastPriceUpdate = block.timestamp;
        // update next price
        nextPrice = price_ + (depositAmount * uint256(momentumNum) / uint256(momentumDenom));
        // calculate amount out
        amountOut = 1 ether * depositAmount / price_; // 1 ether => 1 solace
    }

    /**
     * @notice Calculates exponential decay.
     * @dev Linear approximation, trades precision for speed.
     * @param initValue The initial value.
     * @param time The time elapsed.
     * @param halfLife The halflife of decay.
     * @return endValue The value at the end.
     */
    function exponentialDecay(uint256 initValue, uint256 time, uint256 halfLife) internal view returns (uint256 endValue) {
        endValue = initValue >> (time / halfLife);
        endValue -= endValue * (time % halfLife) / halfLife / 2;
    }

    /***************************************
    GOVERNANCE FUNCTIONS
    ***************************************/

    /**
     * @notice set minimum price for bond
     * Can only be called by the current [**governor**](/docs/protocol/governance).
     * @param startPrice_ asdf
     * @param vestingTerm_ uint
     * @param startTime_ uint
     * @param endTime_ uint
     * @param minimumPrice_ uint
     * @param halfLife_ asdf
     * @param momentumFactor_ Used to calculate price increase after bond purchase. The uint128 numerator and denominator of a fraction, pass as `( momentumNum << 128 | momentumDenom )`.
     */
    function setTerms(
        uint256 startPrice_,
        uint256 vestingTerm_,
        uint64 startTime_,
        uint64 endTime_,
        uint256 minimumPrice_,
        uint256 halfLife_,
        uint256 capacity_,
        bool capacityIsPayout_,
        uint256 maxPayout_,
        uint256 momentumFactor_
    ) external onlyGovernance {
        require(startPrice_ > 0, "invalid price");
        nextPrice = startPrice_;
        vestingTerm = vestingTerm_;
        require(startTime_ <= endTime_, "invalid dates");
        startTime = startTime_;
        endTime = endTime_;
        minimumPrice = minimumPrice_;
        require(halfLife_ > 0, "invalid halflife");
        halfLife = halfLife_;
        capacity = capacity_;
        capacityIsPayout = capacityIsPayout_;
        maxPayout = maxPayout_;
        uint128 num_ = uint128(momentumFactor_ >> 128);
        uint128 denom_ = uint128(momentumFactor_);
        require(denom_ != 0, "1/0");
        momentumNum = num_;
        momentumDenom = denom_;
        termsSet = true;
        lastPriceUpdate = block.timestamp;
        emit TermsSet();
    }

    /**
     * @notice Sets the bond fees.
     * @param stakeFee The fraction of **SOLACE** that will be sent to stakers measured in BPS.
     * @param daoFee The fraction of `principal` that will be sent to the dao measured in BPS.
     */
    function setFees(uint256 stakeFee, uint256 daoFee) external onlyGovernance {
        require(stakeFee <= MAX_BPS, "invalid staking fee");
        require(daoFee <= MAX_BPS, "invalid dao fee");
        stakeFeeBps = stakeFee;
        daoFeeBps = daoFee;
    }

    /**
     * @notice Pauses deposits.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
    */
    function pause() external override onlyGovernance {
        paused = true;
        emit Paused();
    }

    /**
     * @notice Unpauses deposits.
     * Can only be called by the current [**governor**](/docs/protocol/governance).
    */
    function unpause() external override onlyGovernance {
        paused = false;
        emit Unpaused();
    }
}

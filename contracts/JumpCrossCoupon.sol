// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 *    ___                       _____
 *   |_  |                     /  __ \
 *     | |_   _ _ __ ___  _ __ | /  \/_ __ ___  ___ ___
 *     | | | | | '_ ` _ \| '_ \| |   | '__/ _ \/ __/ __|
 * /\__/ | |_| | | | | | | |_) | \__/| | | (_) \__ \__ \
 * \____/ \__,_|_| |_| |_| .__/ \____|_|  \___/|___|___/
 *                       | |
 *                       |_|
 *
 * A Game token by JumpCross Game.
 */

/// @title JCC(JumpCrossCoupon)-ERC20
/// @author 0xmmq
/// @notice You can use this contract to convert or redeem the JumpCross game coupon to play or exit the game.
contract JumpCrossCoupon is ERC20, Ownable, ReentrancyGuard {
    uint256 public constant EXCHANGE_RATE = 0.000014 ether;
    uint256 public constant PROTOCOL_FEE_UPPER_LIMIT = 0.01 ether;

    /// @notice The following variables are used to calculate the protocol fee.
    /// The fomula is: fee = (userSentEth * protocolFeeFactor) / 10^protocolFeeScale
    /// Pawn fee range: [1e-18, Min(9%, 0.01 eth)].
    /// Redeem fee range: [1e-18, Min(45%, 0.01 * _protocolExitMultiplier eth)].
    uint256 public protocolFeeFactor;
    uint256 public protocolFeeScale;
    uint256 public protocolExitMultiplier;

    uint256 public protocolRevenue;

    error InsufficientFundsError(uint256 required, uint256 inputed);
    error InvalidExchangeAmountError(uint256 inputed);
    error SetProtocolFeeError(string message);

    event UpdateProtocolFee(
        uint256 protocolFeeFactor,
        uint256 protocolFeeScale,
        uint256 protocolExitMultiplier
    );

    constructor() ERC20("JumpCrossCoupon", "JCC") Ownable(_msgSender()) {
        protocolFeeFactor = 8;
        protocolFeeScale = 10 ** 3;
        protocolExitMultiplier = 2;
    }

    /**
     *    override functions
     */

    /// @notice Inform the user of the decimal precision of this token.
    /// @return Decimal precision
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /**
     *    Extended ERC20 functions
     */

    /// @notice Users specify the amount of JCC tokens they expect to receive.
    /// After a series of checks, the contract will send JCC tokens to the user
    /// by exchanging ETH for JCC tokens at a fixed exchange rate.
    /// Users have to send extra protocol fee in order for this function to execute successfully.
    /// @param amount The number of JCC tokens that users expect to receive
    function pawn(uint256 amount) external payable {
        if (amount <= 0) {
            revert InvalidExchangeAmountError(amount);
        }

        uint256 ethAmount = (amount * EXCHANGE_RATE * 1 ether) / 1 ether;
        uint256 fee = (ethAmount * protocolFeeFactor) / protocolFeeScale;
        uint256 total = 0;

        if (fee > PROTOCOL_FEE_UPPER_LIMIT) {
            fee = PROTOCOL_FEE_UPPER_LIMIT;
        }

        total = ethAmount + fee;

        if (msg.value < total) {
            revert InsufficientFundsError(total, msg.value);
        }

        protocolRevenue += fee;

        _mint(_msgSender(), amount);
    }

    /// @notice Users specify the amount of JCC tokens they expect to swap for ETH.
    /// Users have to send extra protocol fee in order for this function to execute successfully.
    /// @param amount The number of JCC tokens to swap for ETH
    function redeem(uint256 amount) external nonReentrant {
        if (amount <= 0) {
            revert InvalidExchangeAmountError(amount);
        }

        _burn(_msgSender(), amount);

        uint256 ethAmount = (amount * EXCHANGE_RATE * 1 ether) / 1 ether;
        uint256 fee = (ethAmount * protocolFeeFactor * protocolExitMultiplier) /
            protocolFeeScale;
        uint256 total = 0;

        uint256 feeUpperLimitForRedemption = PROTOCOL_FEE_UPPER_LIMIT *
            protocolExitMultiplier;

        // Since the `fee` is always < `ethAmount`,
        // the max value is `ethAmount * 0.45`,
        // and the `feeUpperLimitForRedemption` is only applied when `fee` > `feeUpperLimitForRedemption`,
        // that is, `ethAmount` > `fee` > `feeUpperLimitForRedemption`,
        // so it is guaranteed that there will be no arithmetic overflow in the following calculations.
        unchecked {
            if (fee > feeUpperLimitForRedemption) {
                fee = feeUpperLimitForRedemption;
            }

            total = ethAmount - fee;
        }

        protocolRevenue += fee;

        payable(_msgSender()).transfer(total);
    }

    /**
     *    Owner functions
     */

    /// @notice Update the protocol fee parameters
    /// @dev Parameter values must comply with the range defined in advance to ensure that the protocol
    /// fee is within a reasonable range
    /// @param _protocolFeeFactor Protocol fee numerator
    /// @param _protocolFeeDecimals Protocol fee denominator decimals
    /// @param _protocolExitMultiplier Exit multiplier for protocol protection
    function updateProtocolFee(
        uint256 _protocolFeeFactor,
        uint256 _protocolFeeDecimals,
        uint256 _protocolExitMultiplier
    ) external onlyOwner {
        _updateProtocolFee(
            _protocolFeeFactor,
            _protocolFeeDecimals,
            _protocolExitMultiplier
        );

        protocolFeeFactor = _protocolFeeFactor;
        protocolFeeScale = 10 ** _protocolFeeDecimals;
        protocolExitMultiplier = _protocolExitMultiplier;
    }

    // @dev Owner can claim the protocol revenue.
    function claimRevenue() external onlyOwner {
        uint256 _protocolRevenue = protocolRevenue;
        protocolRevenue = 0;
        payable(_msgSender()).transfer(_protocolRevenue);
    }

    // @dev Helper function for making sure the protocol fee is within a reasonable range.
    // Pawn fee range: [1e-18, Min(9%, 0.01 eth)].
    // Redeem fee range: [1e-18, Min(45%, 0.01 * _protocolExitMultiplier eth)].
    // @param _protocolFeeFactor Protocol fee numerator
    // @param _protocolFeeDecimals Protocol fee denominator decimals
    // @param _protocolExitMultiplier Exit multiplier for protocol protection
    function _updateProtocolFee(
        uint256 _protocolFeeFactor,
        uint256 _protocolFeeDecimals,
        uint256 _protocolExitMultiplier
    ) internal {
        if (_protocolFeeFactor < 1 || _protocolFeeFactor > 9) {
            revert SetProtocolFeeError("Invalid protocol fee factor");
        }

        if (_protocolFeeDecimals < 2 || _protocolFeeDecimals > 18) {
            revert SetProtocolFeeError("Invalid protocol fee decimals");
        }

        if (_protocolExitMultiplier < 1 || _protocolExitMultiplier > 5) {
            revert SetProtocolFeeError("Invalid protocol exit multiplier");
        }

        emit UpdateProtocolFee(
            _protocolFeeFactor,
            _protocolFeeDecimals,
            _protocolExitMultiplier
        );
    }
}

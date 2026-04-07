// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NewApiPayment
 * @notice Forward-mode payment contract for the New-API top-up system.
 *         Accepts ETH and ERC-20 token payments, forwarding funds directly
 *         to the configured recipient wallet. The contract never holds funds
 *         under normal operation.
 *
 *         Every payment emits a PaymentReceived event that Alchemy Custom Webhooks
 *         deliver to the backend for order fulfilment.
 *
 * Design decisions:
 *  - orderId is bytes32 (UTF-8 left-aligned, zero-padded trade number from backend)
 *  - ETH payments: call payWithETH(orderId) — ETH is forwarded to recipient immediately
 *  - ERC-20 payments: caller approves this contract first, then calls payWithToken —
 *    tokens are transferred directly from caller to recipient via safeTransferFrom
 *  - Duplicate order protection: each orderId can only be paid once
 *  - Supported tokens are an allowlist; address(0) is reserved for ETH (not in the list)
 *  - Owner can change recipient, add/remove tokens
 *  - Emergency withdraw functions retained in case funds are accidentally sent to contract
 */
contract NewApiPayment is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Events ────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted on every successful payment.
     * @param orderId  32-byte trade number from the backend (UTF-8 left-aligned, zero-padded)
     * @param payer    Address that initiated the transaction
     * @param token    Token address (address(0) for native ETH)
     * @param amount   Amount paid (in token's smallest unit / wei for ETH)
     */
    event PaymentReceived(
        bytes32 indexed orderId,
        address indexed payer,
        address token,
        uint256 amount
    );

    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    event RecipientChanged(address indexed oldRecipient, address indexed newRecipient);
    event EthWithdrawn(address indexed to, uint256 amount);
    event TokenWithdrawn(address indexed token, address indexed to, uint256 amount);

    // ─── State ─────────────────────────────────────────────────────────────────

    /// @notice Wallet address that receives all forwarded payments
    address public recipient;

    /// @notice Tracks whether an orderId has already been paid (prevents duplicate payments)
    mapping(bytes32 => bool) public orderPaid;

    /// @notice Allowlisted ERC-20 token addresses
    mapping(address => bool) public supportedTokens;

    /// @notice Token list for enumeration / UI display
    address[] public tokenList;

    // ─── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param initialOwner  Admin address (can manage tokens, change recipient, emergency withdraw)
     * @param _recipient    Wallet address that receives all forwarded payments
     */
    constructor(address initialOwner, address _recipient) Ownable(initialOwner) {
        require(_recipient != address(0), "NewApiPayment: zero recipient");
        recipient = _recipient;
    }

    // ─── Public payment functions ──────────────────────────────────────────────

    /**
     * @notice Pay with native ETH. Funds are forwarded to recipient immediately.
     * @param orderId  The 32-byte order identifier issued by the backend.
     */
    function payWithETH(bytes32 orderId) external payable nonReentrant {
        require(msg.value > 0, "NewApiPayment: zero ETH");
        require(!orderPaid[orderId], "NewApiPayment: order already paid");

        orderPaid[orderId] = true;

        // Forward ETH to recipient
        (bool ok, ) = recipient.call{value: msg.value}("");
        require(ok, "NewApiPayment: ETH forward failed");

        emit PaymentReceived(orderId, msg.sender, address(0), msg.value);
    }

    /**
     * @notice Pay with an allowlisted ERC-20 token.
     *         Caller must have called token.approve(contractAddress, amount) first.
     *         Tokens are transferred directly from caller to recipient (not held by contract).
     * @param orderId  The 32-byte order identifier issued by the backend.
     * @param token    ERC-20 contract address (must be in supportedTokens).
     * @param amount   Token amount in the token's smallest unit.
     */
    function payWithToken(
        bytes32 orderId,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(supportedTokens[token], "NewApiPayment: unsupported token");
        require(amount > 0, "NewApiPayment: zero amount");
        require(!orderPaid[orderId], "NewApiPayment: order already paid");

        orderPaid[orderId] = true;

        // Transfer tokens directly from caller to recipient (contract never holds them)
        IERC20(token).safeTransferFrom(msg.sender, recipient, amount);

        emit PaymentReceived(orderId, msg.sender, token, amount);
    }

    // ─── Admin: recipient management ────────────────────────────────────────────

    /**
     * @notice Change the recipient wallet address.
     */
    function setRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0), "NewApiPayment: zero recipient");
        address old = recipient;
        recipient = _recipient;
        emit RecipientChanged(old, _recipient);
    }

    // ─── Admin: token management ───────────────────────────────────────────────

    /**
     * @notice Add an ERC-20 token to the allowlist.
     */
    function addSupportedToken(address token) external onlyOwner {
        require(token != address(0), "NewApiPayment: zero address");
        require(!supportedTokens[token], "NewApiPayment: already supported");
        supportedTokens[token] = true;
        tokenList.push(token);
        emit TokenAdded(token);
    }

    /**
     * @notice Remove an ERC-20 token from the allowlist.
     */
    function removeSupportedToken(address token) external onlyOwner {
        require(supportedTokens[token], "NewApiPayment: not supported");
        supportedTokens[token] = false;
        // Swap-and-pop to keep array compact
        for (uint256 i = 0; i < tokenList.length; i++) {
            if (tokenList[i] == token) {
                tokenList[i] = tokenList[tokenList.length - 1];
                tokenList.pop();
                break;
            }
        }
        emit TokenRemoved(token);
    }

    /**
     * @notice Return the full list of currently supported token addresses.
     */
    function getSupportedTokens() external view returns (address[] memory) {
        return tokenList;
    }

    // ─── Admin: emergency withdrawal ────────────────────────────────────────────

    /**
     * @notice Emergency: withdraw any ETH accidentally sent to the contract.
     *         Under normal forward-mode operation, the contract holds no ETH.
     */
    function withdrawETH() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "NewApiPayment: no ETH balance");
        (bool ok, ) = owner().call{value: balance}("");
        require(ok, "NewApiPayment: ETH transfer failed");
        emit EthWithdrawn(owner(), balance);
    }

    /**
     * @notice Emergency: withdraw any ERC-20 tokens accidentally sent to the contract.
     *         Under normal forward-mode operation, the contract holds no tokens.
     */
    function withdrawToken(address token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "NewApiPayment: no token balance");
        IERC20(token).safeTransfer(owner(), balance);
        emit TokenWithdrawn(token, owner(), balance);
    }

    // ─── Fallback: reject plain ETH transfers without orderId ─────────────────

    receive() external payable {
        revert("NewApiPayment: use payWithETH");
    }
}

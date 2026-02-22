// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PaymentPool
 * @notice Gasless P2P payment pool for Monad Pay.
 *         Users deposit MON into the pool. A trusted relayer executes
 *         transfers between users so they never pay gas.
 * @dev    Reentrancy protection via checks-effects-interactions pattern
 *         and a simple reentrancy guard.
 */
contract PaymentPool {
    // ──────────────────────────── State ────────────────────────────

    /// @notice The only address allowed to call transfer / withdraw on behalf of users.
    address public immutable relayer;

    /// @notice Internal balance of each depositor.
    mapping(address => uint256) private _balances;

    /// @notice Total MON held inside the pool (invariant: == address(this).balance).
    uint256 public totalDeposited;

    /// @dev Simple reentrancy lock.
    bool private _locked;

    // ──────────────────────────── Events ───────────────────────────

    event Deposited(address indexed user, uint256 amount, uint256 timestamp);
    event DepositedFor(address indexed sponsor, address indexed user, uint256 amount, uint256 timestamp);
    event Transferred(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 indexed refId,
        uint256 timestamp
    );
    event Withdrawn(address indexed user, address indexed to, uint256 amount, uint256 timestamp);

    // ──────────────────────────── Errors ───────────────────────────

    error OnlyRelayer();
    error InsufficientBalance();
    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();
    error Reentrancy();

    // ──────────────────────────── Modifiers ────────────────────────

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert OnlyRelayer();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    // ──────────────────────────── Constructor ──────────────────────

    /**
     * @param _relayer Address of the server-controlled relayer wallet.
     */
    constructor(address _relayer) {
        if (_relayer == address(0)) revert ZeroAddress();
        relayer = _relayer;
    }

    // ──────────────────────────── Deposit ──────────────────────────

    /**
     * @notice Deposit MON into the pool for msg.sender.
     */
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();

        _balances[msg.sender] += msg.value;
        totalDeposited += msg.value;

        emit Deposited(msg.sender, msg.value, block.timestamp);
    }

    /**
     * @notice Deposit MON into the pool on behalf of another user.
     * @param user The user whose pool balance will be credited.
     */
    function depositFor(address user) external payable {
        if (msg.value == 0) revert ZeroAmount();
        if (user == address(0)) revert ZeroAddress();

        _balances[user] += msg.value;
        totalDeposited += msg.value;

        emit DepositedFor(msg.sender, user, msg.value, block.timestamp);
    }

    // ──────────────────────────── Transfer ─────────────────────────

    /**
     * @notice Transfer MON between two users inside the pool. Gasless for both parties.
     * @dev    Only callable by the relayer. No actual ETH movement — just balance updates.
     * @param from   Sender address (must have sufficient balance).
     * @param to     Recipient address.
     * @param amount Amount in wei.
     * @param refId  Unique payment reference for idempotency / audit.
     */
    function transfer(address from, address to, uint256 amount, bytes32 refId)
        external
        onlyRelayer
    {
        if (amount == 0) revert ZeroAmount();
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (_balances[from] < amount) revert InsufficientBalance();

        _balances[from] -= amount;
        _balances[to] += amount;

        emit Transferred(from, to, amount, refId, block.timestamp);
    }

    /**
     * @notice Batch transfer — multiple internal transfers in one transaction.
     * @param froms   Array of sender addresses.
     * @param tos     Array of recipient addresses.
     * @param amounts Array of amounts in wei.
     * @param refIds  Array of unique payment references.
     */
    function batchTransfer(
        address[] calldata froms,
        address[] calldata tos,
        uint256[] calldata amounts,
        bytes32[] calldata refIds
    ) external onlyRelayer {
        uint256 len = froms.length;
        require(len == tos.length && len == amounts.length && len == refIds.length, "Array length mismatch");

        for (uint256 i = 0; i < len;) {
            address from = froms[i];
            address to = tos[i];
            uint256 amount = amounts[i];

            if (amount == 0) revert ZeroAmount();
            if (from == address(0) || to == address(0)) revert ZeroAddress();
            if (_balances[from] < amount) revert InsufficientBalance();

            _balances[from] -= amount;
            _balances[to] += amount;

            emit Transferred(from, to, amount, refIds[i], block.timestamp);

            unchecked { ++i; }
        }
    }

    // ──────────────────────────── Withdraw ─────────────────────────

    /**
     * @notice Withdraw MON from the pool to an external address.
     * @dev    Only callable by the relayer (on user's behalf after PIN verification).
     * @param from   The user withdrawing.
     * @param to     Destination address (usually the user's own wallet).
     * @param amount Amount in wei.
     */
    function withdraw(address from, address to, uint256 amount)
        external
        onlyRelayer
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (_balances[from] < amount) revert InsufficientBalance();

        _balances[from] -= amount;
        totalDeposited -= amount;

        (bool success,) = to.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Withdrawn(from, to, amount, block.timestamp);
    }

    // ──────────────────────────── Views ────────────────────────────

    /**
     * @notice Check a user's balance in the pool.
     * @param user The address to query.
     * @return The balance in wei.
     */
    function balanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    // ──────────────────────────── Receive ──────────────────────────

    /**
     * @notice Accept direct MON transfers — credited to sender's pool balance.
     */
    receive() external payable {
        if (msg.value == 0) revert ZeroAmount();
        _balances[msg.sender] += msg.value;
        totalDeposited += msg.value;
        emit Deposited(msg.sender, msg.value, block.timestamp);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PaymentPool.sol";

contract PaymentPoolTest is Test {
    PaymentPool public pool;
    address public relayer;
    address public alice;
    address public bob;
    address public charlie;

    function setUp() public {
        relayer = makeAddr("relayer");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        charlie = makeAddr("charlie");

        vm.prank(relayer);
        pool = new PaymentPool(relayer);

        // Fund test accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
        vm.deal(relayer, 10 ether);
    }

    // ─────────────────── Constructor ───────────────────

    function test_constructor_setsRelayer() public view {
        assertEq(pool.relayer(), relayer);
    }

    function test_constructor_revertsZeroAddress() public {
        vm.expectRevert(PaymentPool.ZeroAddress.selector);
        new PaymentPool(address(0));
    }

    // ─────────────────── Deposit ───────────────────────

    function test_deposit_creditsBalance() public {
        vm.prank(alice);
        pool.deposit{value: 5 ether}();

        assertEq(pool.balanceOf(alice), 5 ether);
        assertEq(pool.totalDeposited(), 5 ether);
    }

    function test_deposit_revertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(PaymentPool.ZeroAmount.selector);
        pool.deposit{value: 0}();
    }

    function test_deposit_emitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit PaymentPool.Deposited(alice, 5 ether, block.timestamp);
        pool.deposit{value: 5 ether}();
    }

    // ─────────────────── DepositFor ────────────────────

    function test_depositFor_creditsTargetUser() public {
        vm.prank(alice);
        pool.depositFor{value: 3 ether}(bob);

        assertEq(pool.balanceOf(bob), 3 ether);
        assertEq(pool.balanceOf(alice), 0);
    }

    function test_depositFor_revertsZeroAddress() public {
        vm.prank(alice);
        vm.expectRevert(PaymentPool.ZeroAddress.selector);
        pool.depositFor{value: 1 ether}(address(0));
    }

    function test_depositFor_revertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(PaymentPool.ZeroAmount.selector);
        pool.depositFor{value: 0}(bob);
    }

    // ─────────────────── Transfer ──────────────────────

    function test_transfer_movesBalance() public {
        // Setup: alice deposits
        vm.prank(alice);
        pool.deposit{value: 10 ether}();

        // Relayer transfers from alice to bob
        bytes32 refId = keccak256("payment-001");
        vm.prank(relayer);
        pool.transfer(alice, bob, 3 ether, refId);

        assertEq(pool.balanceOf(alice), 7 ether);
        assertEq(pool.balanceOf(bob), 3 ether);
    }

    function test_transfer_revertsIfNotRelayer() public {
        vm.prank(alice);
        pool.deposit{value: 10 ether}();

        bytes32 refId = keccak256("payment-002");
        vm.prank(alice);
        vm.expectRevert(PaymentPool.OnlyRelayer.selector);
        pool.transfer(alice, bob, 1 ether, refId);
    }

    function test_transfer_revertsInsufficientBalance() public {
        vm.prank(alice);
        pool.deposit{value: 1 ether}();

        bytes32 refId = keccak256("payment-003");
        vm.prank(relayer);
        vm.expectRevert(PaymentPool.InsufficientBalance.selector);
        pool.transfer(alice, bob, 5 ether, refId);
    }

    function test_transfer_revertsZeroAmount() public {
        bytes32 refId = keccak256("payment-004");
        vm.prank(relayer);
        vm.expectRevert(PaymentPool.ZeroAmount.selector);
        pool.transfer(alice, bob, 0, refId);
    }

    function test_transfer_emitsEvent() public {
        vm.prank(alice);
        pool.deposit{value: 10 ether}();

        bytes32 refId = keccak256("payment-005");
        vm.prank(relayer);
        vm.expectEmit(true, true, true, true);
        emit PaymentPool.Transferred(alice, bob, 2 ether, refId, block.timestamp);
        pool.transfer(alice, bob, 2 ether, refId);
    }

    // ─────────────────── BatchTransfer ─────────────────

    function test_batchTransfer_multipleTransfers() public {
        // Setup: alice and bob deposit
        vm.prank(alice);
        pool.deposit{value: 20 ether}();
        vm.prank(bob);
        pool.deposit{value: 10 ether}();

        address[] memory froms = new address[](2);
        address[] memory tos = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        bytes32[] memory refIds = new bytes32[](2);

        froms[0] = alice;
        tos[0] = charlie;
        amounts[0] = 5 ether;
        refIds[0] = keccak256("batch-001");

        froms[1] = bob;
        tos[1] = charlie;
        amounts[1] = 3 ether;
        refIds[1] = keccak256("batch-002");

        vm.prank(relayer);
        pool.batchTransfer(froms, tos, amounts, refIds);

        assertEq(pool.balanceOf(alice), 15 ether);
        assertEq(pool.balanceOf(bob), 7 ether);
        assertEq(pool.balanceOf(charlie), 8 ether);
    }

    function test_batchTransfer_revertsIfNotRelayer() public {
        address[] memory froms = new address[](1);
        address[] memory tos = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        bytes32[] memory refIds = new bytes32[](1);

        froms[0] = alice;
        tos[0] = bob;
        amounts[0] = 1 ether;
        refIds[0] = keccak256("batch-003");

        vm.prank(alice);
        vm.expectRevert(PaymentPool.OnlyRelayer.selector);
        pool.batchTransfer(froms, tos, amounts, refIds);
    }

    // ─────────────────── Withdraw ──────────────────────

    function test_withdraw_sendsETH() public {
        vm.prank(alice);
        pool.deposit{value: 10 ether}();

        uint256 aliceBalanceBefore = alice.balance;

        vm.prank(relayer);
        pool.withdraw(alice, alice, 4 ether);

        assertEq(pool.balanceOf(alice), 6 ether);
        assertEq(alice.balance, aliceBalanceBefore + 4 ether);
        assertEq(pool.totalDeposited(), 6 ether);
    }

    function test_withdraw_revertsIfNotRelayer() public {
        vm.prank(alice);
        pool.deposit{value: 10 ether}();

        vm.prank(alice);
        vm.expectRevert(PaymentPool.OnlyRelayer.selector);
        pool.withdraw(alice, alice, 1 ether);
    }

    function test_withdraw_revertsInsufficientBalance() public {
        vm.prank(alice);
        pool.deposit{value: 1 ether}();

        vm.prank(relayer);
        vm.expectRevert(PaymentPool.InsufficientBalance.selector);
        pool.withdraw(alice, alice, 5 ether);
    }

    // ─────────────────── Receive ───────────────────────

    function test_receive_creditsBalance() public {
        vm.prank(alice);
        (bool ok,) = address(pool).call{value: 2 ether}("");
        assertTrue(ok);
        assertEq(pool.balanceOf(alice), 2 ether);
    }

    // ─────────────────── Fuzz ──────────────────────────

    function testFuzz_deposit_arbitraryAmount(uint256 amount) public {
        amount = bound(amount, 1, 1000 ether);
        vm.deal(alice, amount);
        vm.prank(alice);
        pool.deposit{value: amount}();
        assertEq(pool.balanceOf(alice), amount);
    }

    function testFuzz_transfer_doesNotCreateMoney(uint256 depositAmt, uint256 transferAmt) public {
        depositAmt = bound(depositAmt, 1, 1000 ether);
        transferAmt = bound(transferAmt, 1, depositAmt);

        vm.deal(alice, depositAmt);
        vm.prank(alice);
        pool.deposit{value: depositAmt}();

        bytes32 refId = keccak256(abi.encodePacked(transferAmt));
        vm.prank(relayer);
        pool.transfer(alice, bob, transferAmt, refId);

        // Invariant: total balances equal total deposited
        assertEq(pool.balanceOf(alice) + pool.balanceOf(bob), depositAmt);
    }
}

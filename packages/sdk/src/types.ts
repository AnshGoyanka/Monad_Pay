import type { Address, Hash } from "viem";

// ──────────────────────── Config ────────────────────────────────────────────

/**
 * Configuration for creating a MonadPay client instance.
 */
export interface MonadPayConfig {
  /** PaymentPool contract address. Defaults to the official Monad Testnet deployment. */
  poolAddress?: Address;

  /** Monad RPC URL. Defaults to the public testnet RPC. */
  rpcUrl?: string;

  /** Private key for signing transactions (relayer or user). Required for write operations. */
  privateKey?: Hash;
}

// ──────────────────────── Deposit ───────────────────────────────────────────

export interface DepositParams {
  /** Amount in MON (human-readable, e.g. "1.5") */
  amount: string;
}

export interface DepositForParams {
  /** Address to credit the deposit to */
  user: Address;
  /** Amount in MON (human-readable, e.g. "1.5") */
  amount: string;
}

export interface DepositResult {
  /** Transaction hash */
  txHash: Hash;
  /** Amount deposited in wei */
  amountWei: bigint;
  /** Block explorer URL */
  explorerUrl: string;
}

// ──────────────────────── Transfer ──────────────────────────────────────────

export interface TransferParams {
  /** Sender address (pool balance owner) */
  from: Address;
  /** Recipient address */
  to: Address;
  /** Amount in MON (human-readable, e.g. "0.5") */
  amount: string;
  /** Unique reference ID (bytes32 hex). Auto-generated if omitted. */
  refId?: Hash;
}

export interface BatchTransferParams {
  transfers: Array<{
    from: Address;
    to: Address;
    amount: string;
    refId?: Hash;
  }>;
}

export interface TransferResult {
  txHash: Hash;
  refId: Hash;
  amountWei: bigint;
  explorerUrl: string;
}

// ──────────────────────── Withdraw ──────────────────────────────────────────

export interface WithdrawParams {
  /** Address whose pool balance to withdraw from */
  from: Address;
  /** Destination address to send MON to */
  to: Address;
  /** Amount in MON (human-readable) */
  amount: string;
}

export interface WithdrawResult {
  txHash: Hash;
  amountWei: bigint;
  explorerUrl: string;
}

// ──────────────────────── Balance ───────────────────────────────────────────

export interface BalanceResult {
  /** Pool balance in wei */
  poolBalanceWei: bigint;
  /** Pool balance in MON (formatted) */
  poolBalance: string;
  /** Native wallet balance in wei */
  nativeBalanceWei: bigint;
  /** Native wallet balance in MON (formatted) */
  nativeBalance: string;
}

// ──────────────────────── Pool Info ─────────────────────────────────────────

export interface PoolInfo {
  /** Contract address */
  address: Address;
  /** Relayer address */
  relayer: Address;
  /** Total MON deposited in the pool (wei) */
  totalDepositedWei: bigint;
  /** Total MON deposited (formatted) */
  totalDeposited: string;
}

// ──────────────────────── Events ────────────────────────────────────────────

export interface DepositEvent {
  user: Address;
  amount: bigint;
  timestamp: bigint;
  txHash: Hash;
  blockNumber: bigint;
}

export interface TransferEvent {
  from: Address;
  to: Address;
  amount: bigint;
  refId: Hash;
  timestamp: bigint;
  txHash: Hash;
  blockNumber: bigint;
}

export interface WithdrawEvent {
  user: Address;
  to: Address;
  amount: bigint;
  timestamp: bigint;
  txHash: Hash;
  blockNumber: bigint;
}

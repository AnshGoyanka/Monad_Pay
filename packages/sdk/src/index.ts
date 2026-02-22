// ──────────────────────── @monad-pay/sdk ─────────────────────────────────────
// TypeScript SDK for Monad Pay — gasless P2P payments on Monad.
// ─────────────────────────────────────────────────────────────────────────────

// Main client
export { MonadPay } from "./client.js";

// Contract ABI
export { PAYMENT_POOL_ABI } from "./abi.js";

// Chain config & constants
export {
  monadTestnet,
  DEFAULT_POOL_ADDRESS,
  NATIVE_CURRENCY,
  MONAD_CHAIN_ID,
  EXPLORER_TX_URL,
  EXPLORER_ADDRESS_URL,
} from "./chain.js";

// Types
export type {
  MonadPayConfig,
  DepositParams,
  DepositForParams,
  DepositResult,
  TransferParams,
  BatchTransferParams,
  TransferResult,
  WithdrawParams,
  WithdrawResult,
  BalanceResult,
  PoolInfo,
  DepositEvent,
  TransferEvent,
  WithdrawEvent,
} from "./types.js";

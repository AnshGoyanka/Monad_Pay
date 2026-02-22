import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
  type HttpTransport,
  defineChain,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { env } from "../config/env.js";
import { MONAD_CHAIN_ID } from "@chatpay/shared";

// ──────────────────────── Monad Chain Definition ────────────────

export const monadTestnet: Chain = defineChain({
  id: MONAD_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [env.MONAD_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
});

// ──────────────────────── Clients ───────────────────────────────

let _publicClient: PublicClient<HttpTransport, Chain> | null = null;

export function getPublicClient(): PublicClient<HttpTransport, Chain> {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(env.MONAD_RPC_URL, {
        retryCount: 3,
        retryDelay: 500,
        timeout: 30_000,
      }),
    }) as PublicClient<HttpTransport, Chain>;
  }
  return _publicClient;
}

/**
 * Create a wallet client for a given private key account.
 * Used by the relayer to sign and send transactions.
 */
export function createRelayerWalletClient(
  account: PrivateKeyAccount
): WalletClient {
  return createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(env.MONAD_RPC_URL, {
      retryCount: 3,
      retryDelay: 500,
      timeout: 30_000,
    }),
  });
}

// ──────────────────────── Contract ABI ──────────────────────────

export const PAYMENT_POOL_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "_relayer", type: "address" }],
  },
  {
    type: "function",
    name: "deposit",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "depositFor",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "refId", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "batchTransfer",
    inputs: [
      { name: "froms", type: "address[]" },
      { name: "tos", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
      { name: "refIds", type: "bytes32[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "relayer",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalDeposited",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DepositedFor",
    inputs: [
      { name: "sponsor", type: "address", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Transferred",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "refId", type: "bytes32", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "error",
    name: "OnlyRelayer",
    inputs: [],
  },
  {
    type: "error",
    name: "InsufficientBalance",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAmount",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "Reentrancy",
    inputs: [],
  },
] as const;

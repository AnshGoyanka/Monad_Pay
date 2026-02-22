import { defineChain } from "viem";

// ──────────────────────── Monad Testnet Chain Definition ─────────────────────

/**
 * Monad Testnet chain configuration for viem.
 *
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { monadTestnet } from "@monad-pay/sdk";
 *
 * const client = createPublicClient({
 *   chain: monadTestnet,
 *   transport: http(),
 * });
 * ```
 */
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
});

// ──────────────────────── Default Addresses ─────────────────────────────────

/**
 * Default PaymentPool contract address deployed on Monad Testnet.
 */
export const DEFAULT_POOL_ADDRESS = "0xfa929adb2eb7839edac52193fe39b11313b9b2fa" as const;

// ──────────────────────── Constants ─────────────────────────────────────────

/** Native currency symbol */
export const NATIVE_CURRENCY = "MON" as const;

/** Monad Testnet chain ID */
export const MONAD_CHAIN_ID = 10143 as const;

/** Explorer base URL for transactions */
export const EXPLORER_TX_URL = "https://testnet.monadexplorer.com/tx/" as const;

/** Explorer base URL for addresses */
export const EXPLORER_ADDRESS_URL = "https://testnet.monadexplorer.com/address/" as const;

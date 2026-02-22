import { redis } from "../config/redis.js";
import { logger } from "../config/logger.js";
import { getPublicClient } from "./blockchain.js";
import { GAS_PRICE_CACHE_MS } from "@chatpay/shared";

const GAS_PRICE_KEY = "gas:price";
const GAS_PRICE_UPDATED_KEY = "gas:updated";

/**
 * Gas oracle with Redis caching.
 * Caches the gas price for GAS_PRICE_CACHE_MS to avoid
 * hitting RPC on every transaction.
 */

/**
 * Get the current gas price (cached).
 * Returns gas price in wei as bigint.
 */
export async function getGasPrice(): Promise<bigint> {
  // Check cache
  const cached = await redis.get(GAS_PRICE_KEY);
  const updatedAt = await redis.get(GAS_PRICE_UPDATED_KEY);

  if (cached && updatedAt) {
    const age = Date.now() - parseInt(updatedAt, 10);
    if (age < GAS_PRICE_CACHE_MS) {
      return BigInt(cached);
    }
  }

  // Fetch fresh
  const client = getPublicClient();
  const gasPrice = await client.getGasPrice();

  // Cache
  await redis.set(GAS_PRICE_KEY, gasPrice.toString());
  await redis.set(GAS_PRICE_UPDATED_KEY, Date.now().toString());

  logger.debug({ gasPrice: gasPrice.toString() }, "Gas price refreshed");
  return gasPrice;
}

/**
 * Estimate gas for a contract call.
 * Adds a 20% buffer for safety.
 */
export function addGasBuffer(estimatedGas: bigint): bigint {
  return (estimatedGas * 120n) / 100n;
}

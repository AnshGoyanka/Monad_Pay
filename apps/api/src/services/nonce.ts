import { redis } from "../config/redis.js";
import { logger } from "../config/logger.js";
import { getPublicClient } from "./blockchain.js";

const NONCE_KEY = "relayer:nonce";
const NONCE_LOCK_KEY = "relayer:nonce:lock";
const LOCK_TTL_MS = 10_000; // 10s max lock hold

/**
 * Redis-based nonce manager for the relayer wallet.
 *
 * - Atomic increment prevents nonce collisions under concurrency.
 * - On startup, syncs from chain.
 * - On tx failure, nonce can be reclaimed.
 */

/**
 * Initialize the nonce from the blockchain.
 * Call once on server startup.
 */
export async function initNonce(relayerAddress: `0x${string}`): Promise<void> {
  const client = getPublicClient();
  const chainNonce = await client.getTransactionCount({ address: relayerAddress });

  const currentRedisNonce = await redis.get(NONCE_KEY);

  // Use the higher of chain nonce or redis nonce (prevents regression)
  const nonce = currentRedisNonce
    ? Math.max(chainNonce, parseInt(currentRedisNonce, 10))
    : chainNonce;

  await redis.set(NONCE_KEY, nonce.toString());
  logger.info({ nonce, relayerAddress: "[REDACTED]" }, "Nonce initialized");
}

/**
 * Atomically acquire the next nonce for a transaction.
 * Returns the nonce to use.
 */
export async function acquireNonce(): Promise<number> {
  // INCR returns the new value after increment, so subtract 1 to get current
  // Actually, we want to return current then increment
  // Use a Lua script for atomic get-and-increment
  const luaScript = `
    local current = redis.call('GET', KEYS[1])
    if current == false then
      return redis.error('Nonce not initialized')
    end
    redis.call('INCR', KEYS[1])
    return current
  `;

  const result = await redis.eval(luaScript, 1, NONCE_KEY);
  const nonce = parseInt(result as string, 10);

  logger.debug({ nonce }, "Nonce acquired");
  return nonce;
}

/**
 * Reclaim a nonce when a transaction fails before submission.
 * Only safe if the tx was never broadcast.
 */
export async function reclaimNonce(nonce: number): Promise<void> {
  // Only decrement if current nonce is nonce + 1 (meaning it was the last acquired)
  const luaScript = `
    local current = tonumber(redis.call('GET', KEYS[1]))
    if current == tonumber(ARGV[1]) + 1 then
      redis.call('DECR', KEYS[1])
      return 1
    end
    return 0
  `;

  const reclaimed = await redis.eval(luaScript, 1, NONCE_KEY, nonce.toString());
  if (reclaimed === 1) {
    logger.debug({ nonce }, "Nonce reclaimed");
  } else {
    logger.warn({ nonce }, "Could not reclaim nonce (not the latest)");
  }
}

/**
 * Force-sync nonce from chain. Use for recovery.
 */
export async function resyncNonce(relayerAddress: `0x${string}`): Promise<void> {
  const client = getPublicClient();
  const chainNonce = await client.getTransactionCount({ address: relayerAddress });
  await redis.set(NONCE_KEY, chainNonce.toString());
  logger.info({ nonce: chainNonce }, "Nonce resynced from chain");
}

import bcrypt from "bcrypt";
import { redis } from "../config/redis.js";
import { RATE_LIMIT_PIN_ATTEMPTS, RATE_LIMIT_PIN_LOCKOUT_MS } from "@chatpay/shared";

const BCRYPT_ROUNDS = 12;
const PIN_LOCKOUT_PREFIX = "pin_lockout:";
const PIN_ATTEMPTS_PREFIX = "pin_attempts:";

/**
 * Hash a 4-digit PIN using bcrypt.
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

/**
 * Verify a PIN against its bcrypt hash.
 * Includes brute-force protection with Redis-backed attempt tracking.
 *
 * @returns `{ valid: true }` or `{ valid: false, locked: boolean, attemptsLeft: number }`
 */
export async function verifyPin(
  userId: string,
  pin: string,
  storedHash: string
): Promise<{ valid: boolean; locked?: boolean; attemptsLeft?: number }> {
  // Check if account is locked
  const lockKey = `${PIN_LOCKOUT_PREFIX}${userId}`;
  const isLocked = await redis.exists(lockKey);
  if (isLocked) {
    return { valid: false, locked: true, attemptsLeft: 0 };
  }

  const isValid = await bcrypt.compare(pin, storedHash);

  if (isValid) {
    // Reset attempts on success
    await redis.del(`${PIN_ATTEMPTS_PREFIX}${userId}`);
    return { valid: true };
  }

  // Increment failed attempts
  const attemptsKey = `${PIN_ATTEMPTS_PREFIX}${userId}`;
  const attempts = await redis.incr(attemptsKey);
  await redis.expire(attemptsKey, Math.ceil(RATE_LIMIT_PIN_LOCKOUT_MS / 1000));

  if (attempts >= RATE_LIMIT_PIN_ATTEMPTS) {
    // Lock the account
    await redis.set(lockKey, "1", "PX", RATE_LIMIT_PIN_LOCKOUT_MS);
    await redis.del(attemptsKey);
    return { valid: false, locked: true, attemptsLeft: 0 };
  }

  return {
    valid: false,
    locked: false,
    attemptsLeft: RATE_LIMIT_PIN_ATTEMPTS - attempts,
  };
}

/**
 * Validate PIN format: exactly 4 digits.
 */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

import crypto from "node:crypto";
import { env } from "../config/env.js";
import {
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_IV_LENGTH,
  ENCRYPTION_AUTH_TAG_LENGTH,
} from "@chatpay/shared";

/**
 * AES-256-GCM encryption service.
 *
 * - Master key is loaded from env (hex-encoded, 32 bytes).
 * - Each value gets a unique random IV.
 * - Auth tag is appended to the ciphertext for integrity verification.
 *
 * SECURITY:
 * - Plaintext buffers are zeroed after use.
 * - Master key lives only in memory.
 * - Never log encrypted or decrypted values.
 */

let _masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (!_masterKey) {
    _masterKey = Buffer.from(env.MASTER_ENCRYPTION_KEY, "hex");
    if (_masterKey.length !== 32) {
      throw new Error("MASTER_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars)");
    }
  }
  return _masterKey;
}

// ──────────────────────────── Encrypt ────────────────────────────

export interface EncryptedData {
  ciphertext: Buffer;
  iv: Buffer;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns ciphertext (with appended auth tag) and the IV.
 */
export function encrypt(plaintext: string): EncryptedData {
  const key = getMasterKey();
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
    authTagLength: ENCRYPTION_AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Ciphertext format: [encrypted_data][auth_tag_16bytes]
  const ciphertext = Buffer.concat([encrypted, authTag]);

  return { ciphertext, iv };
}

// ──────────────────────────── Decrypt ────────────────────────────

/**
 * Decrypt AES-256-GCM ciphertext.
 * @param ciphertext Buffer containing [encrypted_data][auth_tag_16bytes]
 * @param iv         The initialization vector used during encryption.
 * @returns          The plaintext string.
 */
export function decrypt(ciphertext: Buffer, iv: Buffer): string {
  const key = getMasterKey();

  // Split ciphertext and auth tag
  const encryptedData = ciphertext.subarray(0, ciphertext.length - ENCRYPTION_AUTH_TAG_LENGTH);
  const authTag = ciphertext.subarray(ciphertext.length - ENCRYPTION_AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, {
    authTagLength: ENCRYPTION_AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  const plaintext = decrypted.toString("utf8");

  // Zero the decrypted buffer
  decrypted.fill(0);

  return plaintext;
}

// ──────────────────────────── Hashing ────────────────────────────

/**
 * SHA-256 hash for lookups (one-way, not reversible).
 * Used for address_hash and phone_hash columns.
 */
export function sha256Hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Hash a phone number with the global salt.
 * Produces a deterministic hash for lookups.
 */
export function hashPhone(phoneNumber: string): string {
  const salted = `${env.PHONE_HASH_SALT}:${phoneNumber}`;
  return sha256Hash(salted);
}

/**
 * Hash a wallet address for DB lookups.
 * Uses lowercase address for consistency.
 */
export function hashAddress(address: string): string {
  return sha256Hash(address.toLowerCase());
}

// ──────────────────────────── Utility ────────────────────────────

/**
 * Generate a cryptographically secure random hex string.
 */
export function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Generate a UUIDv4 (for ref IDs, idempotency keys).
 */
export function generateRefId(): string {
  return crypto.randomUUID();
}

/**
 * Securely zero a buffer.
 */
export function zeroBuffer(buf: Buffer): void {
  buf.fill(0);
}

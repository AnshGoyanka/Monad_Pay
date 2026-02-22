import { HDKey } from "viem/accounts";
import { mnemonicToSeedSync } from "@scure/bip39";
import { privateKeyToAddress, privateKeyToAccount } from "viem/accounts";
import { type Hex } from "viem";

import { prisma } from "../config/database.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import { encrypt, decrypt, hashAddress, hashPhone, generateRefId } from "../security/encryption.js";
import { HD_PATH_PREFIX } from "@chatpay/shared";

// ──────────────────────── Derivation Index Counter ──────────────

let _nextDerivationIndex: number | null = null;

async function getNextDerivationIndex(): Promise<number> {
  if (_nextDerivationIndex === null) {
    const maxWallet = await prisma.wallet.findFirst({
      orderBy: { derivationIdx: "desc" },
      select: { derivationIdx: true },
    });
    // Start from 1 — index 0 is reserved for the relayer
    _nextDerivationIndex = maxWallet ? maxWallet.derivationIdx + 1 : 1;
  }
  const idx = _nextDerivationIndex;
  _nextDerivationIndex++;
  return idx;
}

// ──────────────────────── HD Key Generation ─────────────────────

/**
 * Derive a keypair from the master mnemonic at a given index.
 * All user wallets are derived from the same mnemonic (HD wallet pattern).
 * Index 0 = relayer, Index 1+ = users.
 */
function generateKeypair(index: number): { privateKey: Hex; address: Hex } {
  const seed = mnemonicToSeedSync(env.HD_MNEMONIC);
  const hdKey = HDKey.fromMasterSeed(seed);
  const path = `${HD_PATH_PREFIX}${index}`;
  const derived = hdKey.derive(path);

  if (!derived.privateKey) {
    throw new Error("Failed to derive private key");
  }

  const privateKeyHex = `0x${Buffer.from(derived.privateKey).toString("hex")}` as Hex;
  const address = privateKeyToAddress(privateKeyHex);

  return { privateKey: privateKeyHex, address };
}

// ──────────────────────── Create Wallet ─────────────────────────

export interface CreateWalletResult {
  userId: string;
  addressHash: string;
}

/**
 * Create a new wallet for a user.
 * - Generates HD keypair
 * - Encrypts both address and private key
 * - Stores hashed address for lookups
 * - NEVER returns plaintext address or key
 */
export async function createWallet(userId: string): Promise<CreateWalletResult> {
  const derivationIdx = await getNextDerivationIndex();
  const { privateKey, address } = generateKeypair(derivationIdx);

  // Encrypt
  const addressEncrypted = encrypt(address);
  const keyEncrypted = encrypt(privateKey);

  // Hash for lookup
  const addrHash = hashAddress(address);

  // Store
  await prisma.wallet.create({
    data: {
      userId,
      addressHash: addrHash,
      addressEnc: new Uint8Array(addressEncrypted.ciphertext),
      addressIv: new Uint8Array(addressEncrypted.iv),
      privateKeyEnc: new Uint8Array(keyEncrypted.ciphertext),
      privateKeyIv: new Uint8Array(keyEncrypted.iv),
      derivationIdx,
    },
  });

  logger.info({ userId, derivationIdx }, "Wallet created");

  return { userId, addressHash: addrHash };
}

// ──────────────────────── Decrypt Wallet Address ────────────────

/**
 * Decrypt the wallet address for a user.
 * Only call when you need to interact with the blockchain.
 * The returned address should be used immediately and not stored.
 */
export async function decryptWalletAddress(userId: string): Promise<string> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { addressEnc: true, addressIv: true },
  });

  if (!wallet) {
    throw new Error(`No wallet found for user ${userId}`);
  }

  return decrypt(Buffer.from(wallet.addressEnc), Buffer.from(wallet.addressIv));
}

/**
 * Decrypt the private key for a user.
 * EXTREME CAUTION: Only call during transaction signing.
 * Return value must be zeroed after use.
 */
export async function decryptPrivateKey(userId: string): Promise<string> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { privateKeyEnc: true, privateKeyIv: true },
  });

  if (!wallet) {
    throw new Error(`No wallet found for user ${userId}`);
  }

  return decrypt(Buffer.from(wallet.privateKeyEnc), Buffer.from(wallet.privateKeyIv));
}

// ──────────────────────── Lookup by Address Hash ────────────────

/**
 * Find a user by their wallet address (hashed lookup, no plaintext).
 */
export async function findUserByAddressHash(addressHash: string): Promise<string | null> {
  const wallet = await prisma.wallet.findUnique({
    where: { addressHash },
    select: { userId: true },
  });
  return wallet?.userId ?? null;
}

/**
 * Check if a user already has a wallet.
 */
export async function userHasWallet(userId: string): Promise<boolean> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { id: true },
  });
  return wallet !== null;
}

/**
 * Get the address hash for a user (for pool contract interactions).
 */
export async function getAddressHash(userId: string): Promise<string | null> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { addressHash: true },
  });
  return wallet?.addressHash ?? null;
}
